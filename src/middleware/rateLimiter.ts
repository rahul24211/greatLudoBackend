import rateLimit, { Store, IncrementResponse } from 'express-rate-limit';
import getRedisClient from '../config/redis';
import env from '../config/env';
import { rateLimitKey } from '../services/redis/redisKeys';

export class ExpressRedisStore implements Store {
  private category: string;
  private windowMs: number;

  constructor(category: string, windowMs: number) {
    this.category = category;
    this.windowMs = windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const client = getRedisClient();
    const rKey = rateLimitKey(this.category, key);
    const ttlSeconds = Math.ceil(this.windowMs / 1000);

    const pipeline = client.pipeline();
    pipeline.incr(rKey);
    pipeline.ttl(rKey);

    const results = await pipeline.exec();
    if (!results || results.length < 2) {
      throw new Error('Redis rate limit pipeline failed');
    }

    const hits = (results[0][1] as number) || 1;
    let ttl = (results[1][1] as number) || -1;

    if (ttl === -1 || ttl === -2) {
      await client.expire(rKey, ttlSeconds);
      ttl = ttlSeconds;
    }

    const resetTime = new Date(Date.now() + (ttl > 0 ? ttl : ttlSeconds) * 1000);

    return {
      totalHits: hits,
      resetTime,
    };
  }

  async decrement(key: string): Promise<void> {
    try {
      const client = getRedisClient();
      const rKey = rateLimitKey(this.category, key);
      await client.decr(rKey);
    } catch {
      // Ignore Redis store decrement errors
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      const client = getRedisClient();
      const rKey = rateLimitKey(this.category, key);
      await client.del(rKey);
    } catch {
      // Ignore Redis store reset errors
    }
  }
}

const commonLimiterOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  validate: false as const,
  handler: (_req: any, res: any) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
    });
  },
};

export const globalRateLimiter = rateLimit({
  ...commonLimiterOptions,
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  store: new ExpressRedisStore('general', env.rateLimitWindowMs),
});

export const authRateLimiter = rateLimit({
  ...commonLimiterOptions,
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMaxRequests,
  store: new ExpressRedisStore('auth', env.authRateLimitWindowMs),
});

export const roomRateLimiter = rateLimit({
  ...commonLimiterOptions,
  windowMs: env.roomRateLimitWindowMs,
  max: env.roomRateLimitMaxRequests,
  store: new ExpressRedisStore('room', env.roomRateLimitWindowMs),
});
