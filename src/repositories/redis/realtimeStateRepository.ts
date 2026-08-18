import redisService from '../../services/redis/redisService';
import { roomKey, gameKey, presenceKey } from '../../services/redis/redisKeys';
import { LudoGameState } from '../../game-engine/ludo/LudoTypes';
import { RedisRoomState, RedisUserPresence } from './types';
import env from '../../config/env';

export class RealtimeStateRepository {
  // ==================== ROOM STATE ====================

  /**
   * Save temporary realtime room state with TTL
   */
  public async saveRoomState(room: RedisRoomState, ttlSeconds?: number): Promise<boolean> {
    if (!room || !room.roomId) return false;
    const rKey = roomKey(room.roomId);
    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : env.redisRoomTtlSeconds;
    room.updatedAt = Date.now();
    return await redisService.setJson(rKey, room, ttl);
  }

  /**
   * Get temporary realtime room state by roomId
   */
  public async getRoomState(roomId: string): Promise<RedisRoomState | null> {
    if (!roomId) return null;
    const rKey = roomKey(roomId);
    return await redisService.getJson<RedisRoomState>(rKey);
  }

  /**
   * Delete room state (cleanup when room is closed/finished)
   */
  public async deleteRoomState(roomId: string): Promise<boolean> {
    if (!roomId) return false;
    const rKey = roomKey(roomId);
    return await redisService.delete(rKey);
  }

  /**
   * Check if a room exists in Redis
   */
  public async roomExists(roomId: string): Promise<boolean> {
    if (!roomId) return false;
    const rKey = roomKey(roomId);
    return await redisService.exists(rKey);
  }

  /**
   * Refresh/extend room state expiration TTL
   */
  public async refreshRoomStateTtl(roomId: string, ttlSeconds?: number): Promise<boolean> {
    if (!roomId) return false;
    const rKey = roomKey(roomId);
    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : env.redisRoomTtlSeconds;
    return await redisService.expire(rKey, ttl);
  }

  // ==================== GAME STATE ====================

  /**
   * Save active Ludo game state in Redis with TTL
   */
  public async saveGameState(state: LudoGameState, ttlSeconds?: number): Promise<boolean> {
    if (!state || !state.gameId) return false;
    const gKey = gameKey(state.gameId);
    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : env.redisGameTtlSeconds;
    return await redisService.setJson(gKey, state, ttl);
  }

  /**
   * Retrieve active Ludo game state by gameId
   */
  public async getGameState(gameId: string): Promise<LudoGameState | null> {
    if (!gameId) return null;
    const gKey = gameKey(gameId);
    return await redisService.getJson<LudoGameState>(gKey);
  }

  /**
   * Delete active game state from Redis
   */
  public async deleteGameState(gameId: string): Promise<boolean> {
    if (!gameId) return false;
    const gKey = gameKey(gameId);
    return await redisService.delete(gKey);
  }

  /**
   * Check if an active game exists in Redis
   */
  public async gameExists(gameId: string): Promise<boolean> {
    if (!gameId) return false;
    const gKey = gameKey(gameId);
    return await redisService.exists(gKey);
  }

  /**
   * Refresh/extend active game state expiration TTL so long games do not vanish
   */
  public async refreshGameStateTtl(gameId: string, ttlSeconds?: number): Promise<boolean> {
    if (!gameId) return false;
    const gKey = gameKey(gameId);
    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : env.redisGameTtlSeconds;
    return await redisService.expire(gKey, ttl);
  }

  // ==================== USER PRESENCE ====================

  /**
   * Set user presence state in Redis with TTL
   */
  public async setUserPresence(presence: RedisUserPresence, ttlSeconds?: number): Promise<boolean> {
    if (!presence || !presence.userId) return false;
    const pKey = presenceKey(presence.userId);
    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : env.redisPresenceTtlSeconds;
    presence.lastSeen = Date.now();
    return await redisService.setJson(pKey, presence, ttl);
  }

  /**
   * Get user presence state from Redis
   */
  public async getUserPresence(userId: string): Promise<RedisUserPresence | null> {
    if (!userId) return null;
    const pKey = presenceKey(userId);
    return await redisService.getJson<RedisUserPresence>(pKey);
  }

  /**
   * Remove user presence from Redis
   */
  public async removeUserPresence(userId: string): Promise<boolean> {
    if (!userId) return false;
    const pKey = presenceKey(userId);
    return await redisService.delete(pKey);
  }

  /**
   * Refresh/extend user presence TTL (heartbeat)
   */
  public async refreshUserPresenceTtl(userId: string, ttlSeconds?: number): Promise<boolean> {
    if (!userId) return false;
    const pKey = presenceKey(userId);
    const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : env.redisPresenceTtlSeconds;
    return await redisService.expire(pKey, ttl);
  }
}

export const realtimeStateRepository = new RealtimeStateRepository();
export default realtimeStateRepository;
