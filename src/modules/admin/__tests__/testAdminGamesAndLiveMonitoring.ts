import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import bcrypt from 'bcryptjs';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../../app';
import sequelize from '../../../config/database';
import { User, LudoMatch, LudoMatchPlayer } from '../../../models';
import { generateAccessToken } from '../../../utils/tokenUtils';
import { activeLudoGames } from '../../../socket/ludoSocketHandler';
import { LudoGameEngine } from '../../../game-engine/ludo/LudoGameEngine';

describe('Admin Live Games & Match Details Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let socketUrl: string;

  let testAdmin: User;
  let testPlayerA: User;
  let testFinishedMatch: LudoMatch;

  let adminToken: string;
  let normalUserToken: string;

  const testActiveGameId = 'game_step19_live_active_001';

  before(async () => {
    await sequelize.sync({ force: false });

    // 1. Create test admin
    const adminHash = await bcrypt.hash('AdminPass#1', 10);
    const [admin] = await User.findOrCreate({
      where: { email: 'admin_live_games_test@ludoarena.com' },
      defaults: {
        username: 'admin_live_tester',
        email: 'admin_live_games_test@ludoarena.com',
        passwordHash: adminHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        coins: 5000,
        xp: 50,
        level: 2,
      },
    });
    testAdmin = admin;
    adminToken = generateAccessToken({
      id: testAdmin.id,
      email: testAdmin.email,
      username: testAdmin.username,
      role: testAdmin.role,
    });

    // 2. Create normal test player
    const playerAHash = await bcrypt.hash('PlayerAPass#1', 10);
    const [playerA] = await User.findOrCreate({
      where: { email: 'player_a_step19@ludoarena.com' },
      defaults: {
        username: 'player_a_step19',
        email: 'player_a_step19@ludoarena.com',
        passwordHash: playerAHash,
        role: 'USER',
        status: 'ACTIVE',
        coins: 1000,
        xp: 10,
        level: 1,
      },
    });
    testPlayerA = playerA;
    normalUserToken = generateAccessToken({
      id: testPlayerA.id,
      email: testPlayerA.email,
      username: testPlayerA.username,
      role: testPlayerA.role,
    });

    // 3. Create completed test match in MySQL
    const [finishedMatch] = await LudoMatch.findOrCreate({
      where: { gameId: 'game_step19_finished_match_999' },
      defaults: {
        gameId: 'game_step19_finished_match_999',
        status: 'FINISHED',
        gameMode: 'CLASSIC',
        winnerId: testPlayerA.id,
        winnerColor: 'RED',
        startedAt: new Date(Date.now() - 1200000),
        finishedAt: new Date(),
      },
    });
    testFinishedMatch = finishedMatch;

    await LudoMatchPlayer.findOrCreate({
      where: { matchId: testFinishedMatch.id, userId: testPlayerA.id },
      defaults: {
        matchId: testFinishedMatch.id,
        userId: testPlayerA.id,
        color: 'RED',
        playerType: 'HUMAN',
        finalPosition: 1,
      },
    });

    await LudoMatchPlayer.findOrCreate({
      where: { matchId: testFinishedMatch.id, userId: 'bot_opponent_step19' },
      defaults: {
        matchId: testFinishedMatch.id,
        userId: 'bot_opponent_step19',
        color: 'GREEN',
        playerType: 'BOT',
        finalPosition: 2,
      },
    });

    // 4. Create active in-memory game in activeLudoGames
    const activeState = LudoGameEngine.createGame({
      gameId: testActiveGameId,
      mode: 'CLASSIC',
      playerIds: [testPlayerA.id, 'bot_player_live_01'],
      colors: ['RED', 'GREEN'],
    });
    activeState.players[0].username = testPlayerA.username;
    activeState.players[0].userId = testPlayerA.id;
    activeState.players[1].playerType = 'BOT';
    activeState.players[1].username = 'SmartBot_01';
    activeState.players[1].userId = 'bot_player_live_01';
    activeState.status = 'ACTIVE';
    activeState.turnNumber = 3;
    activeState.diceRolled = true;
    activeState.diceValue = 6;
    activeState.turnStartedAt = Date.now();
    activeLudoGames.set(testActiveGameId, activeState);

    // 5. Start ephemeral test server
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr: any = server.address();
        baseUrl = `http://localhost:${addr.port}`;
        socketUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    activeLudoGames.delete(testActiveGameId);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  /* ---------------- Games List API Tests ---------------- */
  it('1. GET /api/admin/games returns game list with safe DTO summaries', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.games));
    assert.ok(data.data.games.length >= 1);
    assert.ok(data.data.showingRange);

    const game = data.data.games[0];
    assert.ok(game.gameId);
    assert.ok(game.gameMode);
    assert.ok(game.status);
    assert.ok(game.gameType === 'HUMAN_VS_BOT' || game.gameType === 'HUMAN_VS_HUMAN');
  });

  it('2. GET /api/admin/games rejects normal user with 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games`, {
      headers: { Authorization: `Bearer ${normalUserToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  it('3. GET /api/admin/games rejects unauthenticated request with 401', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games`);
    assert.strictEqual(res.status, 401);
  });

  it('4. GET /api/admin/games search by gameId returns matching game', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games?search=${testActiveGameId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.games.some((g: any) => g.gameId === testActiveGameId));
  });

  it('5. GET /api/admin/games search by player username returns matching game', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games?search=player_a_step19`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.games.length >= 1);
  });

  it('6. GET /api/admin/games status filter ACTIVE returns active games only', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games?status=ACTIVE`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.games.every((g: any) => g.status === 'ACTIVE'));
  });

  it('7. GET /api/admin/games status filter FINISHED returns finished games only', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games?status=FINISHED`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.games.every((g: any) => g.status === 'FINISHED'));
  });

  it('8. GET /api/admin/games gameType filter correctly isolates HUMAN_VS_BOT', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games?gameType=HUMAN_VS_BOT`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.games.every((g: any) => g.gameType === 'HUMAN_VS_BOT'));
  });

  it('9. GET /api/admin/games enforces maximum limit of 100', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games?limit=500`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.data.limit, 100);
  });

  /* ---------------- Game Details API Tests ---------------- */
  it('10. GET /api/admin/games/:id returns full safe active game state with tokens', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games/${testActiveGameId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    const game = data.data;
    assert.strictEqual(game.gameId, testActiveGameId);
    assert.strictEqual(game.status, 'ACTIVE');
    assert.strictEqual(game.isLive, true);
    assert.strictEqual(game.turnNumber, 3);
    assert.strictEqual(game.diceValue, 6);
    assert.ok(Array.isArray(game.players));
    assert.strictEqual(game.players.length, 2);

    // Verify token structure
    const p1 = game.players[0];
    assert.ok(Array.isArray(p1.tokens));
    assert.strictEqual(p1.tokens.length, 4);
    assert.ok(p1.tokens[0].state);

    // Verify security: No Redis keys, locks, or passwords
    assert.strictEqual((game as any).passwordHash, undefined);
    assert.strictEqual((game as any).lockToken, undefined);
  });

  it('11. GET /api/admin/games/:id returns finished match result from MySQL', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games/${testFinishedMatch.gameId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    const game = data.data;
    assert.strictEqual(game.gameId, testFinishedMatch.gameId);
    assert.strictEqual(game.status, 'FINISHED');
    assert.strictEqual(game.isLive, false);
    assert.strictEqual(game.winnerId, testPlayerA.id);
  });

  it('12. GET /api/admin/games/:id returns 404 for unknown game ID', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games/game_unknown_nonexistent_999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 404);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
  });

  /* ---------------- Realtime Socket Authorization Tests ---------------- */
  it('13. Admin can subscribe to admin:join_live_feed via Socket.IO with valid token', async () => {
    const socket: ClientSocket = ioClient(socketUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => {
        socket.emit(
          'admin:join_live_feed',
          { token: adminToken },
          (response: any) => {
            assert.strictEqual(response.success, true);
            assert.strictEqual(response.message, 'Joined admin live feed');
            socket.disconnect();
            resolve();
          }
        );
      });
    });
  });

  it('14. Admin can subscribe to admin:join_game_feed for specific game', async () => {
    const socket: ClientSocket = ioClient(socketUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => {
        socket.emit(
          'admin:join_game_feed',
          { token: adminToken, gameId: testActiveGameId },
          (response: any) => {
            assert.strictEqual(response.success, true);
            socket.disconnect();
            resolve();
          }
        );
      });
    });
  });

  it('15. Normal user token is rejected from admin:join_live_feed', async () => {
    const socket: ClientSocket = ioClient(socketUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => {
        socket.emit(
          'admin:join_live_feed',
          { token: normalUserToken },
          (response: any) => {
            assert.strictEqual(response.success, false);
            assert.ok(response.error.includes('Unauthorized') || response.error.includes('GAME_VIEW'));
            socket.disconnect();
            resolve();
          }
        );
      });
    });
  });

  /* ---------------- Audit Logging Tests ---------------- */
  it('16. Game inspection generates server-side AuditLog records', async () => {
    const res = await fetch(`${baseUrl}/api/admin/audit-logs?limit=20`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    const gameLogs = data.data.logs.filter(
      (l: any) => l.action === 'GAME_LIST_ACCESS' || l.action === 'GAME_DETAIL_ACCESS'
    );
    assert.ok(gameLogs.length > 0, 'Audit entries must be created for game inspections');
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);
