export type RedisEntityType = 'game' | 'room' | 'user' | 'presence' | 'timer' | 'lock' | 'ratelimit' | 'matchmaking' | string;

export function redisKey(entity: RedisEntityType, id: string): string {
  return `ludo:${entity.toLowerCase()}:${id}`;
}

export function gameKey(gameId: string): string {
  return redisKey('game', gameId);
}

export function roomKey(roomId: string): string {
  return redisKey('room', roomId);
}

export function userKey(userId: string): string {
  return redisKey('user', userId);
}

export function presenceKey(userId: string): string {
  return redisKey('presence', userId);
}

export function timerKey(gameId: string): string {
  return redisKey('timer', gameId);
}

export function lockKey(resourceName: string, id: string): string {
  return `ludo:lock:${resourceName.toLowerCase()}:${id}`;
}

export function rateLimitKey(category: string, identifier: string): string {
  return `ludo:ratelimit:${category.toLowerCase()}:${identifier}`;
}

export function matchmakingKey(mode: string): string {
  return `ludo:matchmaking:${mode.toLowerCase()}`;
}
