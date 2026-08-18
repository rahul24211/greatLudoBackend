import { Server as SocketIOServer, Socket } from 'socket.io';
import { LudoGameEngine } from '../game-engine/ludo/LudoGameEngine';
import { LudoGameState, LudoColor, LudoPlayer } from '../game-engine/ludo/LudoTypes';
import { LUDO_COLORS } from '../game-engine/ludo/LudoConstants';
import { LudoTokenService } from '../game-engine/ludo/LudoTokenService';
import { LudoValidMovesService } from '../game-engine/ludo/LudoValidMovesService';
import { LudoTurnResolutionService } from '../game-engine/ludo/LudoTurnResolutionService';
import redisLockService from '../services/redis/redisLock';
import ludoGameStateRepository from '../repositories/redis/LudoGameStateRepository';
import LudoMatchHistoryService from '../services/ludo/LudoMatchHistoryService';

import { LudoTurnService } from '../game-engine/ludo/LudoTurnService';

// In-memory fallback map for environments without Redis
export const activeLudoGames = new Map<string, LudoGameState>();

// Server-side turn timeout timer registry (15 seconds per turn)
export const gameTurnTimers = new Map<string, NodeJS.Timeout>();

export function clearGameTurnTimer(gameId: string): void {
  const timer = gameTurnTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    gameTurnTimers.delete(gameId);
  }
}

/**
 * Schedule server-authoritative turn timeout (15s limit).
 * If a player fails to take their turn within 15 seconds, turn auto-advances.
 * If a player misses 3 consecutive turns, they are disqualified and the remaining player is declared WINNER!
 */
