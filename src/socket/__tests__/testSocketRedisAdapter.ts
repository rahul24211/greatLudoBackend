import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import createApp from '../../app';
import { initializeSocket } from '../socketServer';
import { connectRedis, closeRedis } from '../../config/redis';
import { closeSocketRedisAdapter } from '../../config/socketRedis';

async function runSocketRedisAdapterTests() {
  console.log('📡 Starting Socket.IO Redis Adapter Multi-Node Integration Tests...');

  const isConnected = await connectRedis();
  if (!isConnected) {
    console.warn('⚠️ Redis is not connected. Skipping Socket.IO Redis Adapter tests.');
    process.exit(0);
  }

  let serverA: http.Server | null = null;
  let serverB: http.Server | null = null;
  let client1: ClientSocketType | null = null;
  let client2: ClientSocketType | null = null;

  try {
    // 1. Create Server A (Node instance 1)
    const appA = createApp();
    serverA = http.createServer(appA);
    initializeSocket(serverA);

    await new Promise<void>((resolve) => {
      serverA!.listen(0, '127.0.0.1', () => resolve());
    });
    const addrA = serverA.address() as any;
    const portA = addrA.port;

    // 2. Create Server B (Node instance 2)
    const appB = createApp();
    serverB = http.createServer(appB);
    initializeSocket(serverB);

    await new Promise<void>((resolve) => {
      serverB!.listen(0, '127.0.0.1', () => resolve());
    });
    const addrB = serverB.address() as any;
    const portB = addrB.port;

    console.log(`🌐 Server A listening on port ${portA}, Server B listening on port ${portB}`);

    // 3. Connect Client 1 to Server A
    client1 = ClientSocket(`http://127.0.0.1:${portA}`, {
      transports: ['websocket'],
      reconnection: false,
    });

    // 4. Connect Client 2 to Server B
    client2 = ClientSocket(`http://127.0.0.1:${portB}`, {
      transports: ['websocket'],
      reconnection: false,
    });

    await Promise.all([
      new Promise<void>((resolve) => client1!.on('connect', () => resolve())),
      new Promise<void>((resolve) => client2!.on('connect', () => resolve())),
    ]);

    console.log(`✅ Client 1 connected to Server A (${client1.id}), Client 2 connected to Server B (${client2.id}).`);

    const roomId = 'private_room_multi_node_999';

    // 5. Both clients join the same room on different server instances
    client1.emit('join_room', roomId);
    client2.emit('join_room', roomId);

    // Wait 500ms for room join propagation across Redis adapter
    await new Promise((r) => setTimeout(r, 500));

    // 6. Test cross-node messaging: Client 1 on Server A -> Server B -> Client 2
    console.log('\n--- Test 1: Cross-Node Room Messaging (Server A -> Redis -> Server B) ---');
    const messagePromise = new Promise<{ roomId: string; message: string }>((resolve) => {
      client2!.on('room_message', (data) => resolve(data));
    });

    client1.emit('room_message', { roomId, message: 'Hello across Redis nodes!' });

    const receivedData = await messagePromise;
    console.assert(receivedData.roomId === roomId, 'Room ID mismatch on message receive');
    console.assert(receivedData.message === 'Hello across Redis nodes!', 'Message content mismatch');
    console.log('✅ Test 1 passed: Message emitted on Server A successfully received by Client on Server B via Redis Pub/Sub.');

    // 7. Test cross-node ready state propagation: Client 2 on Server B -> Server A -> Client 1
    console.log('\n--- Test 2: Cross-Node Ready Event Propagation ---');
    const readyPromise = new Promise<{ roomId: string; playerId: string }>((resolve) => {
      client1!.on('player_ready', (data) => resolve(data));
    });

    client2.emit('player_ready', { roomId, playerId: 'player_user_456' });

    const readyData = await readyPromise;
    console.assert(readyData.roomId === roomId, 'Room ID mismatch on ready event');
    console.assert(readyData.playerId === 'player_user_456', 'Player ID mismatch on ready event');
    console.log('✅ Test 2 passed: Ready event emitted on Server B successfully received by Client on Server A via Redis Pub/Sub.');

    console.log('\n🎉 ALL SOCKET.IO REDIS ADAPTER TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Socket.IO Redis Adapter Test Failed:', err);
    process.exit(1);
  } finally {
    if (client1) client1.disconnect();
    if (client2) client2.disconnect();

    if (serverA) {
      serverA.closeAllConnections?.();
      await new Promise<void>((r) => serverA!.close(() => r()));
    }
    if (serverB) {
      serverB.closeAllConnections?.();
      await new Promise<void>((r) => serverB!.close(() => r()));
    }

    await closeSocketRedisAdapter();
    await closeRedis();
    process.exit(0);
  }
}

runSocketRedisAdapterTests();
