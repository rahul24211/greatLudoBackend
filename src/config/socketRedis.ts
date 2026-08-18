import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import getRedisClient from './redis';

let pubClient: Redis | null = null;
let subClient: Redis | null = null;

export const setupSocketRedisAdapter = async (io: SocketIOServer): Promise<boolean> => {
  try {
    const mainClient = getRedisClient();

    pubClient = mainClient.duplicate();
    subClient = mainClient.duplicate();

    pubClient.on('error', (err) => {
      console.warn('⚠️ Socket.IO Redis Adapter Pub Error:', err.message);
    });

    subClient.on('error', (err) => {
      console.warn('⚠️ Socket.IO Redis Adapter Sub Error:', err.message);
    });

    io.adapter(createAdapter(pubClient, subClient));
    console.log('📡 Socket.IO Redis Adapter initialized for multi-node event scaling.');
    return true;
  } catch (error) {
    console.warn('⚠️ Could not initialize Socket.IO Redis Adapter. Falling back to default memory adapter.');
    console.warn('Error details:', error instanceof Error ? error.message : error);
    return false;
  }
};

export const closeSocketRedisAdapter = async (): Promise<void> => {
  if (pubClient) {
    try {
      await pubClient.quit();
    } catch {
      pubClient.disconnect();
    } finally {
      pubClient = null;
    }
  }

  if (subClient) {
    try {
      await subClient.quit();
    } catch {
      subClient.disconnect();
    } finally {
      subClient = null;
    }
  }
};
