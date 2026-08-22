import test from 'node:test';
import assert from 'node:assert/strict';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import http from 'node:http';
import { registerLudoSocketHandlers, saveAuthoritativeState } from '../ludoSocketHandler';
import { LudoGameState } from '../../game-engine/ludo/LudoTypes';
import { closeRedis } from '../../config/redis';

test('Ludo Timeout Disqualification & Multi-Game Background Flow Tests', async (t) => {
  let server: http.Server;
  let io: SocketIOServer;
  let serverPort: number;
  let client1: ClientSocketType;
  let client2: ClientSocketType;

  await t.test('Setup test HTTP & Socket.IO server', async () => {
    server = http.createServer();
    io = new SocketIOServer(server, {
      cors: { origin: '*' },
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        serverPort = (server.address() as any).port;
        resolve();
      });
    });

    io.on('connection', (socket) => {
      // Mock authenticated session
      const userId = (socket.handshake.query.userId as string) || `user_${socket.id}`;
      socket.data = { userId, username: `Player_${userId}` };
      registerLudoSocketHandlers(io, socket);
    });

    client1 = ClientSocket(`http://localhost:${serverPort}?userId=user_player_1`, {
      transports: ['websocket'],
    });
    client2 = ClientSocket(`http://localhost:${serverPort}?userId=user_player_2`, {
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve) => client1.on('connect', () => resolve())),
      new Promise<void>((resolve) => client2.on('connect', () => resolve())),
    ]);

    assert.ok(client1.connected);
    assert.ok(client2.connected);
  });

  await t.test('1. Disqualification rejection on ludo:resume_game', async () => {
    const gameId = `test_disqualify_${Date.now()}`;
    const initialGameState: LudoGameState = {
      gameId,
      roomId: gameId,
      mode: 'CLASSIC',
      status: 'ACTIVE',
      diceValue: null,
      diceRolled: false,
      moveNumber: 0,
      winner: null,
      currentPlayerId: 'user_player_2',
      lastAction: null,
      players: [
        {
          playerId: 'user_player_1',
          userId: 'user_player_1',
          username: 'Player 1',
          color: 'RED',
          tokens: [],
          isConnected: false,
          isDisqualified: true,
          missedTurns: 3,
        },
        {
          playerId: 'user_player_2',
          userId: 'user_player_2',
          username: 'Player 2',
          color: 'GREEN',
          tokens: [],
          isConnected: true,
          isDisqualified: false,
          missedTurns: 0,
        },
      ],
      turnNumber: 5,
      turnStartedAt: Date.now(),
      turnTimeLimit: 30,
    };

    await saveAuthoritativeState(initialGameState);

    // Attempt to resume as disqualified user_player_1
    const resumeErrorPromise = new Promise<{ code: string; message: string }>((resolve) => {
      client1.once('ludo:error', (err) => resolve(err));
    });

    client1.emit('ludo:resume_game', { gameId });
    const err = await resumeErrorPromise;

    assert.equal(err.code, 'PLAYER_DISQUALIFIED');
    assert.match(err.message, /eliminated/i);
  });

  await t.test('2. Allowed to find match and play new game while in background active game', async () => {
    // Player 1 requests matchmaking for a new match
    const matchPromise = new Promise<any>((resolve) => {
      client1.once('ludo:match_found', (data) => resolve(data));
      client1.once('ludo:bot_joined', (data) => resolve(data));
    });

    client1.emit('ludo:find_match', { mode: 'CLASSIC', maxPlayers: 2, stake: 50 });
    
    // Wait for match creation (or bot fallback)
    const matchData = await matchPromise;
    assert.ok(matchData.gameId, 'New match was found successfully');
  });

  await t.test('Cleanup and close server', async () => {
    client1.disconnect();
    client2.disconnect();
    io.close();
    server.close();
    await closeRedis();
  });
});
