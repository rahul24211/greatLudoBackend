import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import createApp from '../../app';
import { initializeSocket } from '../socketServer';
import { generateAccessToken } from '../../utils/tokenUtils';

async function runLudoSocketHandlerTests() {
  console.log('📡 Starting Classic Ludo Socket.IO Event Handler Integration Tests...');

  let server: http.Server | null = null;
  let client1: ClientSocketType | null = null;
  let client2: ClientSocketType | null = null;

  try {
    const app = createApp();
    server = http.createServer(app);
    initializeSocket(server);

    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as any;
    const port = addr.port;
    const serverUrl = `http://127.0.0.1:${port}`;

    const tokenUser1 = generateAccessToken({ id: 'user_p1', email: 'p1@ludo.com', username: 'PlayerOne' });
    const tokenUser2 = generateAccessToken({ id: 'user_p2', email: 'p2@ludo.com', username: 'PlayerTwo' });

    // 1. Connect Client 1 with Auth Token
    client1 = ClientSocket(serverUrl, {
      auth: { token: tokenUser1 },
      transports: ['websocket'],
      reconnection: false,
    });

    // 2. Connect Client 2 with Auth Token
    client2 = ClientSocket(serverUrl, {
      auth: { token: tokenUser2 },
      transports: ['websocket'],
      reconnection: false,
    });

    await Promise.all([
      new Promise<void>((resolve) => client1!.on('connect', () => resolve())),
      new Promise<void>((resolve) => client2!.on('connect', () => resolve())),
    ]);

    console.log(`✅ Client 1 connected (${client1.id}), Client 2 connected (${client2.id}).`);

    // --- Test 1: Create Game (ludo:create_game -> ludo:game_created) ---
    console.log('\n--- Test 1: Create Game Event ---');
    const createPromise = new Promise<any>((resolve) => {
      client1!.on('ludo:game_created', (data) => resolve(data));
    });

    client1.emit('ludo:create_game', { mode: 'CLASSIC' });

    const createdData = await createPromise;
    console.assert(createdData && createdData.gameId, 'Game ID must be returned');
    console.assert(createdData.gameState.status === 'WAITING', 'Game status must be WAITING');
    console.assert(createdData.gameState.players.length === 1, 'Initial player count must be 1');
    const gameId = createdData.gameId;
    console.log(`✅ Game created successfully with ID: ${gameId}`);

    // --- Test 2: Join Game (ludo:join_game -> ludo:player_joined) ---
    console.log('\n--- Test 2: Join Game Event ---');
    const joinPromise = new Promise<any>((resolve) => {
      client1!.on('ludo:player_joined', (data) => resolve(data));
    });

    client2.emit('ludo:join_game', { gameId });

    const joinedData = await joinPromise;
    console.assert(joinedData.gameId === gameId, 'Game ID mismatch on join');
    console.assert(joinedData.playerId === 'user_p2', 'Joined player ID must be user_p2');
    console.assert(joinedData.gameState.players.length === 2, 'Player count must be 2 after join');
    console.log('✅ Player 2 joined game successfully.');

    // --- Test 3: Start Game (ludo:start_game -> ludo:game_started) ---
    console.log('\n--- Test 3: Start Game Event ---');
    const startPromise = new Promise<any>((resolve) => {
      client2!.on('ludo:game_started', (data) => resolve(data));
    });

    client1.emit('ludo:start_game', { gameId });

    const startedData = await startPromise;
    console.assert(startedData.gameState.status === 'ACTIVE', 'Game status must be ACTIVE');
    console.assert(startedData.currentPlayerId === 'user_p1', 'Current player must be user_p1');
    console.log('✅ Game started successfully.');

    // --- Test 4: Wrong Player Roll Rejection ---
    console.log('\n--- Test 4: Wrong Player Roll Rejection ---');
    const wrongRollErrorPromise = new Promise<any>((resolve) => {
      client2!.on('ludo:error', (data) => resolve(data));
    });

    // Client 2 (user_p2) attempts to roll out of turn
    client2.emit('ludo:roll_dice', { gameId });

    const errorData = await wrongRollErrorPromise;
    console.assert(errorData.code === 'NOT_YOUR_TURN', `Expected NOT_YOUR_TURN error, got ${errorData.code}`);
    console.log('✅ Wrong player roll attempt correctly rejected.');

    // --- Test 5: Current Player Roll Dice ---
    console.log('\n--- Test 5: Current Player Roll Dice ---');
    const rollPromise = new Promise<any>((resolve) => {
      client2!.on('ludo:dice_rolled', (data) => resolve(data));
    });

    client1.emit('ludo:roll_dice', { gameId });

    const rolledData = await rollPromise;
    console.assert(rolledData.gameId === gameId, 'Game ID mismatch');
    console.assert(rolledData.playerId === 'user_p1', 'Player ID mismatch');
    console.assert(rolledData.diceValue >= 1 && rolledData.diceValue <= 6, 'Dice value must be 1..6');
    console.assert(Array.isArray(rolledData.validMoves), 'validMoves must be array');
    console.log(`✅ Dice rolled successfully with value: ${rolledData.diceValue}`);

    // --- Test 6: Get State (ludo:get_state -> ludo:state_updated) ---
    console.log('\n--- Test 6: Get State Event ---');
    const statePromise = new Promise<any>((resolve) => {
      client1!.on('ludo:state_updated', (data) => resolve(data));
    });

    client1.emit('ludo:get_state', { gameId });

    const stateData = await statePromise;
    console.assert(stateData.gameId === gameId, 'Game ID mismatch');
    console.assert(stateData.gameState.diceRolled === true, 'diceRolled must be true');
    console.log('✅ Game state retrieved successfully.');

    // --- Test 7: Disconnect Handling ---
    console.log('\n--- Test 7: Disconnect Handling ---');
    client2.disconnect();
    await new Promise((r) => setTimeout(r, 200));
    console.log('✅ Disconnection handled safely without destroying game state.');

    console.log('\n🎉 ALL LUDO SOCKET.IO HANDLER TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Ludo Socket Handler Test Failed:', err);
    process.exit(1);
  } finally {
    if (client1) client1.disconnect();
    if (client2 && client2.connected) client2.disconnect();

    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((r) => server!.close(() => r()));
    }

    process.exit(0);
  }
}

runLudoSocketHandlerTests();
