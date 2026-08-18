import getRedisClient from '../../config/redis';

export class RedisService {
  /**
   * Get value by key
   */
  public async get(key: string): Promise<string | null> {
    try {
      const client = getRedisClient();
      return await client.get(key);
    } catch (error) {
      console.warn(`⚠️ Redis get error for key [${key}]:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Set key-value pair
   */
  public async set(key: string, value: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.set(key, value);
      return result === 'OK';
    } catch (error) {
      console.warn(`⚠️ Redis set error for key [${key}]:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Set key-value pair with TTL in seconds
   */
  public async setWithExpiry(key: string, value: string, seconds: number): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.setex(key, seconds, value);
      return result === 'OK';
    } catch (error) {
      console.warn(`⚠️ Redis setWithExpiry error for key [${key}]:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Delete a key
   */
  public async delete(key: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      const deletedCount = await client.del(key);
      return deletedCount > 0;
    } catch (error) {
      console.warn(`⚠️ Redis delete error for key [${key}]:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Check if a key exists
   */
  public async exists(key: string): Promise<boolean> {
    try {
      const client = getRedisClient();
      const count = await client.exists(key);
      return count > 0;
    } catch (error) {
      console.warn(`⚠️ Redis exists error for key [${key}]:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Set expiration TTL in seconds on an existing key
   */
  public async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const client = getRedisClient();
      const result = await client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      console.warn(`⚠️ Redis expire error for key [${key}]:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Store an object as JSON string in Redis
   */
  public async setJson(key: string, data: any, seconds?: number): Promise<boolean> {
    try {
      const jsonString = JSON.stringify(data);
      if (seconds !== undefined && seconds > 0) {
        return await this.setWithExpiry(key, jsonString, seconds);
      }
      return await this.set(key, jsonString);
    } catch (error) {
      console.warn(`⚠️ Redis setJson error for key [${key}]:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Retrieve and parse JSON data from Redis
   */
  public async getJson<T = any>(key: string): Promise<T | null> {
    try {
      const rawValue = await this.get(key);
      if (!rawValue) return null;
      return JSON.parse(rawValue) as T;
    } catch (error) {
      console.warn(`⚠️ Redis getJson parse error for key [${key}]:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Delete multiple keys at once
   */
  public async deleteMany(keys: string[]): Promise<number> {
    if (!keys || keys.length === 0) return 0;
    try {
      const client = getRedisClient();
      return await client.del(...keys);
    } catch (error) {
      console.warn(`⚠️ Redis deleteMany error:`, error instanceof Error ? error.message : error);
      return 0;
    }
  }
}

export const redisService = new RedisService();
export default redisService;
