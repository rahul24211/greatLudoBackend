import { Server as SocketIOServer, Socket } from 'socket.io';
import { SnakeLadderEngine } from '../game-engine/snake-ladder/SnakeLadderEngine';
import { SnakeLadderGameState } from '../game-engine/snake-ladder/SnakeLadderTypes';
import { SnakeLadderBotService } from '../game-engine/snake-ladder/bot/SnakeLadderBotService';
import redisService from '../services/redis/redisService';
import redisLockService from '../services/redis/redisLock';

// In-memory fallback map
export const activeSnakeLadderGames = new Map<string, SnakeLadderGameState>();
export const snakeLadderTurnTimers = new Map<string, NodeJS.Timeout>();
export const snakeLadderBotFallbackTimers = new Map<string, NodeJS.Timeout>();

export function clearSnakeLadderTimer(gameId: string): void {
  const timer = snakeLadderTurnTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    snakeLadderTurnTimers.delete(gameId);
  }
}

export function clearSnakeLadderBotFallback(userId: string): void {
  const timer = snakeLadderBotFallbackTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    snakeLadderBotFallbackTimers.delete(userId);
  }
}

/**
 * Authoritative state loader (Redis with in-memory fallback)
 */
export async function loadSnakeLadderState(gameId: string): Promise<SnakeLadderGameState | null> {
  try {
    const raw = await redisService.get(`snakeladder:game:${gameId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return activeSnakeLadderGames.get(gameId) || null;
}

/**
 * Authoritative state saver
 */
export async function saveSnakeLadderState(state: SnakeLadderGameState): Promise<void> {
  activeSnakeLadderGames.set(state.gameId, state);
  try {
    await redisService.setWithExpiry(`snakeladder:game:${state.gameId}`, JSON.stringify(state), 3600);
  } catch {}
}

/**
 * Turn Timer scheduler with auto-play on expiry
 */
export function scheduleSnakeLadderTurnTimer(
  io: SocketIOServer,
  gameId: string,
  turnNumber: number,
  durationSeconds: number = 15
): void {
  clearSnakeLadderTimer(gameId);

  const timeoutMs = (durationSeconds + 1) * 1000;

  const timer = setTimeout(async () => {
    const lockKey = SnakeLadderEngine.getGameLockKey(gameId);
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(lockKey, 3000);
    } catch {}

    try {
      const gameState = await loadSnakeLadderState(gameId);
      if (!gameState || gameState.status !== 'ACTIVE' || gameState.turnNumber !== turnNumber) {
        return;
      }

      const currentPlayer = gameState.players.find((p) => p.playerId === gameState.currentPlayerId);
      if (!currentPlayer) return;

      currentPlayer.missedTurns = (currentPlayer.missedTurns || 0) + 1;
      const room = `snakeladder:game:${gameId}`;

      if (currentPlayer.missedTurns >= 3) {
        // Disqualify AFK player
        currentPlayer.isDisqualified = true;
        const remaining = gameState.players.filter((p) => !p.isDisqualified);
        const winner = remaining[0] || currentPlayer;

        gameState.status = 'FINISHED';
        gameState.winner = winner.playerId;
        gameState.finishedAt = Date.now();

        await saveSnakeLadderState(gameState);
        clearSnakeLadderTimer(gameId);

        io.to(room).emit('snakeladder:game_finished', {
          gameId,
          winnerId: winner.playerId,
          winnerColor: winner.color,
          finishedAt: gameState.finishedAt,
        });

        io.to(room).emit('snakeladder:state_updated', { gameId, gameState });
        return;
      }

      // Auto-Roll & Auto-Move on Timeout
      const rollRes = SnakeLadderEngine.rollDice(gameState, currentPlayer.playerId);
      if (rollRes.success && rollRes.gameState) {
        io.to(room).emit('snakeladder:dice_rolled', {
          gameId,
          playerId: currentPlayer.playerId,
          diceValue: rollRes.diceValue,
        });

        const moveRes = SnakeLadderEngine.moveToken(rollRes.gameState, currentPlayer.playerId);
        if (moveRes.success && moveRes.gameState) {
          await saveSnakeLadderState(moveRes.gameState);

          io.to(room).emit('snakeladder:token_moved', {
            gameId,
            playerId: currentPlayer.playerId,
            moveResult: moveRes.moveResult,
          });

          if (moveRes.isFinished) {
            clearSnakeLadderTimer(gameId);
            const winner = moveRes.gameState.players.find((p) => p.playerId === moveRes.winnerId);
            io.to(room).emit('snakeladder:game_finished', {
              gameId,
              winnerId: moveRes.winnerId,
              winnerColor: winner?.color || 'RED',
              finishedAt: moveRes.gameState.finishedAt,
            });
          } else {
            const nextP = moveRes.gameState.players.find(
              (p) => p.playerId === moveRes.gameState!.currentPlayerId
            );

            io.to(room).emit('snakeladder:turn_changed', {
              gameId,
              currentPlayerId: moveRes.gameState.currentPlayerId,
              turnNumber: moveRes.gameState.turnNumber,
              turnStartedAt: moveRes.gameState.turnStartedAt,
              turnTimeLimit: moveRes.gameState.turnTimeLimit || 15,
            });

            if (nextP && nextP.playerType === 'BOT') {
              executeSnakeLadderBotTurn(io, gameId);
            } else {
              scheduleSnakeLadderTurnTimer(
                io,
                gameId,
                moveRes.gameState.turnNumber,
                moveRes.gameState.turnTimeLimit || 15
              );
            }
          }

          io.to(room).emit('snakeladder:state_updated', { gameId, gameState: moveRes.gameState });
        }
      }
    } finally {
      if (lockRes && lockRes.acquired && lockRes.token) {
        await redisLockService.releaseLock(lockKey, lockRes.token).catch(() => {});
      }
    }
  }, timeoutMs);

  snakeLadderTurnTimers.set(gameId, timer);
}

/**
 * Executes a simulated bot turn
 */
export function executeSnakeLadderBotTurn(io: SocketIOServer, gameId: string): void {
  setTimeout(async () => {
    const lockKey = SnakeLadderEngine.getGameLockKey(gameId);
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(lockKey, 3000);
    } catch {}

    try {
      const state = await loadSnakeLadderState(gameId);
      if (!state || state.status !== 'ACTIVE') return;

      const bot = state.players.find((p) => p.playerId === state.currentPlayerId);
      if (!bot || bot.playerType !== 'BOT') return;

      const room = `snakeladder:game:${gameId}`;

      const rollRes = SnakeLadderEngine.rollDice(state, bot.playerId);
      if (!rollRes.success || !rollRes.gameState) return;

      io.to(room).emit('snakeladder:dice_rolled', {
        gameId,
        playerId: bot.playerId,
        diceValue: rollRes.diceValue,
      });

      setTimeout(async () => {
        const moveRes = SnakeLadderEngine.moveToken(rollRes.gameState!, bot.playerId);
        if (!moveRes.success || !moveRes.gameState) return;

        await saveSnakeLadderState(moveRes.gameState);

        io.to(room).emit('snakeladder:token_moved', {
          gameId,
          playerId: bot.playerId,
          moveResult: moveRes.moveResult,
        });

        if (moveRes.isFinished) {
          clearSnakeLadderTimer(gameId);
          const winner = moveRes.gameState.players.find((p) => p.playerId === moveRes.winnerId);
          io.to(room).emit('snakeladder:game_finished', {
            gameId,
            winnerId: moveRes.winnerId,
            winnerColor: winner?.color || 'GREEN',
            finishedAt: moveRes.gameState.finishedAt,
          });
        } else {
          const nextP = moveRes.gameState.players.find(
            (p) => p.playerId === moveRes.gameState!.currentPlayerId
          );

          io.to(room).emit('snakeladder:turn_changed', {
            gameId,
            currentPlayerId: moveRes.gameState.currentPlayerId,
            turnNumber: moveRes.gameState.turnNumber,
            turnStartedAt: moveRes.gameState.turnStartedAt,
            turnTimeLimit: moveRes.gameState.turnTimeLimit || 15,
          });

          if (nextP && nextP.playerType === 'BOT') {
            executeSnakeLadderBotTurn(io, gameId);
          } else {
            scheduleSnakeLadderTurnTimer(
              io,
              gameId,
              moveRes.gameState.turnNumber,
              moveRes.gameState.turnTimeLimit || 15
            );
          }
        }

        io.to(room).emit('snakeladder:state_updated', { gameId, gameState: moveRes.gameState });
      }, 700);
    } finally {
      if (lockRes && lockRes.acquired && lockRes.token) {
        await redisLockService.releaseLock(lockKey, lockRes.token).catch(() => {});
      }
    }
  }, 1000);
}

/**
 * Register Snake & Ladder Socket Handlers
 */
export function registerSnakeLadderSocketHandlers(io: SocketIOServer, socket: Socket): void {
  const getUserId = () => {
    return socket.data?.user?.id || socket.data?.userId || socket.id;
  };

  const getUsername = () => {
    return socket.data?.user?.username || socket.data?.username || `Player_${socket.id.slice(0, 4)}`;
  };

  // 1. Start Matchmaking (1v1)
  socket.on('snakeladder:start_matchmaking', async () => {
    const userId = getUserId();
    const username = getUsername();
    const qKey = 'snakeladder:queue:2';

    socket.emit('snakeladder:match_searching', { countdown: 7 });

    const lockKey = 'lock:snakeladder:matchmaking';
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(lockKey, 3000);
    } catch {}

    try {
      let currentQueue: any[] = [];
      try {
        const raw = await redisService.lrange(qKey, 0, -1);
        currentQueue = (raw || []).map((r: string) => JSON.parse(r));
      } catch {}

      const otherWaiting = currentQueue.filter((p: any) => p.userId !== userId);

      if (otherWaiting.length >= 1) {
        // Match with waiting human
        const opponent = otherWaiting[0];
        const remaining = otherWaiting.slice(1);

        try {
          await redisService.del(qKey);
          for (const p of remaining) {
            await redisService.rpush(qKey, JSON.stringify(p));
          }
        } catch {}

        clearSnakeLadderBotFallback(userId);
        clearSnakeLadderBotFallback(opponent.userId);

        const newGame = SnakeLadderEngine.startGame(
          SnakeLadderEngine.createGame({
            playerIds: [userId, opponent.userId],
            usernames: [username, opponent.username],
            colors: ['RED', 'GREEN'],
          })
        );

        await saveSnakeLadderState(newGame);
        const room = `snakeladder:game:${newGame.gameId}`;

        socket.join(room);
        const oppSocket = io.sockets.sockets.get(opponent.socketId);
        if (oppSocket) oppSocket.join(room);

        io.to(room).emit('snakeladder:match_found', {
          gameId: newGame.gameId,
          gameState: newGame,
        });

        io.to(room).emit('snakeladder:game_started', {
          gameId: newGame.gameId,
          gameState: newGame,
        });

        scheduleSnakeLadderTurnTimer(io, newGame.gameId, newGame.turnNumber, newGame.turnTimeLimit);
      } else {
        // Add user to queue & schedule 7-second bot fallback
        try {
          await redisService.rpush(qKey, JSON.stringify({ userId, socketId: socket.id, username }));
        } catch {}

        clearSnakeLadderBotFallback(userId);

        const botTimer = setTimeout(async () => {
          try {
            const raw = await redisService.lrange(qKey, 0, -1);
            const q = (raw || []).map((r: string) => JSON.parse(r));
            const rem = q.filter((p: any) => p.userId !== userId);
            await redisService.del(qKey);
            for (const p of rem) {
              await redisService.rpush(qKey, JSON.stringify(p));
            }
          } catch {}

          const botPlayer = SnakeLadderBotService.createBotPlayer('GREEN');

          const newGame = SnakeLadderEngine.startGame(
            SnakeLadderEngine.createGame({
              playerIds: [userId, botPlayer.playerId],
              usernames: [username, botPlayer.username],
              colors: ['RED', 'GREEN'],
            })
          );

          await saveSnakeLadderState(newGame);
          const room = `snakeladder:game:${newGame.gameId}`;
          socket.join(room);

          socket.emit('snakeladder:match_found', {
            gameId: newGame.gameId,
            gameState: newGame,
            isBot: true,
          });

          socket.emit('snakeladder:game_started', {
            gameId: newGame.gameId,
            gameState: newGame,
          });

          scheduleSnakeLadderTurnTimer(io, newGame.gameId, newGame.turnNumber, newGame.turnTimeLimit);
        }, 7000);

        snakeLadderBotFallbackTimers.set(userId, botTimer);
      }
    } finally {
      if (lockRes && lockRes.acquired && lockRes.token) {
        await redisLockService.releaseLock(lockKey, lockRes.token).catch(() => {});
      }
    }
  });

  // 2. Cancel Matchmaking
  socket.on('snakeladder:cancel_matchmaking', async () => {
    const userId = getUserId();
    const qKey = 'snakeladder:queue:2';
    clearSnakeLadderBotFallback(userId);

    try {
      const raw = await redisService.lrange(qKey, 0, -1);
      const q = (raw || []).map((r: string) => JSON.parse(r));
      const remaining = q.filter((p: any) => p.userId !== userId);
      await redisService.del(qKey);
      for (const p of remaining) {
        await redisService.rpush(qKey, JSON.stringify(p));
      }
    } catch {}

    socket.emit('snakeladder:match_cancelled');
  });

  // 3. Roll Dice
  socket.on('snakeladder:roll_dice', async (data: { gameId: string }) => {
    const userId = getUserId();
    const { gameId } = data;
    if (!gameId) return;

    const lockKey = SnakeLadderEngine.getGameLockKey(gameId);
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(lockKey, 3000);
    } catch {}

    try {
      const state = await loadSnakeLadderState(gameId);
      if (!state || state.status !== 'ACTIVE' || state.currentPlayerId !== userId) return;

      const room = `snakeladder:game:${gameId}`;

      const rollRes = SnakeLadderEngine.rollDice(state, userId);
      if (!rollRes.success || !rollRes.gameState) return;

      io.to(room).emit('snakeladder:dice_rolled', {
        gameId,
        playerId: userId,
        diceValue: rollRes.diceValue,
      });

      // Auto-move after brief 600ms visual roll animation
      setTimeout(async () => {
        const moveRes = SnakeLadderEngine.moveToken(rollRes.gameState!, userId);
        if (!moveRes.success || !moveRes.gameState) return;

        await saveSnakeLadderState(moveRes.gameState);

        io.to(room).emit('snakeladder:token_moved', {
          gameId,
          playerId: userId,
          moveResult: moveRes.moveResult,
        });

        if (moveRes.isFinished) {
          clearSnakeLadderTimer(gameId);
          const winner = moveRes.gameState.players.find((p) => p.playerId === moveRes.winnerId);
          io.to(room).emit('snakeladder:game_finished', {
            gameId,
            winnerId: moveRes.winnerId,
            winnerColor: winner?.color || 'RED',
            finishedAt: moveRes.gameState.finishedAt,
          });
        } else {
          const nextP = moveRes.gameState.players.find(
            (p) => p.playerId === moveRes.gameState!.currentPlayerId
          );

          io.to(room).emit('snakeladder:turn_changed', {
            gameId,
            currentPlayerId: moveRes.gameState.currentPlayerId,
            turnNumber: moveRes.gameState.turnNumber,
            turnStartedAt: moveRes.gameState.turnStartedAt,
            turnTimeLimit: moveRes.gameState.turnTimeLimit || 15,
          });

          if (nextP && nextP.playerType === 'BOT') {
            executeSnakeLadderBotTurn(io, gameId);
          } else {
            scheduleSnakeLadderTurnTimer(
              io,
              gameId,
              moveRes.gameState.turnNumber,
              moveRes.gameState.turnTimeLimit || 15
            );
          }
        }

        io.to(room).emit('snakeladder:state_updated', { gameId, gameState: moveRes.gameState });
      }, 600);
    } finally {
      if (lockRes && lockRes.acquired && lockRes.token) {
        await redisLockService.releaseLock(lockKey, lockRes.token).catch(() => {});
      }
    }
  });

  // 4. Resume Game State on Reconnect
  socket.on('snakeladder:resume_game', async (data: { gameId: string }) => {
    const { gameId } = data;
    if (!gameId) return;

    const state = await loadSnakeLadderState(gameId);
    if (!state) {
      socket.emit('snakeladder:error', { message: 'Game not found' });
      return;
    }

    const room = `snakeladder:game:${gameId}`;
    socket.join(room);

    socket.emit('snakeladder:state_updated', { gameId, gameState: state });
  });
}
