import redisService from '../../services/redis/redisService';
import { gameKey } from '../../services/redis/redisKeys';
import { LudoGameState } from '../../game-engine/ludo/LudoTypes';
import env from '../../config/env';

export class LudoGameStateRepository {
  /**
   * Validate Ludo game state structure before persisting to Redis.
   */
  public validateGameState(state: LudoGameState): boolean {
    if (!state || typeof state !== 'object') return false;
    if (!state.gameId || typeof state.gameId !== 'string') return false;
    if (!state.status || !['WAITING', 'ACTIVE', 'FINISHED'].includes(state.status)) return false;
    if (!Array.isArray(state.players) || state.players.length === 0) return false;

    // Validate players and 4 tokens per player
    for (const player of state.players) {
      if (!player || !player.playerId || !Array.isArray(player.tokens)) {
        return false;
      }
      if (player.tokens.length !== 4) {
        return false;
      }
    }

    return true;
  }

  /**
   * Save active or finished Ludo game state to Redis with configurable TTL.
   */
  public async saveGameState(state: LudoGameState, ttlSeconds?: number): Promise<boolean> {
    if (!this.validateGameState(state)) {
      console.warn(`⚠️ Cannot save malformed game state for gameId: ${state?.gameId}`);
      return false;
    }

    const key = gameKey(state.gameId);
    let ttl = ttlSeconds;

    if (!ttl || ttl <= 0) {
      ttl = state.status === 'FINISHED' ? env.redisFinishedGameTtlSeconds : env.redisGameTtlSeconds;
    }

    return await redisService.setJson(key, state, ttl);
  }

  /**
   * Retrieve authoritative active Ludo game state by gameId from Redis.
   */
  public async getGameState(gameId: string): Promise<LudoGameState | null> {
    if (!gameId || typeof gameId !== 'string') return null;

    const key = gameKey(gameId);
    const state = await redisService.getJson<LudoGameState>(key);

    if (state && this.validateGameState(state)) {
      return state;
    }

    return null;
  }

  /**
   * Delete active game state from Redis.
   */
  public async deleteGameState(gameId: string): Promise<boolean> {
    if (!gameId) return false;
    const key = gameKey(gameId);
    return await redisService.delete(key);
  }

  /**
   * Check if a game state exists in Redis.
   */
  public async gameExists(gameId: string): Promise<boolean> {
    if (!gameId) return false;
    const key = gameKey(gameId);
    return await redisService.exists(key);
  }
}

export const ludoGameStateRepository = new LudoGameStateRepository();
export default ludoGameStateRepository;
