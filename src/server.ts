import http from 'http';
import createApp from './app';
import env from './config/env';
import { connectDatabase, closeDatabase } from './config/database';
import { connectRedis, closeRedis } from './config/redis';
import { closeSocketRedisAdapter } from './config/socketRedis';
import { initializeSocket } from './socket/socketServer';

const startServer = async (): Promise<void> => {
  const app = createApp();
  const server = http.createServer(app);

  initializeSocket(server);

  await connectDatabase();
  await connectRedis();

  server.listen(env.port, () => {
    console.log(`🚀 Ludo Arena Backend listening on http://localhost:${env.port}`);
    console.log(`📡 Socket.IO server ready on http://localhost:${env.port}`);
  });

  const handleShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await closeSocketRedisAdapter();
      await closeRedis();
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
};

startServer().catch((err) => {
  console.error('Fatal Server Startup Error:', err);
  process.exit(1);
});

