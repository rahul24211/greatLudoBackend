import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import bcrypt from 'bcryptjs';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createApp } from '../../../app';
import sequelize from '../../../config/database';
import { User } from '../../../models';
import { generateAccessToken } from '../../../utils/tokenUtils';
import { redisService } from '../../../services/redis/redisService';
import { activeLudoGames } from '../../../socket/ludoSocketHandler';

describe('Admin Matchmaking & Bot Monitoring Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let testSuperAdmin: User;
  let testViewer: User;
  let testPlayer: User;

  let superAdminToken: string;
  let viewerToken: string;
  let normalUserToken: string;

  before(async () => {
    await sequelize.sync({ force: false });

    // 1. Create Super Admin
    const superAdminHash = await bcrypt.hash('SuperAdminPass#1', 10);
    const [superAdmin] = await User.findOrCreate({
      where: { email: 'super_admin_matchmaking_test@ludoarena.com' },
      defaults: {
        username: 'super_admin_mm_test',
        email: 'super_admin_matchmaking_test@ludoarena.com',
        passwordHash: superAdminHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        coins: 10000,
        xp: 100,
        level: 5,
      },
    });
    testSuperAdmin = superAdmin;
    superAdminToken = generateAccessToken({
      id: testSuperAdmin.id,
      email: testSuperAdmin.email,
      username: testSuperAdmin.username,
      role: testSuperAdmin.role,
    });

    // 2. Create Viewer
    const viewerHash = await bcrypt.hash('ViewerPass#1', 10);
    const [viewer] = await User.findOrCreate({
      where: { email: 'viewer_matchmaking_test@ludoarena.com' },
      defaults: {
        username: 'viewer_mm_test',
        email: 'viewer_matchmaking_test@ludoarena.com',
        passwordHash: viewerHash,
        role: 'VIEWER',
        status: 'ACTIVE',
        coins: 100,
        xp: 0,
        level: 1,
      },
    });
    testViewer = viewer;
    viewerToken = generateAccessToken({
      id: testViewer.id,
      email: testViewer.email,
      username: testViewer.username,
      role: testViewer.role,
    });

    // 3. Create Normal Player
    const playerHash = await bcrypt.hash('PlayerPass#1', 10);
    const [player] = await User.findOrCreate({
      where: { email: 'player_mm_test_21@ludoarena.com' },
      defaults: {
        username: 'player_mm_test_21',
        email: 'player_mm_test_21@ludoarena.com',
        passwordHash: playerHash,
        role: 'USER',
        status: 'ACTIVE',
        coins: 1000,
        xp: 20,
        level: 1,
      },
    });
    testPlayer = player;
    normalUserToken = generateAccessToken({
      id: testPlayer.id,
      email: testPlayer.email,
      username: testPlayer.username,
      role: testPlayer.role,
    });

    // 4. Add test player to Matchmaking Queue
    await redisService.rpush(
      'ludo:queue:classic',
      JSON.stringify({
        userId: testPlayer.id,
        username: testPlayer.username,
        socketId: 'socket_test_mm_001',
        queuedAt: Date.now() - 3000,
      })
    );

    // 5. Add an in-memory active bot game for live inspection
    activeLudoGames.set('game_active_bot_test_21', {
      gameId: 'game_active_bot_test_21',
      mode: 'CLASSIC',
      status: 'ACTIVE',
      players: [
        {
          playerId: testPlayer.id,
          userId: testPlayer.id,
          username: testPlayer.username,
          color: 'RED',
          playerType: 'HUMAN',
          isConnected: true,
        },
        {
          playerId: 'bot_active_test_21',
          userId: 'bot_active_test_21',
          username: 'Smart Bot (Classic)',
          color: 'GREEN',
          playerType: 'BOT',
          isConnected: true,
        },
      ],
      currentPlayerId: testPlayer.id,
      turnNumber: 3,
      turnStartedAt: Date.now(),
      turnTimeLimit: 30,
    } as any);

    // 6. Start test HTTP server
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr: any = server.address();
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    activeLudoGames.delete('game_active_bot_test_21');
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  /* ---------------- Matchmaking API Tests ---------------- */
  it('1. GET /api/admin/matchmaking returns live waiting players, longest wait, and average wait', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matchmaking`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.mode, 'CLASSIC');
    assert.ok(typeof data.data.queueLength === 'number');
    assert.ok(typeof data.data.longestWaitSeconds === 'number');
    assert.ok(typeof data.data.averageWaitSeconds === 'number');
    assert.strictEqual(data.data.botFallbackSeconds, 7);
    assert.ok(Array.isArray(data.data.players));
  });

  it('2. GET /api/admin/matchmaking/stats returns performance metrics with zero-safe fallback rate', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matchmaking/stats`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(typeof data.data.matchesToday === 'number');
    assert.ok(typeof data.data.botFallbackCount === 'number');
    assert.ok(typeof data.data.botFallbackRate === 'string');
    assert.ok(data.data.botFallbackRate.endsWith('%'));
  });

  it('3. GET /api/admin/matchmaking rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matchmaking`);
    assert.strictEqual(res.status, 401);
  });

  it('4. GET /api/admin/matchmaking rejects normal USER with 403', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matchmaking`, {
      headers: { Authorization: `Bearer ${normalUserToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  /* ---------------- Bot Monitoring API Tests ---------------- */
  it('5. GET /api/admin/bots returns active bot games list and win rate statistics', async () => {
    const res = await fetch(`${baseUrl}/api/admin/bots`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(typeof data.data.totalBotMatches === 'number');
    assert.ok(typeof data.data.activeBotGames === 'number');
    assert.ok(typeof data.data.botWinRate === 'number');
    assert.ok(Array.isArray(data.data.activeBotGamesList));
  });

  it('6. GET /api/admin/bots/stats returns difficulty breakdown and fairness indicators', async () => {
    const res = await fetch(`${baseUrl}/api/admin/bots/stats`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    // Difficulty breakdown verification
    assert.ok(Array.isArray(data.data.difficulties));
    assert.strictEqual(data.data.difficulties.length, 3);
    const diffNames = data.data.difficulties.map((d: any) => d.difficulty);
    assert.ok(diffNames.includes('EASY'));
    assert.ok(diffNames.includes('MEDIUM'));
    assert.ok(diffNames.includes('HARD'));

    // Bot Fairness checklist verification
    const fairness = data.data.fairnessIndicators;
    assert.strictEqual(fairness.botUsesServerDice, true);
    assert.strictEqual(fairness.botUsesNormalGameEngine, true);
    assert.strictEqual(fairness.botBypassesValidation, false);
  });

  it('7. GET /api/admin/bots rejects normal USER with 403', async () => {
    const res = await fetch(`${baseUrl}/api/admin/bots`, {
      headers: { Authorization: `Bearer ${normalUserToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  it('8. GET /api/admin/matchmaking is accessible for VIEWER role', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matchmaking`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    assert.strictEqual(res.status, 200);
  });

  /* ---------------- Realtime Socket Authorization Tests ---------------- */
  it('9. Socket admin:join_matchmaking_feed authorizes valid Admin token and joins feed', (_t, done) => {
    const socket: ClientSocketType = ClientSocket(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    socket.on('connect', () => {
      socket.emit('admin:join_matchmaking_feed', { token: superAdminToken }, (ack: any) => {
        assert.strictEqual(ack.success, true);
        assert.strictEqual(ack.role, 'SUPER_ADMIN');
        socket.disconnect();
        done();
      });
    });
  });

  it('10. Socket admin:join_matchmaking_feed rejects normal USER token', (_t, done) => {
    const socket: ClientSocketType = ClientSocket(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
    });

    socket.on('connect', () => {
      socket.emit('admin:join_matchmaking_feed', { token: normalUserToken }, (ack: any) => {
        assert.strictEqual(ack.success, false);
        socket.disconnect();
        done();
      });
    });
  });

  /* ---------------- Audit Logging Tests ---------------- */
  it('10. Matchmaking and Bot monitoring endpoints generate audit log entries', async () => {
    const res = await fetch(`${baseUrl}/api/admin/audit-logs?limit=30`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    const auditActions = data.data.logs.map((l: any) => l.action);
    assert.ok(
      auditActions.includes('MATCHMAKING_MONITOR_ACCESS') || auditActions.includes('BOT_MONITOR_ACCESS')
    );
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);
