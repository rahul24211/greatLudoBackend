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
import { LudoBotService } from '../game-engine/ludo/bot/LudoBotService';
import { LudoMatchmakingService } from '../modules/ludo/matchmaking/LudoMatchmakingService';
import { verifyAccessToken } from '../utils/tokenUtils';
import { isAdminRole, hasPermission } from '../modules/admin/AdminPermissions';
import { User } from '../models';
import env from '../config/env';

// In-memory fallback map for environments without Redis
export const activeLudoGames = new Map<string, LudoGameState>();

// Server-side turn timeout timer registry (30 seconds per turn)
export const gameTurnTimers = new Map<string, NodeJS.Timeout>();

export function clearGameTurnTimer(gameId: string): void {
  const timer = gameTurnTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    gameTurnTimers.delete(gameId);
  }
}

/**
 * Schedule server-authoritative turn timeout (30s limit).
 * If a player fails to take their turn within 30 seconds, turn auto-advances.
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

          // Always emit player_disqualified notification to room
          io.to(room).emit('ludo:player_disqualified', {
            gameId,
            playerId: currentPlayer.playerId,
            missedTurns: currentPlayer.missedTurns,
            reason: 'Exceeded maximum 3 missed turns timeout limit.',
          });

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

        // AUTO-ROLL & AUTO-MOVE ON TURN TIMEOUT
        let activeState: LudoGameState = gameState;
        let validMoves: any[] = [];

        // 1. Auto-Roll if dice was not rolled
        if (!activeState.diceRolled) {
          const rollRes = LudoGameEngine.rollDice(activeState, currentPlayer.playerId);
          if (rollRes.success && rollRes.gameState) {
            activeState = rollRes.gameState;
            validMoves = rollRes.validMoves || [];
            await saveAuthoritativeState(activeState);

            io.to(room).emit('ludo:dice_rolled', {
              gameId,
              playerId: currentPlayer.playerId,
              diceValue: rollRes.diceValue,
              validMoves,
              gameState: activeState,
            });
          }
        } else {
          // Dice was already rolled by player before timing out
          const movesRes = LudoValidMovesService.getValidMoves(
            currentPlayer.tokens,
            currentPlayer.playerId,
            currentPlayer.color,
            activeState.diceValue || 1
          );
          validMoves = movesRes.validMoves || [];
        }

        // 2. Auto-Move if valid moves exist
        if (validMoves.length > 0) {
          const chosenMove =
            LudoBotService.selectMove(
              activeState,
              currentPlayer.playerId,
              validMoves,
              'MEDIUM'
            ) || validMoves[0];

          if (chosenMove) {
            const moveRes = LudoGameEngine.moveToken(
              activeState,
              currentPlayer.playerId,
              chosenMove.tokenId
            );

            if (moveRes.success && moveRes.gameState) {
              await saveAuthoritativeState(moveRes.gameState);

              io.to(room).emit('ludo:token_moved', {
                gameId,
                playerId: currentPlayer.playerId,
                tokenId: chosenMove.tokenId,
                from: moveRes.moveResult?.fromPosition,
                to: moveRes.moveResult?.toPosition,
                state: moveRes.moveResult?.toCategory,
              });

              if (moveRes.captureResult?.captured) {
                const capturedTokenId = moveRes.captureResult.capturedTokenIds[0];
                const capturedPlayer = moveRes.gameState.players.find((p) =>
                  p.tokens.some((t) => t.tokenId === capturedTokenId)
                );
                io.to(room).emit('ludo:token_captured', {
                  gameId,
                  capturingPlayerId: currentPlayer.playerId,
                  capturingTokenId: chosenMove.tokenId,
                  capturedPlayerId: capturedPlayer?.playerId || null,
                  capturedTokenId: capturedTokenId || null,
                  position: moveRes.captureResult.position,
                });
              }

              if (moveRes.isFinished) {
                clearGameTurnTimer(gameId);
                const winnerObj = moveRes.gameState!.players.find(
                  (p) => p.playerId === moveRes.winnerId
                );

                LudoMatchHistoryService.createMatchResult(moveRes.gameState!).catch((err) => {
                  console.error(`⚠️ Failed to persist match result for game ${gameId}:`, err);
                });

                io.to(room).emit('ludo:game_finished', {
                  gameId,
                  winnerId: moveRes.winnerId,
                  winnerColor: winnerObj?.color || null,
                  finishedAt: moveRes.gameState!.finishedAt || Date.now(),
                });

                io.to(room).emit('ludo:state_updated', { gameId, gameState: moveRes.gameState! });
                return;
              } else {
                const nextPlayer = moveRes.gameState!.players.find(
                  (p) => p.playerId === moveRes.gameState!.currentPlayerId
                );

                io.to(room).emit('ludo:turn_changed', {
                  gameId,
                  currentPlayerId: moveRes.gameState!.currentPlayerId,
                  turnNumber: moveRes.gameState!.turnNumber,
                  turnStartedAt: moveRes.gameState!.turnStartedAt,
                  turnTimeLimit: moveRes.gameState!.turnTimeLimit || 15,
                });

                io.to(room).emit('ludo:state_updated', {
                  gameId,
                  gameState: moveRes.gameState!,
                });

                if (nextPlayer && nextPlayer.playerType === 'BOT') {
                  executeBotTurn(io, gameId);
                } else {
                  scheduleTurnTimer(
                    io,
                    gameId,
                    moveRes.gameState!.turnNumber || 1,
                    moveRes.gameState!.turnTimeLimit || 15
                  );
                }
                return;
              }
            }
          }
        }

        // 3. Fallback: No valid moves available (advance turn to next player)
        const turnResolution = LudoTurnResolutionService.resolveTurn(
          activeState,
          currentPlayer.playerId,
          activeState.diceValue || 1
        );

        await saveAuthoritativeState(turnResolution.updatedGameState);

        io.to(room).emit('ludo:turn_changed', {
          gameId,
          currentPlayerId: turnResolution.updatedGameState.currentPlayerId,
          turnNumber: turnResolution.updatedGameState.turnNumber,
          turnStartedAt: turnResolution.updatedGameState.turnStartedAt,
          turnTimeLimit: turnResolution.updatedGameState.turnTimeLimit || 15,
        });

        io.to(room).emit('ludo:state_updated', {
          gameId,
          gameState: turnResolution.updatedGameState,
        });

        const nextP = turnResolution.updatedGameState.players.find(
          (p) => p.playerId === turnResolution.updatedGameState.currentPlayerId
        );

        if (nextP && nextP.playerType === 'BOT') {
          executeBotTurn(io, gameId);
        } else {
          scheduleTurnTimer(
            io,
            gameId,
            turnResolution.updatedGameState.turnNumber || 1,
            turnResolution.updatedGameState.turnTimeLimit || 15
          );
        }
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
  return socket.id || null;
}

/**
 * Load authoritative game state from Redis (or fallback map if Redis unavailable).
 */
