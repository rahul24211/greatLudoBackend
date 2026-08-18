import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { registerLudoSocketHandlers } from '../ludoSocketHandler';
import { connectRedis, closeRedis } from '../../config/redis';
import ludoGameStateRepository from '../../repositories/redis/LudoGameStateRepository';

async function runLudoReconnectResumeTests() {
  console.log('🔄 Starting Classic Ludo Reconnect & Resume-Game Socket Tests...');

  const isConnected = await connectRedis();
  if (!isConnected) {
    console.warn('⚠️ Redis not connected. Running in-memory socket fallback tests.');
  }

  const httpServer = createServer();
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    registerLudoSocketHandlers(io, socket);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address() as any;
  const serverUrl = `http://localhost:${address.port}`;

  let client1: ClientSocketType;
  let client2: ClientSocketType;
  let unauthorizedClient: ClientSocketType;

  try {
    client1 = ClientSocket(serverUrl, { transports: ['websocket'] });
    client2 = ClientSocket(serverUrl, { transports: ['websocket'] });
    unauthorizedClient = ClientSocket(serverUrl, { transports: ['websocket'] });

    await Promise.all([
      new Promise<void>((resolve) => client1.on('connect', () => resolve())),
      new Promise<void>((resolve) => client2.on('connect', () => resolve())),
      new Promise<void>((resolve) => unauthorizedClient.on('connect', () => resolve())),
    ]);

    // 1. Create Game
    console.log('\n--- Test 1: Setup Active Game with 2 Players & Roll Dice ---');
    let gameId = '';

    await new Promise<void>((resolve) => {
      client1.emit('ludo:create_game', { mode: 'CLASSIC' }, (res: any) => {
        gameId = res.gameId;
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      client2.emit('ludo:join_game', { gameId }, () => resolve());
    });

    await new Promise<void>((resolve) => {
      client1.emit('ludo:start_game', { gameId }, () => resolve());
    });

    // Roll dice as current player (client1)
    let rolledDiceValue = 0;
    await new Promise<void>((resolve) => {
      client1.emit('ludo:roll_dice', { gameId }, (res: any) => {
        rolledDiceValue = res.diceValue;
        resolve();
      });
    });
    console.assert(rolledDiceValue >= 1 && rolledDiceValue <= 6, 'Dice value must be 1..6');
    console.log(`✅ Game setup complete with dice roll value = ${rolledDiceValue}.`);

    // 2. Reconnect / Resume by Participant (client1)
    console.log('\n--- Test 2: Participant Socket Reconnect & Resume Game ---');
    let resumedState: any = null;
    let resumedValidMoves: any[] = [];

    await new Promise<void>((resolve) => {
      client1.emit('ludo:resume_game', { gameId }, (res: any) => {
        console.assert(res.success === true, 'resume_game must succeed for participant');
        resumedState = res.gameState;
        resumedValidMoves = res.validMoves;
        resolve();
      });
    });

    console.assert(resumedState !== null, 'Resumed state must not be null');
    console.assert(resumedState.gameId === gameId, 'gameId must match');
    console.assert(resumedState.diceRolled === true, 'diceRolled state must be preserved');
    console.assert(resumedState.diceValue === rolledDiceValue, 'diceValue must match rolled value');
    console.assert(Array.isArray(resumedValidMoves), 'validMoves must be returned');
    console.log('✅ Successful participant reconnect and state/dice/validMoves resume verified.');

    // 3. Unauthorized Non-Member Resume Rejection
    console.log('\n--- Test 3: Non-Member Resume Rejection ---');
    const nonMemberErrorPromise = new Promise<any>((resolve) => {
      unauthorizedClient.once('ludo:error', (err) => resolve(err));
    });

    unauthorizedClient.emit('ludo:resume_game', { gameId });
    const nonMemberErr = await nonMemberErrorPromise;

    console.assert(
      nonMemberErr !== null && nonMemberErr.code === 'UNAUTHORIZED',
      'Non-member must receive UNAUTHORIZED error'
    );
    console.log('✅ Non-member resume rejection verified.');

    // 4. Missing Game Resume Rejection
    console.log('\n--- Test 4: Missing Game Resume Rejection ---');
    const missingErrorPromise = new Promise<any>((resolve) => {
      client1.once('ludo:error', (err) => resolve(err));
    });

    client1.emit('ludo:resume_game', { gameId: 'non_existent_game_999' });
    const missingErr = await missingErrorPromise;

    console.assert(
      missingErr !== null && missingErr.code === 'GAME_NOT_FOUND',
      'Missing game resume must return GAME_NOT_FOUND'
    );
    console.log('✅ Missing game resume rejection verified.');

    // 5. Clean Up Test Game from Redis
    await ludoGameStateRepository.deleteGameState(gameId);

    console.log('\n🎉 ALL LUDO RECONNECT & RESUME SOCKET TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Ludo Reconnect & Resume Socket Test Failed:', err);
    process.exit(1);
  } finally {
    if (client1!) client1.disconnect();
    if (client2!) client2.disconnect();
    if (unauthorizedClient!) unauthorizedClient.disconnect();
    httpServer.close();
    await closeRedis();
    process.exit(0);
  }
}

runLudoReconnectResumeTests();
