import { Server as SocketIOServer } from 'socket.io';
import { redisService } from '../../../services/redis/redisService';
import { redisLockService } from '../../../services/redis/redisLock';
import { lockKey } from '../../../services/redis/redisKeys';
import ludoGameStateRepository from '../../../repositories/redis/LudoGameStateRepository';
import { LudoGameEngine } from '../../../game-engine/ludo/LudoGameEngine';
import { LudoTokenService } from '../../../game-engine/ludo/LudoTokenService';
import { LudoBotService } from '../../../game-engine/ludo/bot/LudoBotService';
import { LudoGameState, LudoPlayer, LudoColor } from '../../../game-engine/ludo/LudoTypes';
import env from '../../../config/env';

export interface QueuedPlayer {
  userId: string;
  socketId: string;
  username: string;
  queuedAt: number;
}

export interface MatchmakingResult {
  matched: boolean;
  gameId?: string;
  opponent?: {
    userId: string;
    username: string;
    isBot: boolean;
    color: LudoColor;
  };
  gameState?: LudoGameState;
  reason?: string;
}

export class LudoMatchmakingService {
  private static QUEUE_KEY = 'ludo:queue:classic';
  private static LOCK_KEY = lockKey('matchmaking', 'classic');
  private static fallbackTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Get all currently queued players from Redis queue.
   */
  public static async getQueue(): Promise<QueuedPlayer[]> {
    try {
      const items = await redisService.lrange(this.QUEUE_KEY, 0, -1);
      return items
        .map((item) => {
          try {
            return JSON.parse(item) as QueuedPlayer;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as QueuedPlayer[];
    } catch {
      return [];
    }
  }

  /**
   * Check if a specific userId is currently queued.
   */
  public static async isPlayerInQueue(userId: string): Promise<boolean> {
    const queue = await this.getQueue();
    return queue.some((p) => p.userId === userId);
  }

  /**
   * Add a player to the Classic Ludo matchmaking queue or immediately match if compatible player waits.
   */
  public static async findMatch(
    player: { userId: string; socketId: string; username: string },
    io: SocketIOServer,
    onBotTurnTrigger?: (gameId: string) => void
  ): Promise<MatchmakingResult> {
    if (!player || !player.userId) {
      return { matched: false, reason: 'Invalid player information' };
    }

    // Distributed lock to prevent double matching race conditions
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(this.LOCK_KEY, 4000);
    } catch {}

    try {
      // 1. Check if user is already in queue
      const currentQueue = await this.getQueue();
      const existingIdx = currentQueue.findIndex((p) => p.userId === player.userId);

      if (existingIdx !== -1) {
        // Update socketId in queue in case of refresh
        currentQueue[existingIdx].socketId = player.socketId;
        await redisService.del(this.QUEUE_KEY);
        for (const qp of currentQueue) {
          await redisService.rpush(this.QUEUE_KEY, JSON.stringify(qp));
        }
        return { matched: false, reason: 'Already in matchmaking queue' };
      }

      // 2. Look for another waiting HUMAN player in the queue (excluding self)
      const waitingPlayer = currentQueue.find((p) => p.userId !== player.userId);

      if (waitingPlayer) {
        // ----------------------------------------------------
        // MATCH FOUND: HUMAN VS HUMAN
        // ----------------------------------------------------
        // Remove matched waiting player from Redis queue
        const remaining = currentQueue.filter((p) => p.userId !== waitingPlayer.userId && p.userId !== player.userId);
        await redisService.del(this.QUEUE_KEY);
        for (const qp of remaining) {
          await redisService.rpush(this.QUEUE_KEY, JSON.stringify(qp));
        }

        // Cancel waiting player's bot fallback timer
        this.clearFallbackTimer(waitingPlayer.userId);
        this.clearFallbackTimer(player.userId);

        // Create new authoritative Classic Ludo game
        const initialGame = LudoGameEngine.createGame({ mode: 'CLASSIC' });

        const p1Tokens = LudoTokenService.createPlayerTokens(player.userId, 'RED');
        const p2Tokens = LudoTokenService.createPlayerTokens(waitingPlayer.userId, 'GREEN');

        const player1: LudoPlayer = {
          playerId: player.userId,
          userId: player.userId,
          username: player.username || player.userId,
          color: 'RED',
          tokens: p1Tokens,
          isConnected: true,
          playerType: 'HUMAN',
          missedTurns: 0,
          isDisqualified: false,
        };

        const player2: LudoPlayer = {
          playerId: waitingPlayer.userId,
          userId: waitingPlayer.userId,
          username: waitingPlayer.username || waitingPlayer.userId,
          color: 'GREEN',
          tokens: p2Tokens,
          isConnected: true,
          playerType: 'HUMAN',
          missedTurns: 0,
          isDisqualified: false,
        };

        let gameState: LudoGameState = {
          ...initialGame,
          players: [player1, player2],
          currentPlayerId: player.userId,
        };

        gameState = LudoGameEngine.startGame(gameState);
        await ludoGameStateRepository.saveGameState(gameState);

        const room = `ludo:game:${gameState.gameId}`;

        // Join sockets to room
        const socket1 = io.sockets.sockets.get(player.socketId);
        const socket2 = io.sockets.sockets.get(waitingPlayer.socketId);

        if (socket1) socket1.join(room);
        if (socket2) socket2.join(room);

        // Broadcast match_found to both players
        io.to(player.socketId).emit('ludo:match_found', {
          gameId: gameState.gameId,
          gameMode: 'CLASSIC',
          gameState,
          opponent: {
            userId: waitingPlayer.userId,
            username: waitingPlayer.username,
            isBot: false,
            color: 'GREEN',
          },
        });

        io.to(waitingPlayer.socketId).emit('ludo:match_found', {
          gameId: gameState.gameId,
          gameMode: 'CLASSIC',
          gameState,
          opponent: {
            userId: player.userId,
            username: player.username,
            isBot: false,
            color: 'RED',
          },
        });

        io.to(room).emit('ludo:game_started', {
          gameId: gameState.gameId,
          gameState,
          currentPlayerId: gameState.currentPlayerId,
          turnStartedAt: gameState.turnStartedAt,
        });

        return {
          matched: true,
          gameId: gameState.gameId,
          gameState,
          opponent: {
            userId: waitingPlayer.userId,
            username: waitingPlayer.username,
            isBot: false,
            color: 'GREEN',
          },
        };
      }

      // ----------------------------------------------------
      // NO WAITING PLAYER: PUSH TO QUEUE & START BOT TIMER
      // ----------------------------------------------------
      const newEntry: QueuedPlayer = {
        userId: player.userId,
        socketId: player.socketId,
        username: player.username || player.userId,
        queuedAt: Date.now(),
      };

      await redisService.rpush(this.QUEUE_KEY, JSON.stringify(newEntry));

      // Emit searching confirmation
      const fallbackSeconds = env.ludoBotFallbackSeconds || 7;
      io.to(player.socketId).emit('ludo:match_searching', {
        mode: 'CLASSIC',
        fallbackSeconds,
      });

      // Schedule Bot Fallback Timer
      this.clearFallbackTimer(player.userId);
      const timer = setTimeout(async () => {
        await this.handleBotFallback(player.userId, io, onBotTurnTrigger);
      }, fallbackSeconds * 1000);

      this.fallbackTimers.set(player.userId, timer);

      return { matched: false, reason: 'Searching for opponent' };
    } finally {
      if (lockRes && lockRes.acquired && lockRes.token) {
        await redisLockService.releaseLock(this.LOCK_KEY, lockRes.token).catch(() => {});
      }
    }
  }

  /**
   * Trigger fallback match against a Smart Bot when no human player is found within timeout.
   */
  public static async handleBotFallback(
    userId: string,
    io: SocketIOServer,
    onBotTurnTrigger?: (gameId: string) => void
  ): Promise<MatchmakingResult | null> {
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(this.LOCK_KEY, 4000);
    } catch {}

    try {
      const currentQueue = await this.getQueue();
      const queuedPlayer = currentQueue.find((p) => p.userId === userId);

      // If player already matched with a human or cancelled, abort
      if (!queuedPlayer) {
        return null;
      }

      // Remove player from Redis queue
      const remaining = currentQueue.filter((p) => p.userId !== userId);
      await redisService.del(this.QUEUE_KEY);
      for (const qp of remaining) {
        await redisService.rpush(this.QUEUE_KEY, JSON.stringify(qp));
      }

      this.clearFallbackTimer(userId);

      // Create new Classic Ludo match with BOT opponent
      const initialGame = LudoGameEngine.createGame({ mode: 'CLASSIC' });

      const humanTokens = LudoTokenService.createPlayerTokens(queuedPlayer.userId, 'RED');
      const humanPlayer: LudoPlayer = {
        playerId: queuedPlayer.userId,
        userId: queuedPlayer.userId,
        username: queuedPlayer.username || queuedPlayer.userId,
        color: 'RED',
        tokens: humanTokens,
        isConnected: true,
        playerType: 'HUMAN',
        missedTurns: 0,
        isDisqualified: false,
      };

      const botPlayer = LudoBotService.createBotPlayer('GREEN', 'MEDIUM');

      let gameState: LudoGameState = {
        ...initialGame,
        players: [humanPlayer, botPlayer],
        currentPlayerId: queuedPlayer.userId,
      };

      gameState = LudoGameEngine.startGame(gameState);
      await ludoGameStateRepository.saveGameState(gameState);

      const room = `ludo:game:${gameState.gameId}`;

      // Join player's socket to room
      const socket = io.sockets.sockets.get(queuedPlayer.socketId);
      if (socket) socket.join(room);

      // Emit bot_joined & match_found events
      io.to(queuedPlayer.socketId).emit('ludo:bot_joined', {
        gameId: gameState.gameId,
        bot: {
          playerId: botPlayer.playerId,
          username: botPlayer.username,
          color: botPlayer.color,
          playerType: 'BOT',
        },
      });

      io.to(queuedPlayer.socketId).emit('ludo:match_found', {
        gameId: gameState.gameId,
        gameMode: 'CLASSIC',
        gameState,
        opponent: {
          userId: botPlayer.playerId,
          username: botPlayer.username,
          isBot: true,
          color: 'GREEN',
        },
      });

      io.to(room).emit('ludo:game_started', {
        gameId: gameState.gameId,
        gameState,
        currentPlayerId: gameState.currentPlayerId,
        turnStartedAt: gameState.turnStartedAt,
      });

      // If initial turn belongs to BOT, trigger bot turn
      if (gameState.currentPlayerId === botPlayer.playerId && typeof onBotTurnTrigger === 'function') {
        onBotTurnTrigger(gameState.gameId);
      }

      return {
        matched: true,
        gameId: gameState.gameId,
        gameState,
        opponent: {
          userId: botPlayer.playerId,
          username: botPlayer.username || 'Smart Bot',
          isBot: true,
          color: 'GREEN',
        },
      };
    } finally {
      if (lockRes && lockRes.acquired && lockRes.token) {
        await redisLockService.releaseLock(this.LOCK_KEY, lockRes.token).catch(() => {});
      }
    }
  }

  /**
   * Cancel matchmaking and remove player from queue.
   */
  public static async cancelMatch(userId: string): Promise<{ cancelled: boolean }> {
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(this.LOCK_KEY, 3000);
    } catch {}

    try {
      this.clearFallbackTimer(userId);

      const currentQueue = await this.getQueue();
      const isPresent = currentQueue.some((p) => p.userId === userId);

      if (isPresent) {
        const remaining = currentQueue.filter((p) => p.userId !== userId);
        await redisService.del(this.QUEUE_KEY);
        for (const qp of remaining) {
          await redisService.rpush(this.QUEUE_KEY, JSON.stringify(qp));
        }
        return { cancelled: true };
      }

      return { cancelled: false };
    } finally {
      if (lockRes && lockRes.acquired && lockRes.token) {
        await redisLockService.releaseLock(this.LOCK_KEY, lockRes.token).catch(() => {});
      }
    }
  }

  /**
   * Safely handle player disconnect during queue search.
   */
  public static async handleDisconnect(userId: string): Promise<void> {
    await this.cancelMatch(userId);
  }

  /**
   * Clear local fallback timer for a player.
   */
  private static clearFallbackTimer(userId: string): void {
    const timer = this.fallbackTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.fallbackTimers.delete(userId);
    }
  }
}

export default LudoMatchmakingService;
