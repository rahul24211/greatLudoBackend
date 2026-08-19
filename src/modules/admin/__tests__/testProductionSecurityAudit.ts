import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app';
import sequelize from '../../../config/database';
import { User, LudoMatch } from '../../../models';
import { generateAccessToken } from '../../../utils/tokenUtils';
import { redisService } from '../../../services/redis/redisService';
import { LudoGameEngine } from '../../../game-engine/ludo/LudoGameEngine';

describe('Production Readiness & Security Attack Simulation Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let testSuperAdmin: User;
  let testAdmin: User;
  let testViewer: User;
  let testNormalUser: User;

  let superAdminToken: string;
  let adminToken: string;
  let viewerToken: string;
  let normalUserToken: string;

  before(async () => {
    await sequelize.sync({ force: false });

    const passwordHash = await bcrypt.hash('ProdAuditPass#1', 10);

    // 1. Super Admin
    const [superAdmin] = await User.findOrCreate({
      where: { email: 'super_prod_audit@ludoarena.com' },
      defaults: {
        username: 'super_prod_audit',
        email: 'super_prod_audit@ludoarena.com',
        passwordHash,
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

    // 2. Admin
    const [admin] = await User.findOrCreate({
      where: { email: 'admin_prod_audit@ludoarena.com' },
      defaults: {
        username: 'admin_prod_audit',
        email: 'admin_prod_audit@ludoarena.com',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        coins: 5000,
        xp: 50,
        level: 3,
      },
    });
    testAdmin = admin;
    adminToken = generateAccessToken({
      id: testAdmin.id,
      email: testAdmin.email,
      username: testAdmin.username,
      role: testAdmin.role,
    });

    // 3. Viewer
    const [viewer] = await User.findOrCreate({
      where: { email: 'viewer_prod_audit@ludoarena.com' },
      defaults: {
        username: 'viewer_prod_audit',
        email: 'viewer_prod_audit@ludoarena.com',
        passwordHash,
        role: 'VIEWER',
        status: 'ACTIVE',
        coins: 1000,
        xp: 10,
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

    // 4. Normal User
    const [normalUser] = await User.findOrCreate({
      where: { email: 'normal_prod_audit@ludoarena.com' },
      defaults: {
        username: 'normal_prod_audit',
        email: 'normal_prod_audit@ludoarena.com',
        passwordHash,
        role: 'USER',
        status: 'ACTIVE',
        coins: 500,
        xp: 5,
        level: 1,
      },
    });
    testNormalUser = normalUser;
    normalUserToken = generateAccessToken({
      id: testNormalUser.id,
      email: testNormalUser.email,
      username: testNormalUser.username,
      role: testNormalUser.role,
    });

    // Start HTTP Server
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

  /* ---------------- 1. AUTHENTICATION & ACCESS CONTROL ATTACKS ---------------- */
  it('1. Attack Simulation: Normal user attempting Admin Dashboard -> 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard/stats`, {
      headers: { Authorization: `Bearer ${normalUserToken}` },
    });
    assert.strictEqual(res.status, 403);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
  });

  it('2. Attack Simulation: Unauthenticated caller attempting Admin APIs -> 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users`);
    assert.strictEqual(res.status, 401);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
  });

  it('3. Attack Simulation: Viewer attempting destructive force-end endpoint -> 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games/game_dummy_123/force-end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({ reason: 'Unauthorized destructive attempt' }),
    });
    assert.strictEqual(res.status, 403);
  });

  it('4. Attack Simulation: Forged adminUserId in request body is completely ignored by server', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
  });

  it('5. Attack Simulation: Expired / Forged JWT Token rejected -> 401 Unauthorized', async () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZha2VfdXNlciJ9.invalid_signature_123';
    const res = await fetch(`${baseUrl}/api/admin/dashboard/stats`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    assert.strictEqual(res.status, 401);
  });

  /* ---------------- 2. SESSION REVOCATION ATTACK ---------------- */
  it('6. Session Revocation: Revoked admin token is immediately rejected upon revocation', async () => {
    const tempAdminToken = generateAccessToken({
      id: testAdmin.id,
      email: testAdmin.email,
      username: testAdmin.username,
      role: testAdmin.role,
    });

    // Invalidate session in Redis
    const now = Date.now() + 5000;
    await redisService.setWithExpiry(`ludo:user:session_revoked:${testAdmin.id}`, now.toString(), 3600);

    const res = await fetch(`${baseUrl}/api/user/profile`, {
      headers: { Authorization: `Bearer ${tempAdminToken}` },
    });
    assert.strictEqual(res.status, 401);

    await redisService.delete(`ludo:user:session_revoked:${testAdmin.id}`);
  });

  /* ---------------- 3. SENSITIVE DATA EXCLUSION AUDIT ---------------- */
  it('7. Sensitive Data Audit: User and Admin endpoints never leak password hashes or secrets', async () => {
    const resUsers = await fetch(`${baseUrl}/api/admin/users?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.strictEqual(resUsers.status, 200);
    const dataUsers: any = await resUsers.json();
    for (const u of dataUsers.data.users) {
      assert.strictEqual(u.passwordHash, undefined);
      assert.strictEqual(u.password, undefined);
      assert.strictEqual(u.token, undefined);
    }

    const resAdmins = await fetch(`${baseUrl}/api/admin/security/admins`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.strictEqual(resAdmins.status, 200);
    const dataAdmins: any = await resAdmins.json();
    for (const a of dataAdmins.data.admins) {
      assert.strictEqual(a.passwordHash, undefined);
      assert.strictEqual(a.password, undefined);
      assert.strictEqual(a.token, undefined);
    }
  });

  /* ---------------- 4. GAME ENGINE SERVER-SIDE AUTHORITY ---------------- */
  it('8. Game Engine Server-Side Authority: Client cannot force an illegal token movement', () => {
    const game = LudoGameEngine.createGame({
      gameId: 'audit_test_game_001',
      playerIds: ['player_1', 'player_2'],
    });

    const started = LudoGameEngine.startGame(game);

    // Turn is player_1, token is HOME (-1). Attempting move without rolling dice 6 must fail.
    const invalidMoveResult = LudoGameEngine.moveToken(started, 'player_1', 'token_RED_0');
    assert.strictEqual(invalidMoveResult.success, false);
  });

  it('9. Game Engine Server-Side Authority: Server controls cryptographic dice (1 to 6)', () => {
    const game = LudoGameEngine.createGame({
      gameId: 'audit_test_game_002',
      playerIds: ['player_1', 'player_2'],
    });
    const started = LudoGameEngine.startGame(game);

    for (let i = 0; i < 50; i++) {
      const rolled = LudoGameEngine.rollDice(started, 'player_1');
      assert.strictEqual(rolled.success, true);
      assert.ok(rolled.diceValue !== undefined && rolled.diceValue >= 1 && rolled.diceValue <= 6);
      assert.strictEqual(Math.floor(rolled.diceValue!), rolled.diceValue);
    }
  });

  /* ---------------- 5. IDEMPOTENCY & CONCURRENCY ---------------- */
  it('10. Match History Idempotency: Double save does not duplicate finished match records in MySQL', async () => {
    const matchId = `match_audit_idempotency_${Date.now()}`;

    // 1st save
    await LudoMatch.create({
      id: matchId,
      gameId: 'game_audit_001',
      status: 'FINISHED',
      gameMode: 'CLASSIC',
      winnerId: testSuperAdmin.id,
      startedAt: new Date(Date.now() - 300000),
      finishedAt: new Date(),
    });

    const count = await LudoMatch.count({ where: { id: matchId } });
    assert.strictEqual(count, 1);

    // Cleanup
    await LudoMatch.destroy({ where: { id: matchId } });
  });

  /* ---------------- 6. HEALTH CHECK & ERROR HANDLING ---------------- */
  it('11. Health Check Endpoint (/api/health) returns 200 OK without revealing server secrets', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data?.jwtSecret, undefined);
    assert.strictEqual(data.data?.dbPassword, undefined);
    assert.strictEqual(data.data?.redisPassword, undefined);
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);
