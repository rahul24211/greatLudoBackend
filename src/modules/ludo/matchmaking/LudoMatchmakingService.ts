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
  maxPlayers: number; // 2 or 4
  stake?: number;
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

const ALL_LUDO_COLORS: LudoColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];

export class LudoMatchmakingService {
  private static QUEUE_KEY_2P = 'ludo:queue:classic:2p';
  private static QUEUE_KEY_4P = 'ludo:queue:classic:4p';
  private static LOCK_KEY = lockKey('matchmaking', 'classic');
  private static fallbackTimers = new Map<string, NodeJS.Timeout>();

  private static getQueueKey(maxPlayers: number): string {
    return maxPlayers === 4 ? this.QUEUE_KEY_4P : this.QUEUE_KEY_2P;
  }

  /**
   * Get all currently queued players from Redis queue for a specific player mode.
   */
  public static async getQueue(maxPlayers: number = 2): Promise<QueuedPlayer[]> {
    try {
      const qKey = this.getQueueKey(maxPlayers);
      const items = await redisService.lrange(qKey, 0, -1);
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
   * Check if a specific userId is currently queued across any queue.
   */
  public static async isPlayerInQueue(userId: string): Promise<boolean> {
    const q2 = await this.getQueue(2);
    const q4 = await this.getQueue(4);
    return q2.some((p) => p.userId === userId) || q4.some((p) => p.userId === userId);
  }

  /**
   * Add a player to the Classic Ludo matchmaking queue or immediately match if compatible players wait.
   */
  public static async findMatch(
    player: { userId: string; socketId: string; username: string; maxPlayers?: number; stake?: number },
    io: SocketIOServer,
    onBotTurnTrigger?: (gameId: string) => void,
    onTurnTimerTrigger?: (gameId: string, turnNumber: number, timeLimit: number) => void
  ): Promise<MatchmakingResult> {
    if (!player || !player.userId) {
      return { matched: false, reason: 'Invalid player information' };
    }

    const maxPlayers = player.maxPlayers === 4 ? 4 : 2;
    const qKey = this.getQueueKey(maxPlayers);

    // Distributed lock to prevent double matching race conditions
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(this.LOCK_KEY, 4000);
    } catch {}

    try {
      // 1. Check if user is already in this queue
      const currentQueue = await this.getQueue(maxPlayers);
      const existingIdx = currentQueue.findIndex((p) => p.userId === player.userId);

      if (existingIdx !== -1) {
        currentQueue[existingIdx].socketId = player.socketId;
        await redisService.del(qKey);
        for (const qp of currentQueue) {
          await redisService.rpush(qKey, JSON.stringify(qp));
        }
        return { matched: false, reason: 'Already in matchmaking queue' };
      }

      // 2. Filter other waiting HUMAN players (excluding self)
      const otherWaitingPlayers = currentQueue.filter((p) => p.userId !== player.userId);

      // Check if we have enough players to immediately launch a full match
      const neededPlayers = maxPlayers - 1; // 1 more for 2P, 3 more for 4P

      if (otherWaitingPlayers.length >= neededPlayers) {
        // MATCH FOUND: FULL HUMAN LOBBY
        const matchedHumans = otherWaitingPlayers.slice(0, neededPlayers);
        const allParticipants = [
          { userId: player.userId, socketId: player.socketId, username: player.username || player.userId },
          ...matchedHumans,
        ];

        // Remove matched players from Redis queue
        const matchedUserIds = new Set(allParticipants.map((p) => p.userId));
        const remaining = currentQueue.filter((p) => !matchedUserIds.has(p.userId));
        await redisService.del(qKey);
        for (const qp of remaining) {
          await redisService.rpush(qKey, JSON.stringify(qp));
        }

        // Clear fallback timers
        for (const p of allParticipants) {
          this.clearFallbackTimer(p.userId);
        }

        // Create new authoritative Classic Ludo game
        const initialGame = LudoGameEngine.createGame({ mode: 'CLASSIC' });
        const assignedPlayers: LudoPlayer[] = allParticipants.map((p, idx) => {
          const color = ALL_LUDO_COLORS[idx];
          return {
            playerId: p.userId,
            userId: p.userId,
            username: p.username || p.userId,
            color,
            tokens: LudoTokenService.createPlayerTokens(p.userId, color),
            isConnected: true,
            playerType: 'HUMAN',
            missedTurns: 0,
            isDisqualified: false,
          };
        });

        let gameState: LudoGameState = {
          ...initialGame,
          players: assignedPlayers,
          currentPlayerId: player.userId,
        };

        gameState = LudoGameEngine.startGame(gameState);
        await ludoGameStateRepository.saveGameState(gameState);

        const room = `ludo:game:${gameState.gameId}`;

        // Join sockets to room and emit match_found
        for (let i = 0; i < allParticipants.length; i++) {
          const p = allParticipants[i];
          const sock = io.sockets.sockets.get(p.socketId);
          if (sock) sock.join(room);

          const opponents = assignedPlayers.filter((ap) => ap.userId !== p.userId);
          const primaryOpponent = opponents[0];

          io.to(p.socketId).emit('ludo:match_found', {
            gameId: gameState.gameId,
            gameMode: 'CLASSIC',
            gameState,
            maxPlayers,
            opponent: primaryOpponent
              ? {
                  userId: primaryOpponent.userId,
                  username: primaryOpponent.username,
                  isBot: false,
                  color: primaryOpponent.color,
                }
              : undefined,
          });
        }

        io.to(room).emit('ludo:game_started', {
          gameId: gameState.gameId,
          gameState,
          currentPlayerId: gameState.currentPlayerId,
          turnStartedAt: gameState.turnStartedAt,
        });

        // Start server authoritative 30s turn timer
        if (typeof onTurnTimerTrigger === 'function') {
          onTurnTimerTrigger(gameState.gameId, gameState.turnNumber || 1, gameState.turnTimeLimit || 30);
        }

        const opponentData = assignedPlayers.find((p) => p.userId !== player.userId);

        return {
          matched: true,
          gameId: gameState.gameId,
          gameState,
          opponent: opponentData
            ? {
                userId: opponentData.userId,
                username: opponentData.username || opponentData.userId,
                isBot: false,
                color: opponentData.color,
              }
            : undefined,
        };
      }

      // 3. Not enough players yet: push to queue and start bot fallback timer
      const newEntry: QueuedPlayer = {
        userId: player.userId,
        socketId: player.socketId,
        username: player.username || player.userId,
        queuedAt: Date.now(),
        maxPlayers,
        stake: player.stake,
      };

      await redisService.rpush(qKey, JSON.stringify(newEntry));

      // Emit searching confirmation
      const fallbackSeconds = env.ludoBotFallbackSeconds || 7;
      io.to(player.socketId).emit('ludo:match_searching', {
        mode: 'CLASSIC',
        maxPlayers,
        fallbackSeconds,
      });

      // Schedule Bot Fallback Timer
      this.clearFallbackTimer(player.userId);
      const timer = setTimeout(async () => {
        await this.handleBotFallback(player.userId, maxPlayers, io, onBotTurnTrigger, onTurnTimerTrigger);
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
   * Trigger fallback match against Smart Bot(s) when waiting time exceeds threshold.
   */
  public static async handleBotFallback(
    userId: string,
    maxPlayers: number,
    io: SocketIOServer,
    onBotTurnTrigger?: (gameId: string) => void,
    onTurnTimerTrigger?: (gameId: string, turnNumber: number, timeLimit: number) => void
  ): Promise<MatchmakingResult | null> {
    const qKey = this.getQueueKey(maxPlayers);
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(this.LOCK_KEY, 4000);
    } catch {}

    try {
      const currentQueue = await this.getQueue(maxPlayers);
      const queuedPlayer = currentQueue.find((p) => p.userId === userId);

      // If player already matched or cancelled, abort
      if (!queuedPlayer) {
        return null;
      }

      // Collect all waiting humans in this queue (up to maxPlayers)
      const waitingHumans = currentQueue.slice(0, maxPlayers);
      const matchedUserIds = new Set(waitingHumans.map((p) => p.userId));

      // Remove from Redis queue
      const remaining = currentQueue.filter((p) => !matchedUserIds.has(p.userId));
      await redisService.del(qKey);
      for (const qp of remaining) {
        await redisService.rpush(qKey, JSON.stringify(qp));
      }

      for (const h of waitingHumans) {
        this.clearFallbackTimer(h.userId);
      }

      // Construct game players (Humans + Bots up to maxPlayers)
      const initialGame = LudoGameEngine.createGame({ mode: 'CLASSIC' });
      const finalPlayers: LudoPlayer[] = [];

      // 1. Add human players
      for (let i = 0; i < waitingHumans.length; i++) {
        const h = waitingHumans[i];
        const color = ALL_LUDO_COLORS[i];
        finalPlayers.push({
          playerId: h.userId,
          userId: h.userId,
          username: h.username || h.userId,
          color,
          tokens: LudoTokenService.createPlayerTokens(h.userId, color),
          isConnected: true,
          playerType: 'HUMAN',
          missedTurns: 0,
          isDisqualified: false,
        });
      }

      // 2. Fill remaining slots with Smart Bots
      const neededBots = maxPlayers - waitingHumans.length;
      for (let b = 0; b < neededBots; b++) {
        const botColor = ALL_LUDO_COLORS[waitingHumans.length + b];
        const botPlayer = LudoBotService.createBotPlayer(botColor, 'MEDIUM');
        finalPlayers.push(botPlayer);
      }

      let gameState: LudoGameState = {
        ...initialGame,
        players: finalPlayers,
        currentPlayerId: queuedPlayer.userId,
      };

      gameState = LudoGameEngine.startGame(gameState);
      await ludoGameStateRepository.saveGameState(gameState);

      const room = `ludo:game:${gameState.gameId}`;

      // Join sockets and notify all human participants
      for (const h of waitingHumans) {
        const socket = io.sockets.sockets.get(h.socketId);
        if (socket) socket.join(room);

        const primaryOpponent = finalPlayers.find((p) => p.userId !== h.userId);

        io.to(h.socketId).emit('ludo:bot_joined', {
          gameId: gameState.gameId,
          bots: finalPlayers.filter((p) => p.playerType === 'BOT'),
        });

        io.to(h.socketId).emit('ludo:match_found', {
          gameId: gameState.gameId,
          gameMode: 'CLASSIC',
          gameState,
          maxPlayers,
          opponent: primaryOpponent
            ? {
                userId: primaryOpponent.playerId,
                username: primaryOpponent.username,
                isBot: primaryOpponent.playerType === 'BOT',
                color: primaryOpponent.color,
              }
            : undefined,
        });
      }

      io.to(room).emit('ludo:game_started', {
        gameId: gameState.gameId,
        gameState,
        currentPlayerId: gameState.currentPlayerId,
        turnStartedAt: gameState.turnStartedAt,
      });

      // If initial turn belongs to a BOT, trigger bot turn. Otherwise start turn timer for human.
      const currentActive = finalPlayers.find((p) => p.playerId === gameState.currentPlayerId);
      if (currentActive?.playerType === 'BOT' && typeof onBotTurnTrigger === 'function') {
        onBotTurnTrigger(gameState.gameId);
      } else if (typeof onTurnTimerTrigger === 'function') {
        onTurnTimerTrigger(gameState.gameId, gameState.turnNumber || 1, gameState.turnTimeLimit || 30);
      }

      const primaryOpp = finalPlayers.find((p) => p.userId !== userId);

      return {
        matched: true,
        gameId: gameState.gameId,
        gameState,
        opponent: primaryOpp
          ? {
              userId: primaryOpp.playerId,
              username: primaryOpp.username || primaryOpp.playerId,
              isBot: primaryOpp.playerType === 'BOT',
              color: primaryOpp.color,
            }
          : undefined,
      };
    } finally {
      if (lockRes && lockRes.acquired && lockRes.token) {
        await redisLockService.releaseLock(this.LOCK_KEY, lockRes.token).catch(() => {});
      }
    }
  }

  /**
   * Cancel matchmaking and remove player from both 2P and 4P queues.
   */
  public static async cancelMatch(userId: string): Promise<{ cancelled: boolean }> {
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(this.LOCK_KEY, 3000);
    } catch {}

    try {
      this.clearFallbackTimer(userId);
      let wasCancelled = false;

      for (const maxP of [2, 4]) {
        const qKey = this.getQueueKey(maxP);
        const currentQueue = await this.getQueue(maxP);
        const isPresent = currentQueue.some((p) => p.userId === userId);

        if (isPresent) {
          const remaining = currentQueue.filter((p) => p.userId !== userId);
          await redisService.del(qKey);
          for (const qp of remaining) {
            await redisService.rpush(qKey, JSON.stringify(qp));
          }
          wasCancelled = true;
        }
      }

      return { cancelled: wasCancelled };
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