export async function loadAuthoritativeState(gameId: string): Promise<LudoGameState | null> {
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
export async function saveAuthoritativeState(gameState: LudoGameState): Promise<boolean> {
  if (!gameState || !gameState.gameId) return false;
  activeLudoGames.set(gameState.gameId, gameState);

  try {
    return await ludoGameStateRepository.saveGameState(gameState);
  } catch {
    return true;
  }
}

/**
 * Authenticate socket connection or event payload for Admin privileges.
 */
export function authenticateAdminSocket(token: string | undefined): {
  authenticated: boolean;
  role?: string;
  user?: any;
  error?: string;
} {
  if (!token) {
    return { authenticated: false, error: 'Authentication token required' };
  }
  try {
    const payload = verifyAccessToken(token);
    if (
      !payload ||
      !payload.role ||
      !isAdminRole(payload.role) ||
      !hasPermission(payload.role, 'GAME_VIEW')
    ) {
      return { authenticated: false, error: 'Unauthorized: GAME_VIEW permission required' };
    }
    return { authenticated: true, role: payload.role, user: payload };
  } catch {
    return { authenticated: false, error: 'Invalid or expired authentication token' };
  }
}

/**
 * Broadcast sanitized, safe game telemetry to subscribed Admin monitors.
 */
export function broadcastToAdminMonitors(
  io: SocketIOServer,
  gameId: string,
  eventType: string,
  gameState: LudoGameState
): void {
  if (!gameState || !io) return;

  const hasBot = gameState.players.some((p) => p.playerType === 'BOT');
  const safePayload = {
    eventType,
    gameId: gameState.gameId,
    gameMode: gameState.mode,
    status: gameState.status,
    gameType: hasBot ? 'HUMAN_VS_BOT' : 'HUMAN_VS_HUMAN',
    turnNumber: gameState.turnNumber,
    currentPlayerId: gameState.currentPlayerId,
    diceRolled: Boolean(gameState.diceRolled),
    diceValue: gameState.diceValue || null,
    turnStartedAt: gameState.turnStartedAt || null,
    finishedAt: gameState.finishedAt || null,
    winnerId: gameState.winner || null,
    players: gameState.players.map((p) => ({
      playerId: p.playerId,
      userId: p.userId,
      username: p.username,
      color: p.color,
      playerType: p.playerType,
      isConnected: p.isConnected !== false,
      isWinner: gameState.winner === p.playerId,
      tokens: (p.tokens || []).map((t) => ({
        tokenId: t.tokenId,
        state: t.state,
        position: t.position,
      })),
    })),
  };

  io.to('admin:games:live').emit('admin:game_update', safePayload);
  io.to(`admin:game:${gameId}`).emit('admin:game_update', safePayload);

  if (gameState.status === 'FINISHED') {
    io.to('admin:games:live').emit('admin:game_finished', safePayload);
    io.to(`admin:game:${gameId}`).emit('admin:game_finished', safePayload);
  }
}

/**
 * Server-authoritative Bot Turn Orchestrator.
 * Simulates thinking delay (700-1200ms), rolls dice through LudoGameEngine, selects tactical move, and executes turn.
 */
export async function executeBotTurn(io: SocketIOServer, gameId: string): Promise<void> {
  const moveDelayMs = env.ludoBotMoveDelayMs || 900;

  setTimeout(async () => {
    const lockKey = LudoGameEngine.getGameLockKey(gameId);
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(lockKey, 4000);
    } catch {}

    try {
      const gameState = await loadAuthoritativeState(gameId);
      if (!gameState || gameState.status !== 'ACTIVE') return;

      const botPlayer = gameState.players.find(
        (p) => p.playerId === gameState.currentPlayerId && p.playerType === 'BOT'
      );
      if (!botPlayer) return;

      const room = `ludo:game:${gameId}`;

      // 1. Server-authoritative Dice Roll for BOT
      const rollRes = LudoGameEngine.rollDice(gameState, botPlayer.playerId);
      if (!rollRes.success || !rollRes.gameState) return;

      await saveAuthoritativeState(rollRes.gameState);

      io.to(room).emit('ludo:dice_rolled', {
        gameId,
        playerId: botPlayer.playerId,
        diceValue: rollRes.diceValue,
        validMoves: rollRes.validMoves,
        gameState: rollRes.gameState,
      });
      io.to(room).emit('ludo:state_updated', { gameId, gameState: rollRes.gameState });

      // 2. Handle NO valid moves
      if (!rollRes.validMoves || rollRes.validMoves.length === 0) {
        if (rollRes.diceValue === 6) {
          // Extra turn on 6: reroll after delay
          setTimeout(async () => {
            const stateForReroll: LudoGameState = {
              ...rollRes.gameState!,
              diceRolled: false,
              diceValue: null,
            };
            await saveAuthoritativeState(stateForReroll);
            io.to(room).emit('ludo:state_updated', { gameId, gameState: stateForReroll });
            executeBotTurn(io, gameId);
          }, 1000);
        } else {
          // Resolve turn and rotate to next player
          const turnResolution = LudoTurnResolutionService.resolveTurn(
            rollRes.gameState,
            botPlayer.playerId,
            rollRes.diceValue || 0
          );

          setTimeout(async () => {
            await saveAuthoritativeState(turnResolution.updatedGameState);
            io.to(room).emit('ludo:turn_changed', {
              gameId,
              currentPlayerId: turnResolution.updatedGameState.currentPlayerId,
              turnNumber: turnResolution.updatedGameState.turnNumber,
              turnStartedAt: turnResolution.updatedGameState.turnStartedAt,
              turnTimeLimit: turnResolution.updatedGameState.turnTimeLimit || 30,
            });
            io.to(room).emit('ludo:state_updated', {
              gameId,
              gameState: turnResolution.updatedGameState,
            });

            const nextPlayer = turnResolution.updatedGameState.players.find(
              (p) => p.playerId === turnResolution.updatedGameState.currentPlayerId
            );
            if (nextPlayer && nextPlayer.playerType === 'BOT') {
              executeBotTurn(io, gameId);
            } else {
              scheduleTurnTimer(
                io,
                gameId,
                turnResolution.updatedGameState.turnNumber || 1,
                turnResolution.updatedGameState.turnTimeLimit || 30
              );
            }
          }, 1000);
        }
        return;
      }

      // 3. Select Bot Move based on Difficulty (EASY / MEDIUM / HARD)
      setTimeout(async () => {
        let moveLock = null;
        try {
          moveLock = await redisLockService.acquireLock(lockKey, 4000);
        } catch {}

        try {
          const currentState = await loadAuthoritativeState(gameId);
          if (!currentState || currentState.status !== 'ACTIVE' || !currentState.diceRolled) return;

          const chosenMove = LudoBotService.selectMove(
            currentState,
            botPlayer.playerId,
            rollRes.validMoves || [],
            botPlayer.botDifficulty || 'MEDIUM'
          );
          if (!chosenMove) return;

          const moveRes = LudoGameEngine.moveToken(currentState, botPlayer.playerId, chosenMove.tokenId);
          if (!moveRes.success || !moveRes.gameState) return;

          await saveAuthoritativeState(moveRes.gameState);

          io.to(room).emit('ludo:token_moved', {
            gameId,
            playerId: botPlayer.playerId,
            tokenId: chosenMove.tokenId,
            from: moveRes.moveResult?.fromPosition,
            to: moveRes.moveResult?.toPosition,
            state: moveRes.moveResult?.toCategory,
          });

          if (moveRes.captureResult?.captured) {
            const capturedTokenId = moveRes.captureResult.capturedTokenIds[0];
            const capturedPlayer = moveRes.gameState.players.find((p) =>
              p.tokens.some((t) => t.tokenId === capturedTokenId)
            );
            io.to(room).emit('ludo:token_captured', {
              gameId,
              capturingPlayerId: botPlayer.playerId,
              capturingTokenId: chosenMove.tokenId,
              capturedPlayerId: capturedPlayer?.playerId || null,
              capturedTokenId: capturedTokenId || null,
              position: moveRes.captureResult.position,
            });
          }

          if (moveRes.isFinished) {
            clearGameTurnTimer(gameId);
            const winnerObj = moveRes.gameState!.players.find((p) => p.playerId === moveRes.winnerId);

            LudoMatchHistoryService.createMatchResult(moveRes.gameState!).catch((err) => {
              console.error(`⚠️ Failed to persist final match result for game ${gameId}:`, err);
            });

            io.to(room).emit('ludo:game_finished', {
              gameId,
              winnerId: moveRes.winnerId,
              winnerColor: winnerObj?.color || null,
              finishedAt: moveRes.gameState!.finishedAt || Date.now(),
            });
          } else {
            const nextPlayer = moveRes.gameState!.players.find(
              (p) => p.playerId === moveRes.gameState!.currentPlayerId
            );

            if (moveRes.turnResolution) {
              io.to(room).emit('ludo:turn_changed', {
                gameId,
                currentPlayerId: moveRes.gameState!.currentPlayerId,
                turnNumber: moveRes.gameState!.turnNumber,
                turnStartedAt: moveRes.gameState!.turnStartedAt,
                turnTimeLimit: moveRes.gameState!.turnTimeLimit || 30,
              });
            }

            if (nextPlayer && nextPlayer.playerType === 'BOT') {
              executeBotTurn(io, gameId);
            } else {
              scheduleTurnTimer(
                io,
                gameId,
                moveRes.gameState!.turnNumber || 1,
                moveRes.gameState!.turnTimeLimit || 30
              );
            }
          }

          io.to(room).emit('ludo:state_updated', {
            gameId,
            gameState: moveRes.gameState,
          });
        } finally {
          if (moveLock && moveLock.acquired && moveLock.token) {
            await redisLockService.releaseLock(lockKey, moveLock.token).catch(() => {});
          }
        }
      }, 600);
    } finally {
      if (lockRes && lockRes.acquired && lockRes.token) {
        await redisLockService.releaseLock(lockKey, lockRes.token).catch(() => {});
      }
    }
  }, moveDelayMs);
}

