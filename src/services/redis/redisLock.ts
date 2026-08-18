import getRedisClient from '../../config/redis';
import crypto from 'crypto';

export interface LockAcquireResult {
  acquired: boolean;
  token?: string;
  key?: string;
  ttlMs?: number;
}

export interface LockReleaseResult {
  released: boolean;
  reason?: string;
}

const DEFAULT_LOCK_TTL_MS = 5000;

// Lua script to atomically compare the lock token and delete key
const RELEASE_LOCK_LUA_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

export class RedisLockService {
  /**
   * Acquire a distributed lock atomically using SET key token PX ttlMs NX.
   * @param key Redis lock key (e.g. ludo:lock:game:gameId)
   * @param ttlMs Time-to-live in milliseconds (default: 5000ms)
   */
  public async acquireLock(key: string, ttlMs: number = DEFAULT_LOCK_TTL_MS): Promise<LockAcquireResult> {
    if (!key || typeof key !== 'string') {
      return { acquired: false };
    }

    const validTtl = typeof ttlMs === 'number' && ttlMs > 0 ? Math.floor(ttlMs) : DEFAULT_LOCK_TTL_MS;
    const lockToken = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    try {
      const client = getRedisClient();
      // Execute SET key lockToken PX validTtl NX atomically
      const result = await client.set(key, lockToken, 'PX', validTtl, 'NX');

      if (result === 'OK') {
        return {
          acquired: true,
          token: lockToken,
          key,
          ttlMs: validTtl,
        };
      }

      return { acquired: false };
    } catch (error) {
      console.warn(`⚠️ Redis acquireLock error for key [${key}]:`, error instanceof Error ? error.message : error);
      return { acquired: false };
    }
  }

  /**
   * Release a distributed lock atomically using Lua script.
   * @param key Redis lock key
   * @param lockToken Unique token received during lock acquisition
   */
  public async releaseLock(key: string, lockToken: string): Promise<LockReleaseResult> {
    if (!key || !lockToken) {
      return { released: false, reason: 'Invalid key or lock token' };
    }

    try {
      const client = getRedisClient();
      // Execute atomic Lua script
      const deletedCount = await client.eval(RELEASE_LOCK_LUA_SCRIPT, 1, key, lockToken);

      if (deletedCount === 1) {
        return { released: true };
      }

      return { released: false, reason: 'Lock token mismatch or lock expired' };
    } catch (error) {
      console.warn(`⚠️ Redis releaseLock error for key [${key}]:`, error instanceof Error ? error.message : error);
      return { released: false, reason: 'Redis operation error' };
    }
  }
}

export const redisLockService = new RedisLockService();
export default redisLockService;
