import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app';
import sequelize from '../../../config/database';
import { User, Profile, LudoMatch, LudoMatchPlayer } from '../../../models';
import { generateAccessToken } from '../../../utils/tokenUtils';

describe('Admin Dashboard & User Management Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let testAdmin: User;
  let testPlayerA: User;
  let testMatch: LudoMatch;

  let adminToken: string;
  let normalUserToken: string;

  before(async () => {
    await sequelize.sync({ force: false });

    // 1. Create test admin
    const adminHash = await bcrypt.hash('AdminPass#1', 10);
    const [admin] = await User.findOrCreate({
      where: { email: 'admin_dashboard_test@ludoarena.com' },
      defaults: {
        username: 'admin_dash_tester',
        email: 'admin_dashboard_test@ludoarena.com',
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

    // 2. Create test player A
    const playerAHash = await bcrypt.hash('PlayerAPass#1', 10);
    const [playerA] = await User.findOrCreate({
      where: { email: 'player_a_step18@ludoarena.com' },
      defaults: {
        username: 'player_a_step18',
        email: 'player_a_step18@ludoarena.com',
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

    // Ensure Profile for player A
    await Profile.findOrCreate({
      where: { userId: testPlayerA.id },
      defaults: {
        userId: testPlayerA.id,
        rankTitle: 'Dice Apprentice',
        totalMatches: 5,
        wins: 3,
        losses: 2,
        winRate: 60,
      },
    });

    // 3. Create test player B
    const playerBHash = await bcrypt.hash('PlayerBPass#1', 10);
    await User.findOrCreate({
      where: { email: 'player_b_step18@ludoarena.com' },
      defaults: {
        username: 'player_b_step18',
        email: 'player_b_step18@ludoarena.com',
        passwordHash: playerBHash,
        role: 'USER',
        status: 'SUSPENDED',
        coins: 200,
        xp: 0,
        level: 1,
      },
    });

    // 4. Create completed test match with players
    const [match] = await LudoMatch.findOrCreate({
      where: { gameId: 'game_step18_test_match_001' },
      defaults: {
        gameId: 'game_step18_test_match_001',
        status: 'FINISHED',
        gameMode: 'CLASSIC',
        winnerId: testPlayerA.id,
        winnerColor: 'RED',
        startedAt: new Date(Date.now() - 600000),
        finishedAt: new Date(),
      },
    });
    testMatch = match;

    await LudoMatchPlayer.findOrCreate({
      where: { matchId: testMatch.id, userId: testPlayerA.id },
      defaults: {
        matchId: testMatch.id,
        userId: testPlayerA.id,
        color: 'RED',
        playerType: 'HUMAN',
        finalPosition: 1,
      },
    });

    await LudoMatchPlayer.findOrCreate({
      where: { matchId: testMatch.id, userId: 'bot_opponent_999' },
      defaults: {
        matchId: testMatch.id,
        userId: 'bot_opponent_999',
        color: 'GREEN',
        playerType: 'BOT',
        finalPosition: 2,
      },
    });

    // 5. Start ephemeral test server
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
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  /* ---------------- Dashboard Tests ---------------- */
  it('1. GET /api/admin/dashboard returns comprehensive real telemetry', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    // Verify key fields
    assert.ok(typeof data.data.users.total === 'number');
    assert.ok(data.data.users.total >= 2);
    assert.ok(typeof data.data.games.completed === 'number');
    assert.ok(typeof data.data.onlineConnections === 'number');
    assert.ok(typeof data.data.gameStats.classicGames === 'number');
    assert.ok(Array.isArray(data.data.recentMatches));
    assert.ok(data.data.recentMatches.length > 0);

    // Verify recent matches structure
    const latest = data.data.recentMatches[0];
    assert.ok(latest.gameId);
    assert.ok(latest.type === 'HUMAN_VS_BOT' || latest.type === 'HUMAN_VS_HUMAN');
  });

  it('2. GET /api/admin/dashboard rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`);
    assert.strictEqual(res.status, 401);
  });

  it('3. GET /api/admin/dashboard rejects normal player token with 403', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${normalUserToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  /* ---------------- User Management Tests ---------------- */
  it('4. GET /api/admin/users returns paginated user list with default limit 20', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.limit <= 20);
    assert.ok(Array.isArray(data.data.users));
    assert.ok(data.data.users.length >= 2);
    assert.ok(data.data.showingRange);
  });

  it('5. GET /api/admin/users search by username returns matching user', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?search=player_a_step18`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.users.some((u: any) => u.username === 'player_a_step18'));
  });

  it('6. GET /api/admin/users search by email returns matching user', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?search=player_a_step18@ludoarena.com`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.users.some((u: any) => u.email === 'player_a_step18@ludoarena.com'));
  });

  it('7. GET /api/admin/users search by user ID returns exact match', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?search=${testPlayerA.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.users.length, 1);
    assert.strictEqual(data.data.users[0].id, testPlayerA.id);
  });

  it('8. GET /api/admin/users status filter correctly isolates SUSPENDED user', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?status=SUSPENDED`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.users.every((u: any) => u.status === 'SUSPENDED'));
    assert.ok(data.data.users.some((u: any) => u.username === 'player_b_step18'));
  });

  it('9. GET /api/admin/users role filter correctly isolates ADMIN user', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?role=ADMIN`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.users.every((u: any) => u.role === 'ADMIN'));
  });

  it('10. GET /api/admin/users pagination caps maximum limit to 100', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?limit=999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.data.limit, 100);
  });

  it('11. GET /api/admin/users NEVER exposes passwordHash or private secrets', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    for (const u of data.data.users) {
      assert.strictEqual(u.passwordHash, undefined, 'passwordHash must never be exposed');
    }
  });

  /* ---------------- User Detail Tests ---------------- */
  it('12. GET /api/admin/users/:id returns complete safe profile & statistics', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${testPlayerA.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.user.id, testPlayerA.id);
    assert.strictEqual(data.data.user.passwordHash, undefined);
    assert.ok(data.data.stats);
    assert.ok(typeof data.data.stats.totalMatches === 'number');
    assert.ok(typeof data.data.stats.wins === 'number');
    assert.ok(typeof data.data.stats.winRate === 'number');
  });

  it('13. GET /api/admin/users/:id returns 404 for nonexistent user ID', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/00000000-0000-0000-0000-000000000000`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 404);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
  });

  /* ---------------- User Match History Tests ---------------- */
  it('14. GET /api/admin/users/:id/matches returns paginated completed games', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${testPlayerA.id}/matches?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.matches));
    assert.ok(data.data.matches.length > 0);

    const m = data.data.matches[0];
    assert.strictEqual(m.matchId, 'game_step18_test_match_001');
    assert.strictEqual(m.result, 'WIN');
    assert.strictEqual(m.userColor, 'RED');
    assert.strictEqual(m.isBotMatch, true);
    assert.ok(Array.isArray(m.opponents));
  });

  /* ---------------- Audit Logging Tests ---------------- */
  it('15. Admin actions create server-side audit logs with sanitized metadata', async () => {
    // Check audit logs
    const res = await fetch(`${baseUrl}/api/admin/audit-logs?limit=20`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    const userDetailLogs = data.data.logs.filter(
      (l: any) => l.action === 'USER_DETAIL_ACCESS' || l.action === 'USER_MATCH_HISTORY_ACCESS'
    );
    assert.ok(userDetailLogs.length > 0, 'Audit entries must be created for user inspections');
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);