/**
 * Register all server-authoritative Ludo Socket.IO event handlers.
 */
export function registerLudoSocketHandlers(io: SocketIOServer, socket: Socket): void {
  // 0. Matchmaking: Find Match (Human vs Human or Bot fallback)
  socket.on('ludo:find_match', async (data?: { mode?: string; stake?: number; maxPlayers?: number }, callback?: Function) => {
    try {
      const userId = getAuthenticatedUserId(socket);
      if (!userId) {
        return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to find a match');
      }

      // Handle player's participation in any previous active game before queueing a new match
      for (const [gameId, activeGame] of activeLudoGames.entries()) {
        if (
          activeGame.status === 'ACTIVE' &&
          activeGame.players.some((p) => p.userId === userId || p.playerId === userId)
        ) {
          const userPlayer = activeGame.players.find((p) => p.userId === userId || p.playerId === userId);
          if (userPlayer && !userPlayer.isDisqualified) {
            userPlayer.isDisqualified = true;
            userPlayer.isConnected = false;

            const remainingActivePlayers = activeGame.players.filter((p) => !p.isDisqualified);
            const room = `ludo:game:${gameId}`;

            io.to(room).emit('ludo:player_disqualified', {
              gameId,
              playerId: userPlayer.playerId,
              reason: 'Player left to start another match.',
            });

            if (remainingActivePlayers.length <= 1) {
              const winner = remainingActivePlayers[0] || userPlayer;
              activeGame.status = 'FINISHED';
              activeGame.winner = winner.playerId;
              activeGame.finishedAt = Date.now();
              clearGameTurnTimer(gameId);

              LudoMatchHistoryService.createMatchResult(activeGame).catch((err) => {
                console.error(`⚠️ Failed to persist match result for game ${gameId}:`, err);
              });

              io.to(room).emit('ludo:game_finished', {
                gameId,
                winnerId: winner.playerId,
                winnerColor: winner.color,
                finishedAt: activeGame.finishedAt,
              });
            } else {
              // If it was this player's turn in the background game, advance turn to next active player
              if (activeGame.currentPlayerId === userPlayer.playerId) {
                const nextPlayer = LudoTurnService.getNextPlayer(activeGame);
                if (nextPlayer) {
                  activeGame.currentPlayerId = nextPlayer.playerId;
                  activeGame.diceRolled = false;
                  activeGame.diceValue = null;
                  activeGame.turnNumber = (activeGame.turnNumber || 1) + 1;
                  activeGame.turnStartedAt = Date.now();

                  io.to(room).emit('ludo:turn_changed', {
                    gameId,
                    currentPlayerId: nextPlayer.playerId,
                    turnNumber: activeGame.turnNumber,
                    turnStartedAt: activeGame.turnStartedAt,
                    turnTimeLimit: activeGame.turnTimeLimit || 30,
                  });

                  if (nextPlayer.playerType === 'BOT') {
                    executeBotTurn(io, gameId);
                  } else {
                    scheduleTurnTimer(io, gameId, activeGame.turnNumber, activeGame.turnTimeLimit || 30);
                  }
                }
              }
            }

            await saveAuthoritativeState(activeGame);
            io.to(room).emit('ludo:state_updated', { gameId, gameState: activeGame });
          }
        }
      }

      const username = socket.data?.user?.username || socket.data?.username || userId;
      const maxPlayers = data?.maxPlayers === 4 ? 4 : 2;
      const matchRes = await LudoMatchmakingService.findMatch(
        { userId, socketId: socket.id, username, maxPlayers, stake: data?.stake, mode: data?.mode },
        io,
        (gameId) => executeBotTurn(io, gameId),
        (gameId, turnNumber, timeLimit) => scheduleTurnTimer(io, gameId, turnNumber, timeLimit)
      );

      if (typeof callback === 'function') {
        callback(matchRes);
      }
    } catch (err: any) {
      sendLudoError(socket, 'MATCHMAKING_ERROR', err.message || 'Failed to enter matchmaking');
    }
  });

  // 0.1 Matchmaking: Cancel Match
  socket.on('ludo:cancel_match', async (data?: { mode?: string }, callback?: Function) => {
    try {
      const userId = getAuthenticatedUserId(socket);
      if (!userId) {
        return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to cancel matchmaking');
      }

      const cancelRes = await LudoMatchmakingService.cancelMatch(userId);
      socket.emit('ludo:match_cancelled', { mode: data?.mode || 'CLASSIC', success: cancelRes.cancelled });

      if (typeof callback === 'function') {
        callback(cancelRes);
      }
    } catch (err: any) {
      sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to cancel match');
    }
  });

  // 1. Create Game / Private Room
  socket.on(
    'ludo:create_game',
    async (
      data?: {
        mode?: string;
        gameId?: string;
        roomCode?: string;
        maxPlayers?: number;
        entryFee?: number;
        isPrivate?: boolean;
      },
      callback?: Function
    ) => {
      try {
        const userId = getAuthenticatedUserId(socket);
        if (!userId) {
          return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to create a game');
        }

        const gameId =
          data?.gameId ||
          (data?.roomCode
            ? `game_room_${data.roomCode}`
            : `game_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);

        const userRecord = await User.findByPk(userId).catch(() => null);
        const username = socket.data.user?.username || userRecord?.username || 'Host Player';

        const gameState = LudoGameEngine.createGame({
          gameId,
          roomId: data?.roomCode || gameId,
          mode: data?.mode || 'CLASSIC',
          playerIds: [userId],
        });

        gameState.roomCode = data?.roomCode;
        gameState.maxPlayers = data?.maxPlayers || 4;
        gameState.entryFee = data?.entryFee || 100;
        gameState.prizePool = (data?.entryFee || 100) * (data?.maxPlayers || 4) * 0.9;
        gameState.isPrivate = data?.isPrivate !== false;

        const creator = gameState.players[0];
        creator.username = username;
        creator.isHost = true;
        creator.isReady = true;

        await saveAuthoritativeState(gameState);

        const room = `ludo:game:${gameId}`;
        socket.join(room);

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
    }
  );

  // 2. Join Game / Private Room
  socket.on(
    'ludo:join_game',
    async (data: { gameId?: string; roomCode?: string }, callback?: Function) => {
      try {
        const userId = getAuthenticatedUserId(socket);
        if (!userId) {
          return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to join a game');
        }

        const targetGameId =
          data?.gameId || (data?.roomCode ? `game_room_${data.roomCode}` : '');
        if (!targetGameId) {
          return sendLudoError(socket, 'INVALID_REQUEST', 'gameId or roomCode is required');
        }

        const gameState = await loadAuthoritativeState(targetGameId);
        if (!gameState) {
          return sendLudoError(
            socket,
            'GAME_NOT_FOUND',
            `Room #${data.roomCode || data.gameId} not found`
          );
        }

        if (gameState.status === 'FINISHED') {
          return sendLudoError(socket, 'GAME_FINISHED', 'Cannot join an already finished game');
        }

        const userRecord = await User.findByPk(userId).catch(() => null);
        const username = socket.data.user?.username || userRecord?.username || 'Player';

        let player = gameState.players.find((p) => p.playerId === userId || p.userId === userId);

        if (!player) {
          if (gameState.status !== 'WAITING') {
            return sendLudoError(
              socket,
              'GAME_NOT_ACTIVE',
              'Cannot join game in progress. Game already started.'
            );
          }

          const maxCapacity = gameState.maxPlayers || 4;
          if (gameState.players.length >= maxCapacity) {
            return sendLudoError(socket, 'ROOM_FULL', `Room is full (maximum ${maxCapacity} players)`);
          }

          const nextColor: LudoColor = LUDO_COLORS[gameState.players.length % 4];
          player = {
            playerId: userId,
            userId,
            username,
            color: nextColor,
            tokens: LudoTokenService.createPlayerTokens(userId, nextColor),
            isConnected: true,
            isHost: false,
            isReady: false,
          };

          gameState.players.push(player);
        } else {
          player.isConnected = true;
          if (username) player.username = username;
        }

        await saveAuthoritativeState(gameState);

        const room = `ludo:game:${targetGameId}`;
        socket.join(room);

        io.to(room).emit('ludo:player_joined', {
          gameId: targetGameId,
          playerId: userId,
          playerColor: player.color,
          gameState,
        });

        io.to(room).emit('ludo:state_updated', { gameId: targetGameId, gameState });

        if (typeof callback === 'function') {
          callback({ success: true, gameId: targetGameId, gameState });
        }
      } catch (err: any) {
        sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to join game');
      }
    }
  );

  // 2.5 Toggle Player Ready Status
  socket.on(
    'ludo:toggle_ready',
    async (
      data: { gameId?: string; roomCode?: string; isReady?: boolean },
      callback?: Function
    ) => {
      try {
        const userId = getAuthenticatedUserId(socket);
        if (!userId) return;

        const targetGameId =
          data?.gameId || (data?.roomCode ? `game_room_${data.roomCode}` : '');
        if (!targetGameId) return;

        const gameState = await loadAuthoritativeState(targetGameId);
        if (!gameState || gameState.status !== 'WAITING') return;

        const player = gameState.players.find(
          (p) => p.playerId === userId || p.userId === userId
        );
        if (player) {
          player.isReady = data.isReady !== undefined ? data.isReady : !player.isReady;
          await saveAuthoritativeState(gameState);

          const room = `ludo:game:${targetGameId}`;
          io.to(room).emit('ludo:state_updated', { gameId: targetGameId, gameState });

          if (typeof callback === 'function') {
            callback({ success: true, isReady: player.isReady, gameState });
          }
        }
      } catch (err) {
        console.error('Error toggling ready status:', err);
      }
    }
  );

  // 3. Start Game
  socket.on(
    'ludo:start_game',
    async (data: { gameId?: string; roomCode?: string }, callback?: Function) => {
      try {
        const userId = getAuthenticatedUserId(socket);
        if (!userId) {
          return sendLudoError(socket, 'UNAUTHORIZED', 'Authentication required to start game');
        }

        const targetGameId =
          data?.gameId || (data?.roomCode ? `game_room_${data.roomCode}` : '');
        if (!targetGameId) {
          return sendLudoError(socket, 'INVALID_REQUEST', 'gameId is required');
        }

        const gameState = await loadAuthoritativeState(targetGameId);
        if (!gameState) {
          return sendLudoError(socket, 'GAME_NOT_FOUND', `Game ${targetGameId} not found`);
        }

        if (gameState.players.length < 2) {
          return sendLudoError(
            socket,
            'INVALID_REQUEST',
            'At least 2 players are required to start the game'
          );
        }

        const updatedState = LudoGameEngine.startGame(gameState);
        updatedState.gameId = targetGameId;
        updatedState.roomCode = gameState.roomCode;
        updatedState.maxPlayers = gameState.maxPlayers;
        updatedState.entryFee = gameState.entryFee;
        updatedState.prizePool = gameState.prizePool;
        updatedState.isPrivate = gameState.isPrivate;

        await saveAuthoritativeState(updatedState);

        const room = `ludo:game:${targetGameId}`;
        io.to(room).emit('ludo:game_started', {
          gameId: targetGameId,
          gameState: updatedState,
          currentPlayerId: updatedState.currentPlayerId,
          turnStartedAt: updatedState.turnStartedAt,
        });

        io.to(room).emit('ludo:state_updated', { gameId: targetGameId, gameState: updatedState });

        // Start 30s turn timeout timer
        scheduleTurnTimer(
          io,
          targetGameId,
          updatedState.turnNumber || 1,
          updatedState.turnTimeLimit || 30
        );

        if (typeof callback === 'function') {
          callback({ success: true, gameId: targetGameId, gameState: updatedState });
        }
      } catch (err: any) {
        sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to start game');
      }
    }
  );

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
                turnTimeLimit: turnResolution.updatedGameState.turnTimeLimit || 30,
              });
              io.to(room).emit('ludo:state_updated', {
                gameId: data.gameId,
                gameState: turnResolution.updatedGameState,
              });

              const nextPlayer = turnResolution.updatedGameState.players.find(
                (p) => p.playerId === turnResolution.updatedGameState.currentPlayerId
              );
              if (nextPlayer && nextPlayer.playerType === 'BOT') {
                executeBotTurn(io, data.gameId);
              } else {
                scheduleTurnTimer(
                  io,
                  data.gameId,
                  turnResolution.updatedGameState.turnNumber || 1,
                  turnResolution.updatedGameState.turnTimeLimit || 30
                );
              }
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
            const winnerObj = moveRes.gameState!.players.find(
              (p: LudoPlayer) => p.playerId === moveRes.winnerId
            );

            // Persist permanent match result in MySQL asynchronously
            LudoMatchHistoryService.createMatchResult(moveRes.gameState!).catch((err) => {
              console.error(`⚠️ Failed to persist final match result for game ${data.gameId}:`, err);
            });

            io.to(room).emit('ludo:game_finished', {
              gameId: data.gameId,
              winnerId: moveRes.winnerId,
              winnerName: winnerObj?.username || (winnerObj?.playerType === 'BOT' ? 'Smart Bot' : 'Player'),
              winnerColor: winnerObj?.color || null,
              gameState: moveRes.gameState,
              finishedAt: moveRes.gameState!.finishedAt || Date.now(),
            });
          } else {
            const nextPlayer = moveRes.gameState!.players.find(
              (p) => p.playerId === moveRes.gameState!.currentPlayerId
            );

            if (moveRes.turnResolution) {
              // Broadcast turn_changed
              io.to(room).emit('ludo:turn_changed', {
                gameId: data.gameId,
                currentPlayerId: moveRes.gameState!.currentPlayerId,
                turnNumber: moveRes.gameState!.turnNumber,
                turnStartedAt: moveRes.gameState!.turnStartedAt,
                turnTimeLimit: moveRes.gameState!.turnTimeLimit || 30,
              });
            }

            if (nextPlayer && nextPlayer.playerType === 'BOT') {
              executeBotTurn(io, data.gameId);
            } else {
              // Schedule timer for next human turn
              scheduleTurnTimer(
                io,
                data.gameId,
                moveRes.gameState!.turnNumber || 1,
                moveRes.gameState!.turnTimeLimit || 30
              );
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

      // If player was already disqualified / eliminated, reject resume
      if (player.isDisqualified) {
        return sendLudoError(
          socket,
          'PLAYER_DISQUALIFIED',
          'You have been eliminated from this match due to missed turn timeouts.'
        );
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

  // 7.5 Leave / Forfeit Game Handler
  socket.on('ludo:leave_game', async (data: { gameId: string }, callback?: Function) => {
    try {
      const userId = getAuthenticatedUserId(socket);
      if (!userId || !data?.gameId) return;

      const gameState = await loadAuthoritativeState(data.gameId);
      if (!gameState || gameState.status !== 'ACTIVE') return;

      const player = gameState.players.find((p) => p.playerId === userId || p.userId === userId);
      if (!player || player.isDisqualified) return;

      player.isDisqualified = true;
      player.isConnected = false;

      const remainingActivePlayers = gameState.players.filter((p) => !p.isDisqualified);
      const room = `ludo:game:${data.gameId}`;

      io.to(room).emit('ludo:player_disqualified', {
        gameId: data.gameId,
        playerId: player.playerId,
        reason: 'Player left / forfeited the match.',
      });

      if (remainingActivePlayers.length <= 1) {
        const winner = remainingActivePlayers[0] || player;
        gameState.status = 'FINISHED';
        gameState.winner = winner.playerId;
        gameState.finishedAt = Date.now();
        clearGameTurnTimer(data.gameId);

        LudoMatchHistoryService.createMatchResult(gameState).catch((err) => {
          console.error(`⚠️ Failed to persist match result for game ${data.gameId}:`, err);
        });

        io.to(room).emit('ludo:game_finished', {
          gameId: data.gameId,
          winnerId: winner.playerId,
          winnerColor: winner.color,
          finishedAt: gameState.finishedAt,
        });
      } else {
        if (gameState.currentPlayerId === player.playerId) {
          const nextPlayer = LudoTurnService.getNextPlayer(gameState);
          if (nextPlayer) {
            gameState.currentPlayerId = nextPlayer.playerId;
            gameState.diceRolled = false;
            gameState.diceValue = null;
            gameState.turnNumber = (gameState.turnNumber || 1) + 1;
            gameState.turnStartedAt = Date.now();

            io.to(room).emit('ludo:turn_changed', {
              gameId: data.gameId,
              currentPlayerId: nextPlayer.playerId,
              turnNumber: gameState.turnNumber,
              turnStartedAt: gameState.turnStartedAt,
              turnTimeLimit: gameState.turnTimeLimit || 30,
            });

            if (nextPlayer.playerType === 'BOT') {
              executeBotTurn(io, data.gameId);
            } else {
              scheduleTurnTimer(io, data.gameId, gameState.turnNumber, gameState.turnTimeLimit || 30);
            }
          }
        }
      }

      await saveAuthoritativeState(gameState);
      io.to(room).emit('ludo:state_updated', { gameId: data.gameId, gameState });
      socket.leave(room);

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (err: any) {
      sendLudoError(socket, 'INVALID_REQUEST', err.message || 'Failed to leave game');
    }
  });

  // 8. Admin Live Feed Subscriptions (Authorized & Protected)
  socket.on('admin:join_live_feed', (data: { token?: string }, callback?: Function) => {
    const auth = authenticateAdminSocket(data?.token);
    if (!auth.authenticated) {
      if (typeof callback === 'function') callback({ success: false, error: auth.error });
      return socket.emit('admin:error', { error: auth.error });
    }
    socket.join('admin:games:live');
    if (typeof callback === 'function') {
      callback({ success: true, message: 'Joined admin live feed', role: auth.role });
    }
  });

  socket.on(
    'admin:join_game_feed',
    (data: { token?: string; gameId: string }, callback?: Function) => {
      const auth = authenticateAdminSocket(data?.token);
      if (!auth.authenticated) {
        if (typeof callback === 'function') callback({ success: false, error: auth.error });
        return socket.emit('admin:error', { error: auth.error });
      }
      if (!data?.gameId) {
        if (typeof callback === 'function') callback({ success: false, error: 'gameId is required' });
        return;
      }
      socket.join(`admin:game:${data.gameId}`);
      if (typeof callback === 'function') {
        callback({ success: true, message: `Joined admin game feed ${data.gameId}` });
      }
    }
  );

  socket.on('admin:leave_game_feed', (data: { gameId: string }, callback?: Function) => {
    if (data?.gameId) {
      socket.leave(`admin:game:${data.gameId}`);
    }
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('admin:join_matchmaking_feed', (data: { token?: string }, callback?: Function) => {
    const auth = authenticateAdminSocket(data?.token);
    if (!auth.authenticated || !hasPermission(auth.role, 'MATCHMAKING_VIEW')) {
      if (typeof callback === 'function') callback({ success: false, error: auth.error || 'Forbidden' });
      return socket.emit('admin:error', { error: auth.error || 'Forbidden' });
    }
    socket.join('admin:matchmaking');
    if (typeof callback === 'function') {
      callback({ success: true, message: 'Joined admin matchmaking live feed', role: auth.role });
    }
  });

  socket.on('admin:leave_matchmaking_feed', (_data: any, callback?: Function) => {
    socket.leave('admin:matchmaking');
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('admin:join_notifications', (data: { token?: string }, callback?: Function) => {
    const auth = authenticateAdminSocket(data?.token);
    if (!auth.authenticated || !hasPermission(auth.role, 'NOTIFICATION_VIEW')) {
      if (typeof callback === 'function') callback({ success: false, error: auth.error || 'Forbidden' });
      return socket.emit('admin:error', { error: auth.error || 'Forbidden' });
    }
    socket.join('admin:notifications');
    if (typeof callback === 'function') {
      callback({ success: true, message: 'Joined admin notifications live feed', role: auth.role });
    }
  });

  socket.on('admin:leave_notifications', (_data: any, callback?: Function) => {
    socket.leave('admin:notifications');
    if (typeof callback === 'function') callback({ success: true });
  });

  // 9. Disconnect Handler
  socket.on('disconnect', async () => {
    const userId = getAuthenticatedUserId(socket);
    if (!userId) return;

    // Clean up any matchmaking queue state for this player
    await LudoMatchmakingService.handleDisconnect(userId).catch(() => {});

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
