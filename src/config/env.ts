import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: parseInt(process.env.DB_PORT || '3306', 10),
  dbName: process.env.DB_NAME || 'ludo_arena',
  dbUser: process.env.DB_USER || 'root',
  dbPassword: process.env.DB_PASSWORD || '',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_jwt_key_ludo_arena_2026',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_jwt_key_ludo_arena_2026',
  encryptionKey: process.env.ENCRYPTION_KEY || 'super_secret_aes_encryption_key_32_bytes_2026',
  nodeEnv: process.env.NODE_ENV || 'development',
  redisUrl: process.env.REDIS_URL || '',
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisUsername: process.env.REDIS_USERNAME || undefined,
  redisPassword: process.env.REDIS_PASSWORD || undefined,
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  authRateLimitWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10),
  authRateLimitMaxRequests: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '10', 10),
  roomRateLimitWindowMs: parseInt(process.env.ROOM_RATE_LIMIT_WINDOW_MS || '60000', 10),
  roomRateLimitMaxRequests: parseInt(process.env.ROOM_RATE_LIMIT_MAX_REQUESTS || '15', 10),
  redisRoomTtlSeconds: parseInt(process.env.REDIS_ROOM_TTL_SECONDS || '3600', 10),
  redisGameTtlSeconds: parseInt(process.env.LUDO_GAME_TTL_SECONDS || process.env.REDIS_GAME_TTL_SECONDS || '7200', 10),
  redisFinishedGameTtlSeconds: parseInt(process.env.LUDO_FINISHED_GAME_TTL_SECONDS || process.env.REDIS_FINISHED_GAME_TTL_SECONDS || '1800', 10),
  redisPresenceTtlSeconds: parseInt(process.env.REDIS_PRESENCE_TTL_SECONDS || '300', 10),
};

export function validateEnv(): boolean {
  if (env.nodeEnv === 'production') {
    const missing: string[] = [];
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('super_secret')) missing.push('JWT_SECRET');
    if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.includes('super_secret')) missing.push('JWT_REFRESH_SECRET');
    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) missing.push('ENCRYPTION_KEY');
    if (!process.env.DB_PASSWORD) missing.push('DB_PASSWORD');

    if (missing.length > 0) {
      console.error(`🚨 Fatal Configuration Error: Missing or unsafe production environment variables: [${missing.join(', ')}]`);
      return false;
    }
  }
  return true;
}

validateEnv();

export default env;
