import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { isOriginAllowed } from '../app';
import { setupSocketRedisAdapter } from '../config/socketRedis';
import { verifyAccessToken } from '../utils/tokenUtils';
import { registerLudoSocketHandlers } from './ludoSocketHandler';

export const initializeSocket = (httpServer: HttpServer): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: isOriginAllowed,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Attach Redis adapter for scaling across instances
  setupSocketRedisAdapter(io);

  // Authentication Middleware for Socket Handshake
  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (token) {
      try {
        const decoded = verifyAccessToken(token);
        socket.data.user = decoded;
      } catch {
        // Token invalid/expired - socket connects without authenticated user session
      }
    }

    const persistentUserId =
      socket.handshake.auth?.userId ||
      socket.handshake.query?.userId;

    if (persistentUserId && typeof persistentUserId === 'string') {
      socket.data.userId = persistentUserId;
    }

    next();
  });

  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected to Socket.IO: ${socket.id}`);

    // Register Ludo Game Engine Socket Event Handlers
    registerLudoSocketHandlers(io, socket);

    // Private Room handlers
    socket.on('join_room', (roomId: string) => {
      if (roomId) {
        socket.join(roomId);
        console.log(`👤 Socket ${socket.id} joined room ${roomId}`);
        socket.to(roomId).emit('player_joined', { socketId: socket.id, roomId });
      }
    });

    socket.on('leave_room', (roomId: string) => {
      if (roomId) {
        socket.leave(roomId);
        console.log(`👤 Socket ${socket.id} left room ${roomId}`);
        socket.to(roomId).emit('player_left', { socketId: socket.id, roomId });
      }
    });

    socket.on('room_message', (data: { roomId: string; message: any }) => {
      if (data && data.roomId) {
        io.to(data.roomId).emit('room_message', data);
      }
    });

    socket.on('player_ready', (data: { roomId: string; playerId: string }) => {
      if (data && data.roomId) {
        io.to(data.roomId).emit('player_ready', data);
      }
    });

    socket.on('disconnect', () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });

  return io;
};
