import { Server as SocketIOServer } from 'socket.io';
import { redisLockService } from '../../services/redis/redisLock';
import { LudoGameEngine } from '../../game-engine/ludo/LudoGameEngine';
import ludoGameStateRepository from '../../repositories/redis/LudoGameStateRepository';
import { LudoMatchHistoryService } from '../../services/ludo/LudoMatchHistoryService';
import { activeLudoGames, clearGameTurnTimer } from '../../socket/ludoSocketHandler';
import { AuditLogService } from './AuditLogService';
import { AdminNotificationService } from './AdminNotificationService';
import { LudoGameState } from '../../game-engine/ludo/LudoTypes';

export interface ForceEndGameResult {
  success: boolean;
  statusCode?: number;
  message?: string;
  error?: string;
  gameState?: LudoGameState;
}

export class AdminGameModerationService {
  /**
   * Secure, audited Administrative Game Force-End.
   * Coordinates under Redis distributed lock with GameEngine, Redis persistence,
   * MySQL match history, turn timer cleanup, and realtime socket events.
   */
  public static async forceEndGame(
    gameId: string,
    adminUserId: string,
    reason: string,
    io?: SocketIOServer,
    reqMeta?: { ipAddress?: string; userAgent?: string }
  ): Promise<ForceEndGameResult> {
    // 1. Mandatory Reason Validation (10 to 500 characters)
    const trimmedReason = (reason || '').trim();
    if (!trimmedReason || trimmedReason.length < 10) {
      return {
        success: false,
        statusCode: 400,
        error: 'A mandatory reason of at least 10 characters is required to force-end a game.',
      };
    }
    if (trimmedReason.length > 500) {
      return {
        success: false,
        statusCode: 400,
        error: 'Reason cannot exceed 500 characters.',
      };
    }

    if (!gameId || typeof gameId !== 'string') {
      return {
        success: false,
        statusCode: 400,
        error: 'Invalid game ID provided.',
      };
    }

    // 2. Acquire Redis Distributed Lock to prevent race conditions with active moves
    const lockKey = LudoGameEngine.getGameLockKey(gameId);
    let lockRes = null;
    try {
      lockRes = await redisLockService.acquireLock(lockKey, 5000);
    } catch {}

    try {
      // 3. Retrieve authoritative game state (Redis first, fallback in-memory)
      let gameState: LudoGameState | null = await ludoGameStateRepository.getGameState(gameId);
      if (!gameState) {
        gameState = activeLudoGames.get(gameId) || null;
      }

      if (!gameState) {
        return {
          success: false,
          statusCode: 404,
          error: `Game session with ID [${gameId}] was not found.`,
        };
      }

      // 4. Safe validation: Do not force-end already finished games
      if (gameState.status === 'FINISHED') {
        return {
          success: false,
          statusCode: 400,
          error: 'Game is already finished.',
        };
      }

      // 5. Authoritatively transition game state to FINISHED with ADMIN_FORCED
      const now = Date.now();
      gameState.status = 'FINISHED';
      (gameState as any).finishReason = 'ADMIN_FORCED';
      gameState.finishedAt = now;
      if (!gameState.winner) {
        gameState.winner = null;
      }
      gameState.lastAction = {
        type: 'ADMIN_FORCE_END',
        payload: {
          adminUserId,
          reason: trimmedReason,
        },
        timestamp: now,
      };

      // 6. Clean up turn timers & active memory game entries
      clearGameTurnTimer(gameId);
      activeLudoGames.set(gameId, gameState);

      // 7. Persist to Redis with finished game TTL (1800s)
      await ludoGameStateRepository.saveGameState(gameState, 1800);

      // 8. Persist permanent MySQL Match History
      try {
        await LudoMatchHistoryService.createMatchResult(gameState);
      } catch (dbErr) {
        console.error(`⚠️ Failed to persist match history for force-ended game [${gameId}]:`, dbErr);
      }

      // 9. Realtime Socket.IO Broadcast to game participants and admin feeds
      if (io) {
        const gameRoom = `ludo:game:${gameId}`;
        const endPayload = {
          gameId,
          status: 'FINISHED',
          finishReason: 'ADMIN_FORCED',
          reason: trimmedReason,
          winner: gameState.winner,
          gameState,
        };

        io.to(gameRoom).emit('ludo:game_ended', endPayload);
        io.to(gameRoom).emit('ludo:state_updated', { gameId, gameState });
        io.to('admin:games:live').emit('admin:game_update', {
          gameId,
          status: 'FINISHED',
          finishReason: 'ADMIN_FORCED',
          gameState,
        });
        io.to(`admin:game:${gameId}`).emit('admin:game_update', {
          gameId,
          status: 'FINISHED',
          finishReason: 'ADMIN_FORCED',
          gameState,
        });
      }

      // 10. Audit Log Action
      if (adminUserId) {
        await AuditLogService.logAction({
          adminUserId,
          action: 'GAME_FORCE_ENDED',
          resourceType: 'GAME',
          resourceId: gameId,
          metadata: {
            reason: trimmedReason,
            mode: gameState.mode,
            players: gameState.players.map((p) => ({
              playerId: p.playerId,
              userId: p.userId,
              username: p.username,
              color: p.color,
              playerType: p.playerType,
            })),
          },
          req: reqMeta as any,
        });
      }

      // 11. Create Realtime Admin Notification
      try {
        await AdminNotificationService.createNotification({
          type: 'GAME_FORCE_ENDED',
          severity: 'WARNING',
          title: `Game Force-Ended: ${gameId}`,
          message: `Active ${gameState.mode} game (${gameId}) was force-ended. Reason: "${trimmedReason}"`,
          resourceType: 'GAME',
          resourceId: gameId,
          metadata: {
            mode: gameState.mode,
            reason: trimmedReason,
            adminUserId,
          },
          io,
        });
      } catch {}

      return {
        success: true,
        statusCode: 200,
        message: 'Game has been successfully terminated by administration.',
        gameState,
      };
    } finally {
      if (lockRes && lockRes.token) {
        try {
          await redisLockService.releaseLock(lockKey, lockRes.token);
        } catch {}
      }
    }
  }
}

export default AdminGameModerationService;
