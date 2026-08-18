export interface RedisRoomPlayer {
  userId: string;
  username?: string;
  color?: string;
  isReady: boolean;
  isConnected: boolean;
  joinedAt: number;
}

export interface RedisRoomState {
  roomId: string;
  hostId: string;
  status: 'WAITING' | 'STARTING' | 'IN_GAME' | 'CLOSED' | string;
  gameMode: string;
  maxPlayers: number;
  players: RedisRoomPlayer[];
  createdAt: number;
  updatedAt: number;
}

export type RedisPresenceStatus = 'ONLINE' | 'IN_GAME' | 'IN_ROOM' | 'OFFLINE';

export interface RedisUserPresence {
  userId: string;
  state: RedisPresenceStatus;
  roomId?: string;
  gameId?: string;
  lastSeen: number;
}
