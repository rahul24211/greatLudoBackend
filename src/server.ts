import http from 'http';
import createApp from './app';
import env from './config/env';
import { connectDatabase } from './config/database';
import { initializeSocket } from './socket/socketServer';

const startServer = async (): Promise<void> => {
  const app = createApp();
  const server = http.createServer(app);

  initializeSocket(server);

  await connectDatabase();

  server.listen(env.port, () => {
    console.log(`🚀 Ludo Arena Backend listening on http://localhost:${env.port}`);
    console.log(`📡 Socket.IO server ready on http://localhost:${env.port}`);
  });
};

startServer().catch((err) => {
  console.error('Fatal Server Startup Error:', err);
  process.exit(1);
});