export function scheduleTurnTimer(
  io: SocketIOServer,
  gameId: string,
  turnNumber: number,
  durationSeconds: number = 15
): void {
  clearGameTurnTimer(gameId);

  const timeoutMs = (durationSeconds + 1) * 1000;

  const timer = setTimeout(async () => {
    try {
      const lockKey = LudoGameEngine.getGameLockKey(gameId);
      let lockRes = null;
      try {
        lockRes = await redisLockService.acquireLock(lockKey, 3000);
      } catch {}

      try {
        const gameState = await loadAuthoritativeState(gameId);
        if (!gameState || gameState.status !== 'ACTIVE' || gameState.turnNumber !== turnNumber) {
          return;
        }

        const currentPlayer = gameState.players.find((p) => p.playerId === gameState.currentPlayerId);
        if (!currentPlayer) return;

        // Increment missed turns count
        currentPlayer.missedTurns = (currentPlayer.missedTurns || 0) + 1;
        const room = `ludo:game:${gameId}`;

        // If player has missed 3 turns consecutively -> Disqualify player and award win to opponent
        if (currentPlayer.missedTurns >= 3) {
          currentPlayer.isDisqualified = true;
          currentPlayer.isConnected = false;

          const remainingActivePlayers = gameState.players.filter((p) => !p.isDisqualified);

          if (remainingActivePlayers.length <= 1) {
            const winner = remainingActivePlayers[0] || currentPlayer;
            gameState.status = 'FINISHED';
            gameState.winner = winner.playerId;
            gameState.finishedAt = Date.now();
            gameState.lastAction = {
              type: 'PLAYER_DISQUALIFIED_GAME_OVER',
              playerId: currentPlayer.playerId,
              payload: {
                disqualifiedPlayerId: currentPlayer.playerId,
                winnerId: winner.playerId,
                reason: 'TIMEOUT_3_TURNS',
              },
              timestamp: Date.now(),
            };

            await saveAuthoritativeState(gameState);
            clearGameTurnTimer(gameId);

            // Persist match in MySQL
            LudoMatchHistoryService.createMatchResult(gameState).catch((err) => {
              console.error(`⚠️ Failed to persist final match result for game ${gameId}:`, err);
            });

            io.to(room).emit('ludo:player_disqualified', {
              gameId,
              playerId: currentPlayer.playerId,
              missedTurns: currentPlayer.missedTurns,
              reason: 'Exceeded maximum 3 missed turns timeout limit.',
            });

            io.to(room).emit('ludo:game_finished', {
              gameId,
              winnerId: winner.playerId,
              winnerColor: winner.color,
              finishedAt: gameState.finishedAt,
            });

            io.to(room).emit('ludo:state_updated', { gameId, gameState });
            return;
          }
        }

        // Auto-advance turn to next player
        const nextPlayer = LudoTurnService.getNextPlayer(gameState);
        const nextPlayerId = nextPlayer ? nextPlayer.playerId : gameState.currentPlayerId;

        const updatedState: LudoGameState = {
          ...gameState,
          currentPlayerId: nextPlayerId,
          diceValue: null,
          diceRolled: false,
          turnNumber: (gameState.turnNumber || 1) + 1,
          turnStartedAt: Date.now(),
          lastAction: {
            type: 'TURN_TIMEOUT',
            playerId: nextPlayerId || undefined,
            payload: {
              timedOutPlayerId: currentPlayer.playerId,
              missedTurns: currentPlayer.missedTurns,
            },
            timestamp: Date.now(),
          },
        };

        await saveAuthoritativeState(updatedState);

        io.to(room).emit('ludo:turn_changed', {
          gameId,
          currentPlayerId: updatedState.currentPlayerId,
          turnNumber: updatedState.turnNumber,
          turnStartedAt: updatedState.turnStartedAt,
          turnTimeLimit: updatedState.turnTimeLimit || 15,
        });

        io.to(room).emit('ludo:state_updated', { gameId, gameState: updatedState });

        // Schedule timer for the new turn
        scheduleTurnTimer(io, gameId, updatedState.turnNumber!, updatedState.turnTimeLimit || 15);
      } finally {
        if (lockRes && lockRes.acquired && lockRes.token) {
          await redisLockService.releaseLock(lockKey, lockRes.token).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Error handling turn timeout:', err);
    }
  }, timeoutMs);

  gameTurnTimers.set(gameId, timer);
}

/**
 * Standardized error emitter for Ludo Socket.IO handlers.
 */
export function sendLudoError(
  socket: Socket,
  code: string,
  message: string
): void {
  socket.emit('ludo:error', {
    success: false,
    code,
    message,
  });
}

/**
 * Helper to retrieve authenticated userId from socket data or fallback identifier.
 */
export function getAuthenticatedUserId(socket: Socket): string | null {
  if (socket.data && socket.data.user && socket.data.user.id) {
    return socket.data.user.id;
  }
  if (socket.data && socket.data.userId) {
    return socket.data.userId;
  }
  // Allow test / dev fallback socket.id if explicitly permitted
  return socket.id || null;
}

/**
 * Load authoritative game state from Redis (or fallback map if Redis unavailable).
 */
async function loadAuthoritativeState(gameId: string): Promise<LudoGameState | null> {
  try {
    const redisState = await ludoGameStateRepository.getGameState(gameId);
    if (redisState) {
      activeLudoGames.set(gameId, redisState);
      return redisState;
    }
  } catch {
    // Fallback if Redis is unavailable
  }
  return activeLudoGames.get(gameId) || null;
}

/**
 * Save authoritative game state to Redis (and update fallback map).
 */
async function saveAuthoritativeState(gameState: LudoGameState): Promise<boolean> {
  if (!gameState || !gameState.gameId) return false;
  activeLudoGames.set(gameState.gameId, gameState);

  try {
    return await ludoGameStateRepository.saveGameState(gameState);
  } catch {
    return true;
  }
}

/**
 * Register all server-authoritative Ludo Socket.IO event handlers.
 */
export function registerLudoSocketHandlers(io: SocketIOServer, socket: Socket): void {
  // 1. Create Game
  socket.on('ludo:create_game', async (data?: { mode?: string }, callback?: Function) => {
    try {
      const userId = getAuthenticatedUserId(socket);
      if (!userId) {
        return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to create a game');
      }

      const gameId = `game_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const gameState = LudoGameEngine.createGame({
        gameId,
        mode: data?.mode || 'CLASSIC',
        playerIds: [userId],
      });

      await saveAuthoritativeState(gameState);

      const room = `ludo:game:${gameId}`;
      socket.join(room);

      const creator = gameState.players[0];
      socket.emit('ludo:game_created', {
        gameId,
        gameState,
        player: creator,
      });

      socket.emit('ludo:state_updated', { gameId, gameState });

      if (typeof callback === 'function') {
        callback({ success: true, gameId, gameState });
      }
    } catch (err: any) {
      sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to create game');
    }
  });

  // 2. Join Game
  socket.on('ludo:join_game', async (data: { gameId: string }, callback?: Function) => {
    try {
      const userId = getAuthenticatedUserId(socket);
      if (!userId) {
        return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to join a game');
      }

      if (!data || !data.gameId) {
        return sendLudoError(socket, 'INVALID_REQUEST', 'gameId is required');
      }

      const gameState = await loadAuthoritativeState(data.gameId);
      if (!gameState) {
        return sendLudoError(socket, 'GAME_NOT_FOUND', `Game ${data.gameId} not found`);
      }

      if (gameState.status === 'FINISHED') {
        return sendLudoError(socket, 'GAME_FINISHED', 'Cannot join an already finished game');
      }

      let player = gameState.players.find((p) => p.playerId === userId || p.userId === userId);

      if (!player) {
        if (gameState.status !== 'WAITING') {
          return sendLudoError(socket, 'GAME_NOT_ACTIVE', 'Cannot join game in progress. Game already started.');
        }

        if (gameState.players.length >= 4) {
          return sendLudoError(socket, 'ROOM_FULL', 'Game is full (maximum 4 players)');
        }

        const nextColor: LudoColor = LUDO_COLORS[gameState.players.length % 4];
        player = {
          playerId: userId,
          userId,
          color: nextColor,
          tokens: LudoTokenService.createPlayerTokens(userId, nextColor),
          isConnected: true,
        };

        gameState.players.push(player);
      } else {
        player.isConnected = true;
      }

      await saveAuthoritativeState(gameState);

      const room = `ludo:game:${data.gameId}`;
      socket.join(room);

      io.to(room).emit('ludo:player_joined', {
        gameId: data.gameId,
        playerId: userId,
        playerColor: player.color,
        gameState,
      });

      io.to(room).emit('ludo:state_updated', { gameId: data.gameId, gameState });

      if (typeof callback === 'function') {
        callback({ success: true, gameId: data.gameId, gameState });
      }
    } catch (err: any) {
      sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to join game');
    }
  });

  // 3. Start Game
  socket.on('ludo:start_game', async (data: { gameId: string }, callback?: Function) => {
    try {
      const userId = getAuthenticatedUserId(socket);
      if (!userId) {
        return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to start game');
      }

      if (!data || !data.gameId) {
        return sendLudoError(socket, 'INVALID_REQUEST', 'gameId is required');
      }

      const gameState = await loadAuthoritativeState(data.gameId);
      if (!gameState) {
        return sendLudoError(socket, 'GAME_NOT_FOUND', `Game ${data.gameId} not found`);
      }

      if (gameState.players.length < 2) {
        return sendLudoError(socket, 'INVALID_REQUEST', 'At least 2 players are required to start the game');
      }

      const updatedState = LudoGameEngine.startGame(gameState);
      await saveAuthoritativeState(updatedState);

      const room = `ludo:game:${data.gameId}`;
      io.to(room).emit('ludo:game_started', {
        gameId: data.gameId,
        gameState: updatedState,
        currentPlayerId: updatedState.currentPlayerId,
        turnStartedAt: updatedState.turnStartedAt,
      });

      io.to(room).emit('ludo:state_updated', { gameId: data.gameId, gameState: updatedState });

      // Start 15s turn timeout timer
      scheduleTurnTimer(io, data.gameId, updatedState.turnNumber || 1, updatedState.turnTimeLimit || 15);

      if (typeof callback === 'function') {
        callback({ success: true, gameId: data.gameId, gameState: updatedState });
      }
    } catch (err: any) {
      sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to start game');
    }
  });

  // 4. Roll Dice
  socket.on('ludo:roll_dice', async (data: { gameId: string }, callback?: Function) => {
    try {
      const userId = getAuthenticatedUserId(socket);
      if (!userId) {
        return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to roll dice');
      }

      if (!data || !data.gameId) {
        return sendLudoError(socket, 'INVALID_REQUEST', 'gameId is required');
      }

      // Concurrency lock wrapping around Redis state load + roll execution + state save
      const lockKey = LudoGameEngine.getGameLockKey(data.gameId);
      let lockRes = null;
      try {
        lockRes = await redisLockService.acquireLock(lockKey, 3000);
      } catch {
        // Fallback if Redis lock is bypassed/down in tests
      }

      try {
        const gameState = await loadAuthoritativeState(data.gameId);
        if (!gameState) {
          return sendLudoError(socket, 'GAME_NOT_FOUND', `Game ${data.gameId} not found`);
        }

        if (gameState.status === 'FINISHED') {
          return sendLudoError(socket, 'GAME_FINISHED', 'Game is already finished');
        }

        // Active roll resets missedTurns for this player
        const activePlayer = gameState.players.find((p) => p.playerId === userId || p.userId === userId);
        if (activePlayer) {
          activePlayer.missedTurns = 0;
        }

        const rollRes = LudoGameEngine.rollDice(gameState, userId);
        if (!rollRes.success || !rollRes.gameState) {
          const code = rollRes.reason?.includes('turn')
            ? 'NOT_YOUR_TURN'
            : rollRes.reason?.includes('rolled')
            ? 'DICE_ALREADY_ROLLED'
            : 'INVALID_REQUEST';
          return sendLudoError(socket, code, rollRes.reason || 'Failed to roll dice');
        }

        await saveAuthoritativeState(rollRes.gameState);

        const room = `ludo:game:${data.gameId}`;
        io.to(room).emit('ludo:dice_rolled', {
          gameId: data.gameId,
          playerId: userId,
          diceValue: rollRes.diceValue,
          validMoves: rollRes.validMoves,
          gameState: rollRes.gameState,
        });

        io.to(room).emit('ludo:state_updated', { gameId: data.gameId, gameState: rollRes.gameState });

        if (typeof callback === 'function') {
          callback({ success: true, diceValue: rollRes.diceValue, gameState: rollRes.gameState });
        }

        // If player has NO valid moves with the rolled dice:
        // Automatically advance turn to the next player after a brief 1.2s delay
        if (!rollRes.validMoves || rollRes.validMoves.length === 0) {
          if (rollRes.diceValue === 6) {
            // Extra turn on 6: reset diceRolled so player can roll again
            setTimeout(async () => {
              const stateForReroll: LudoGameState = {
                ...rollRes.gameState!,
                diceRolled: false,
                diceValue: null,
              };
              await saveAuthoritativeState(stateForReroll);
              io.to(room).emit('ludo:state_updated', { gameId: data.gameId, gameState: stateForReroll });
              scheduleTurnTimer(io, data.gameId, stateForReroll.turnNumber || 1, 15);
            }, 1200);
          } else {
            // Normal rotation to next player
            const turnResolution = LudoTurnResolutionService.resolveTurn(
              rollRes.gameState,
              userId,
              rollRes.diceValue || 0
            );

            setTimeout(async () => {
              await saveAuthoritativeState(turnResolution.updatedGameState);
              io.to(room).emit('ludo:turn_changed', {
                gameId: data.gameId,
                currentPlayerId: turnResolution.updatedGameState.currentPlayerId,
                turnNumber: turnResolution.updatedGameState.turnNumber,
                turnStartedAt: turnResolution.updatedGameState.turnStartedAt,
                turnTimeLimit: turnResolution.updatedGameState.turnTimeLimit || 15,
              });
              io.to(room).emit('ludo:state_updated', {
                gameId: data.gameId,
                gameState: turnResolution.updatedGameState,
              });
              scheduleTurnTimer(
                io,
                data.gameId,
                turnResolution.updatedGameState.turnNumber || 1,
                turnResolution.updatedGameState.turnTimeLimit || 15
              );
            }, 1200);
          }
        }
      } finally {
        if (lockRes && lockRes.acquired && lockRes.token) {
          await redisLockService.releaseLock(lockKey, lockRes.token).catch(() => {});
        }
      }
    } catch (err: any) {
      sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to roll dice');
    }
  });

  // 5. Move Token
  socket.on(
    'ludo:move_token',
    async (data: { gameId: string; tokenId: string }, callback?: Function) => {
      try {
        const userId = getAuthenticatedUserId(socket);
        if (!userId) {
          return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to move token');
        }

        if (!data || !data.gameId || !data.tokenId) {
          return sendLudoError(socket, 'INVALID_REQUEST', 'gameId and tokenId are required');
        }

        // Concurrency lock wrapping around Redis state load + move execution + state save
        const lockKey = LudoGameEngine.getGameLockKey(data.gameId);
        let lockRes = null;
        try {
          lockRes = await redisLockService.acquireLock(lockKey, 3000);
        } catch {
          // Fallback if Redis lock is bypassed/down in tests
        }

        try {
          const gameState = await loadAuthoritativeState(data.gameId);
          if (!gameState) {
            return sendLudoError(socket, 'GAME_NOT_FOUND', `Game ${data.gameId} not found`);
          }

          if (gameState.status === 'FINISHED') {
            return sendLudoError(socket, 'GAME_FINISHED', 'Game is already finished');
          }

          const moveRes = LudoGameEngine.moveToken(gameState, userId, data.tokenId);
          if (!moveRes.success || !moveRes.gameState) {
            const code = moveRes.reason?.includes('turn')
              ? 'NOT_YOUR_TURN'
              : moveRes.reason?.includes('dice')
              ? 'DICE_NOT_ROLLED'
              : 'INVALID_MOVE';
            return sendLudoError(socket, code, moveRes.reason || 'Failed to move token');
          }

          await saveAuthoritativeState(moveRes.gameState);

          const room = `ludo:game:${data.gameId}`;

          // Broadcast token_moved
          io.to(room).emit('ludo:token_moved', {
            gameId: data.gameId,
            playerId: userId,
            tokenId: data.tokenId,
            from: moveRes.moveResult?.fromPosition,
            to: moveRes.moveResult?.toPosition,
            state: moveRes.moveResult?.toCategory,
          });

          // Broadcast token_captured if opponent token captured
          if (moveRes.captureResult?.captured) {
            const capturedTokenId = moveRes.captureResult.capturedTokenIds[0];
            const capturedPlayer = gameState.players.find((p: LudoPlayer) =>
              p.tokens.some((t) => t.tokenId === capturedTokenId)
            );

            io.to(room).emit('ludo:token_captured', {
              gameId: data.gameId,
              capturingPlayerId: userId,
              capturingTokenId: data.tokenId,
              capturedPlayerId: capturedPlayer?.playerId || null,
              capturedTokenId: capturedTokenId || null,
              position: moveRes.captureResult.position,
            });
          }

          // Broadcast game_finished if winner declared
          if (moveRes.isFinished) {
            clearGameTurnTimer(data.gameId);
            const winnerObj = moveRes.gameState.players.find(
              (p: LudoPlayer) => p.playerId === moveRes.winnerId
            );

            // Persist permanent match result in MySQL asynchronously
            LudoMatchHistoryService.createMatchResult(moveRes.gameState).catch((err) => {
              console.error(`⚠️ Failed to persist final match result for game ${data.gameId}:`, err);
            });

            io.to(room).emit('ludo:game_finished', {
              gameId: data.gameId,
              winnerId: moveRes.winnerId,
              winnerColor: winnerObj?.color || null,
              finishedAt: moveRes.gameState.finishedAt || Date.now(),
            });
          } else {
            // Schedule timer for next turn
            scheduleTurnTimer(
              io,
              data.gameId,
              moveRes.gameState.turnNumber || 1,
              moveRes.gameState.turnTimeLimit || 15
            );

            if (moveRes.turnResolution) {
              // Broadcast turn_changed
              io.to(room).emit('ludo:turn_changed', {
                gameId: data.gameId,
                currentPlayerId: moveRes.gameState.currentPlayerId,
                turnNumber: moveRes.gameState.turnNumber,
                turnStartedAt: moveRes.gameState.turnStartedAt,
                turnTimeLimit: moveRes.gameState.turnTimeLimit || 15,
              });
            }
          }

          // Broadcast state_updated
          io.to(room).emit('ludo:state_updated', {
            gameId: data.gameId,
            gameState: moveRes.gameState,
          });

          if (typeof callback === 'function') {
            callback({ success: true, gameState: moveRes.gameState });
          }
        } finally {
          if (lockRes && lockRes.acquired && lockRes.token) {
            await redisLockService.releaseLock(lockKey, lockRes.token).catch(() => {});
          }
        }
      } catch (err: any) {
        sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to move token');
      }
    }
  );

  // 6. Get State (Reads directly from Redis authoritative storage)
  socket.on('ludo:get_state', async (data: { gameId: string }, callback?: Function) => {
    try {
      if (!data || !data.gameId) {
        return sendLudoError(socket, 'INVALID_REQUEST', 'gameId is required');
      }

      const gameState = await loadAuthoritativeState(data.gameId);
      if (!gameState) {
        return sendLudoError(socket, 'GAME_NOT_FOUND', `Game ${data.gameId} not found`);
      }

      socket.join(`ludo:game:${data.gameId}`);
      socket.emit('ludo:state_updated', { gameId: data.gameId, gameState });

      if (typeof callback === 'function') {
        callback({ success: true, gameState });
      }
    } catch (err: any) {
      sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to fetch game state');
    }
  });

  // 7. Resume Game (Server-authoritative reconnect recovery)
  socket.on('ludo:resume_game', async (data: { gameId: string }, callback?: Function) => {
    try {
      const userId = getAuthenticatedUserId(socket);
      if (!userId) {
        return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to resume game');
      }

      if (!data || !data.gameId) {
        return sendLudoError(socket, 'INVALID_REQUEST', 'gameId is required to resume');
      }

      const gameState = await loadAuthoritativeState(data.gameId);
      if (!gameState) {
        return sendLudoError(socket, 'GAME_NOT_FOUND', `Game ${data.gameId} not found`);
      }

      // Verify authenticated user is a participant
      const player = gameState.players.find((p) => p.playerId === userId || p.userId === userId);
      if (!player) {
        // If in WAITING lobby, auto-join user as next player
        if (gameState.status === 'WAITING' && gameState.players.length < 4) {
          const nextColor: LudoColor = LUDO_COLORS[gameState.players.length % 4];
          const newPlayer = {
            playerId: userId,
            userId,
            color: nextColor,
            tokens: LudoTokenService.createPlayerTokens(userId, nextColor),
            isConnected: true,
          };
          gameState.players.push(newPlayer);
          await saveAuthoritativeState(gameState);

          const room = `ludo:game:${data.gameId}`;
          socket.join(room);

          io.to(room).emit('ludo:player_joined', {
            gameId: data.gameId,
            playerId: userId,
            playerColor: newPlayer.color,
            gameState,
          });
          io.to(room).emit('ludo:state_updated', { gameId: data.gameId, gameState });

          if (typeof callback === 'function') {
            callback({ success: true, gameId: data.gameId, gameState });
          }
          return;
        }

        return sendLudoError(socket, 'UNAUTHORIZED', 'You are not a participant in this game');
      }

      // Mark player as reconnected
      player.isConnected = true;
      await saveAuthoritativeState(gameState);

      // Re-join socket room
      const room = `ludo:game:${data.gameId}`;
      socket.join(room);

      // Calculate valid moves if dice was already rolled in active turn
      let validMoves: any[] = [];
      if (
        gameState.status === 'ACTIVE' &&
        gameState.diceRolled &&
        gameState.diceValue &&
        gameState.currentPlayerId === userId
      ) {
        const playerObj = gameState.players.find((p) => p.playerId === userId || p.userId === userId);
        if (playerObj) {
          const allTokens = gameState.players.flatMap((p) => p.tokens || []);
          const validMovesRes = LudoValidMovesService.getValidMoves(
            allTokens,
            userId,
            playerObj.color,
            gameState.diceValue
          );
          validMoves = validMovesRes.validMoves || [];
        }
      }

      socket.emit('ludo:state_updated', {
        gameId: data.gameId,
        gameState,
        validMoves,
      });

      if (typeof callback === 'function') {
        callback({ success: true, gameId: data.gameId, gameState, validMoves });
      }
    } catch (err: any) {
      sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to resume game');
    }
  });

  // 8. Disconnect Handler
  socket.on('disconnect', async () => {
    const userId = getAuthenticatedUserId(socket);
    if (!userId) return;

    // Mark player as disconnected across games without destroying game state
    for (const [gameId, gameState] of activeLudoGames.entries()) {
      const player = gameState.players.find((p) => p.playerId === userId);
      if (player) {
        player.isConnected = false;
        await saveAuthoritativeState(gameState);
        io.to(`ludo:game:${gameId}`).emit('ludo:state_updated', { gameId, gameState });
      }
    }
  });
}

export default registerLudoSocketHandlers;
