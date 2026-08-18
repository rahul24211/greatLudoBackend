import Redis, { RedisOptions } from 'ioredis';
import env from './env';

let redisClient: Redis | null = null;

function buildRedisOptions(): RedisOptions {
  const options: RedisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
    reconnectOnError(err: Error) {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  };

  if (env.redisUsername) {
    options.username = env.redisUsername;
  }
  if (env.redisPassword) {
    options.password = env.redisPassword;
  }

  return options;
}

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    if (env.redisUrl && env.redisUrl.trim() !== '') {
      redisClient = new Redis(env.redisUrl, buildRedisOptions());
    } else {
      redisClient = new Redis({
        host: env.redisHost,
        port: env.redisPort,
        ...buildRedisOptions(),
      });
    }

    redisClient.on('connect', () => {
      console.log('✅ Connected to Redis server.');
    });

    redisClient.on('ready', () => {
      // Redis client is ready to accept commands
    });

    redisClient.on('error', (err) => {
      console.warn('⚠️ Redis connection error:', err.message);
    });

    redisClient.on('close', () => {
      // Redis connection closed
    });

    redisClient.on('reconnecting', () => {
      console.log('🔄 Reconnecting to Redis...');
    });
  }

  return redisClient;
};

export const connectRedis = async (): Promise<boolean> => {
  try {
    const client = getRedisClient();
    if (client.status === 'ready' || client.status === 'connecting' || client.status === 'connect') {
      return true;
    }
    await client.connect();
    return true;
  } catch (error) {
    console.warn('⚠️ Could not establish connection to Redis server.');
    console.warn('Error details:', error instanceof Error ? error.message : error);
    return false;
  }
};

export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    try {
      console.log('🔌 Gracefully closing Redis connection...');
      await redisClient.quit();
    } catch (err) {
      console.warn('⚠️ Error during Redis quit, forcing disconnect:', err);
      redisClient.disconnect();
    } finally {
      redisClient = null;
    }
  }
};

export const checkRedisHealth = async (): Promise<boolean> => {
  if (!redisClient) {
    return false;
  }
  try {
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
};

export default getRedisClient;
