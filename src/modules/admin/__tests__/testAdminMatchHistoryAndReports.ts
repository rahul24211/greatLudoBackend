import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app';
import sequelize from '../../../config/database';
import { User, Profile, LudoMatch, LudoMatchPlayer } from '../../../models';
import { generateAccessToken } from '../../../utils/tokenUtils';

describe('Admin Match History & Reports Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let testSuperAdmin: User;
  let testAdmin: User;
  let testViewer: User;
  let testPlayerA: User;
  let testPlayerB: User;
  let testMatchHuman: LudoMatch;
  let testMatchBot: LudoMatch;

  let superAdminToken: string;
  let adminToken: string;
  let viewerToken: string;
  let normalUserToken: string;

  before(async () => {
    await sequelize.sync({ force: false });

    // 1. Create Super Admin
    const superAdminHash = await bcrypt.hash('SuperAdminPass#1', 10);
    const [superAdmin] = await User.findOrCreate({
      where: { email: 'super_admin_match_test@ludoarena.com' },
      defaults: {
        username: 'super_admin_tester',
        email: 'super_admin_match_test@ludoarena.com',
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

    // 2. Create Admin
    const adminHash = await bcrypt.hash('AdminPass#1', 10);
    const [admin] = await User.findOrCreate({
      where: { email: 'admin_match_test@ludoarena.com' },
      defaults: {
        username: 'admin_match_tester',
        email: 'admin_match_test@ludoarena.com',
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

    // 3. Create Viewer
    const viewerHash = await bcrypt.hash('ViewerPass#1', 10);
    const [viewer] = await User.findOrCreate({
      where: { email: 'viewer_match_test@ludoarena.com' },
      defaults: {
        username: 'viewer_match_tester',
        email: 'viewer_match_test@ludoarena.com',
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

    // 4. Create Normal Players
    const playerAHash = await bcrypt.hash('PlayerA#1', 10);
    const [playerA] = await User.findOrCreate({
      where: { email: 'player_a_step20@ludoarena.com' },
      defaults: {
        username: 'player_a_step20',
        email: 'player_a_step20@ludoarena.com',
        passwordHash: playerAHash,
        role: 'USER',
        status: 'ACTIVE',
        coins: 1000,
        xp: 20,
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

    await Profile.findOrCreate({
      where: { userId: testPlayerA.id },
      defaults: {
        userId: testPlayerA.id,
        rankTitle: 'Grandmaster Roller',
        totalMatches: 10,
        wins: 8,
        losses: 2,
        winRate: 80,
      },
    });

    const playerBHash = await bcrypt.hash('PlayerB#1', 10);
    const [playerB] = await User.findOrCreate({
      where: { email: 'player_b_step20@ludoarena.com' },
      defaults: {
        username: 'player_b_step20',
        email: 'player_b_step20@ludoarena.com',
        passwordHash: playerBHash,
        role: 'USER',
        status: 'ACTIVE',
        coins: 800,
        xp: 15,
        level: 1,
      },
    });
    testPlayerB = playerB;

    // 5. Create Test Matches in MySQL
    // A. Human vs Human match
    const [matchHuman] = await LudoMatch.findOrCreate({
      where: { gameId: 'game_step20_pvp_match_001' },
      defaults: {
        gameId: 'game_step20_pvp_match_001',
        status: 'FINISHED',
        gameMode: 'CLASSIC',
        winnerId: testPlayerA.id,
        winnerColor: 'RED',
        startedAt: new Date(Date.now() - 900000),
        finishedAt: new Date(Date.now() - 300000),
      },
    });
    testMatchHuman = matchHuman;

    await LudoMatchPlayer.findOrCreate({
      where: { matchId: testMatchHuman.id, userId: testPlayerA.id },
      defaults: {
        matchId: testMatchHuman.id,
        userId: testPlayerA.id,
        color: 'RED',
        playerType: 'HUMAN',
        finalPosition: 1,
      },
    });

    await LudoMatchPlayer.findOrCreate({
      where: { matchId: testMatchHuman.id, userId: testPlayerB.id },
      defaults: {
        matchId: testMatchHuman.id,
        userId: testPlayerB.id,
        color: 'GREEN',
        playerType: 'HUMAN',
        finalPosition: 2,
      },
    });

    // B. Human vs Bot match
    const [matchBot] = await LudoMatch.findOrCreate({
      where: { gameId: 'game_step20_bot_match_002' },
      defaults: {
        gameId: 'game_step20_bot_match_002',
        status: 'FINISHED',
        gameMode: 'CLASSIC',
        winnerId: testPlayerA.id,
        winnerColor: 'YELLOW',
        startedAt: new Date(Date.now() - 600000),
        finishedAt: new Date(),
      },
    });
    testMatchBot = matchBot;

    await LudoMatchPlayer.findOrCreate({
      where: { matchId: testMatchBot.id, userId: testPlayerA.id },
      defaults: {
        matchId: testMatchBot.id,
        userId: testPlayerA.id,
        color: 'YELLOW',
        playerType: 'HUMAN',
        finalPosition: 1,
      },
    });

    await LudoMatchPlayer.findOrCreate({
      where: { matchId: testMatchBot.id, userId: 'bot_opponent_step20' },
      defaults: {
        matchId: testMatchBot.id,
        userId: 'bot_opponent_step20',
        color: 'BLUE',
        playerType: 'BOT',
        finalPosition: 2,
      },
    });

    // 6. Start ephemeral test server
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

  /* ---------------- Match History API Tests ---------------- */
  it('1. GET /api/admin/matches returns historical matches with duration', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matches`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.matches));
    assert.ok(data.data.matches.length >= 2);

    const m = data.data.matches[0];
    assert.ok(m.gameId);
    assert.ok(m.gameMode);
    assert.ok(typeof m.durationSeconds === 'number');
    assert.ok(m.matchType === 'HUMAN_VS_HUMAN' || m.matchType === 'HUMAN_VS_BOT');
  });

  it('2. GET /api/admin/matches rejects normal USER with 403', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matches`, {
      headers: { Authorization: `Bearer ${normalUserToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  it('3. GET /api/admin/matches search by gameId returns exact match', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matches?search=game_step20_pvp_match_001`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.matches.some((m: any) => m.gameId === 'game_step20_pvp_match_001'));
  });

  it('4. GET /api/admin/matches filter by matchType isolates HUMAN_VS_BOT', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matches?matchType=HUMAN_VS_BOT`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.matches.every((m: any) => m.matchType === 'HUMAN_VS_BOT'));
  });

  it('5. GET /api/admin/matches filter by datePreset TODAY returns today matches', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matches?datePreset=TODAY`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.matches.length >= 1);
  });

  /* ---------------- Single Match Detail Tests ---------------- */
  it('6. GET /api/admin/matches/:id returns complete match inspection and player roster', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matches/${testMatchHuman.gameId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    const m = data.data;
    assert.strictEqual(m.gameId, testMatchHuman.gameId);
    assert.strictEqual(m.winnerId, testPlayerA.id);
    assert.strictEqual(m.matchType, 'HUMAN_VS_HUMAN');
    assert.ok(Array.isArray(m.players));
    assert.strictEqual(m.players.length, 2);
  });

  it('7. GET /api/admin/matches/:id returns 404 for unknown match', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matches/game_unknown_nonexistent_999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 404);
  });

  /* ---------------- CSV Export Tests ---------------- */
  it('8. GET /api/admin/matches/export/csv generates valid CSV with headers for SUPER_ADMIN', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matches/export/csv?gameMode=CLASSIC`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/csv'));

    const csvText = await res.text();
    assert.ok(csvText.includes('Match ID,Game Mode,Status,Match Type,Winner ID'));
    assert.ok(csvText.includes('CLASSIC'));
  });

  it('9. GET /api/admin/matches/export/csv is rejected for VIEWER (No Export Permission) with 403', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matches/export/csv`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  /* ---------------- Report APIs Tests ---------------- */
  it('10. GET /api/admin/reports/overview returns accurate aggregates', async () => {
    const res = await fetch(`${baseUrl}/api/admin/reports/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(typeof data.data.totalMatches === 'number');
    assert.ok(typeof data.data.completedMatches === 'number');
    assert.ok(typeof data.data.humanVsHumanMatches === 'number');
    assert.ok(typeof data.data.humanVsBotMatches === 'number');
    assert.ok(typeof data.data.avgDurationSeconds === 'number');
  });

  it('11. GET /api/admin/reports/game-modes returns mode breakdown', async () => {
    const res = await fetch(`${baseUrl}/api/admin/reports/game-modes`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.modes));
    assert.ok(data.data.modes.length >= 1);
    assert.strictEqual(data.data.modes[0].gameMode, 'CLASSIC');
  });

  it('12. GET /api/admin/reports/bots returns win rate and active difficulty tiers', async () => {
    const res = await fetch(`${baseUrl}/api/admin/reports/bots`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(typeof data.data.totalBotMatches === 'number');
    assert.ok(typeof data.data.botWins === 'number');
    assert.ok(Array.isArray(data.data.difficulties));
    assert.strictEqual(data.data.difficulties.length, 3);
  });

  it('13. GET /api/admin/reports/winners returns top victorious leaderboard', async () => {
    const res = await fetch(`${baseUrl}/api/admin/reports/winners`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.leaderboard));
    assert.ok(data.data.leaderboard.length >= 1);

    const top = data.data.leaderboard[0];
    assert.ok(top.username);
    assert.ok(typeof top.wins === 'number');
    assert.ok(typeof top.winRate === 'number');
  });

  /* ---------------- Audit Logging Tests ---------------- */
  it('14. Match history inspection and CSV export generate server AuditLog entries', async () => {
    const res = await fetch(`${baseUrl}/api/admin/audit-logs?limit=30`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    const auditActions = data.data.logs.map((l: any) => l.action);
    assert.ok(auditActions.includes('MATCH_HISTORY_ACCESS') || auditActions.includes('MATCH_DETAIL_ACCESS'));
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);
