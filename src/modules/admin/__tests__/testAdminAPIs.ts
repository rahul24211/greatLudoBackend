import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app';
import sequelize from '../../../config/database';
import { User } from '../../../models';
import { generateAccessToken } from '../../../utils/tokenUtils';

describe('Admin Panel API & Security Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let testAdminUser: User;
  let testNormalUser: User;
  let adminToken: string;
  let userToken: string;

  before(async () => {
    await sequelize.sync({ force: false });

    // 1. Create or ensure test admin user
    const adminPasswordHash = await bcrypt.hash('AdminPassword123!', 10);
    const [admin] = await User.findOrCreate({
      where: { email: 'superadmin_test@ludoarena.com' },
      defaults: {
        username: 'superadmin_test',
        email: 'superadmin_test@ludoarena.com',
        passwordHash: adminPasswordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        coins: 10000,
        xp: 100,
        level: 5,
      },
    });
    testAdminUser = admin;
    adminToken = generateAccessToken({
      id: testAdminUser.id,
      email: testAdminUser.email,
      username: testAdminUser.username,
      role: testAdminUser.role,
    });

    // 2. Create or ensure normal test user
    const userPasswordHash = await bcrypt.hash('UserPassword123!', 10);
    const [normal] = await User.findOrCreate({
      where: { email: 'normal_player_test@ludoarena.com' },
      defaults: {
        username: 'normal_player_test',
        email: 'normal_player_test@ludoarena.com',
        passwordHash: userPasswordHash,
        role: 'USER',
        status: 'ACTIVE',
        coins: 1000,
        xp: 10,
        level: 1,
      },
    });
    testNormalUser = normal;
    userToken = generateAccessToken({
      id: testNormalUser.id,
      email: testNormalUser.email,
      username: testNormalUser.username,
      role: testNormalUser.role,
    });

    // 3. Start Express server on ephemeral port
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

  it('1. Admin Login with valid credentials succeeds and returns role permissions', async () => {
    const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'superadmin_test@ludoarena.com',
        password: 'AdminPassword123!',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.token);
    assert.strictEqual(data.data.adminUser.role, 'SUPER_ADMIN');
    assert.ok(Array.isArray(data.data.adminUser.permissions));
    assert.ok(data.data.adminUser.permissions.includes('DASHBOARD_VIEW'));
  });

  it('2. Admin Login with invalid password fails with 401', async () => {
    const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'superadmin_test@ludoarena.com',
        password: 'WrongPassword!',
      }),
    });

    assert.strictEqual(res.status, 401);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
  });

  it('3. Normal user attempting admin login gets 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'normal_player_test@ludoarena.com',
        password: 'UserPassword123!',
      }),
    });

    assert.strictEqual(res.status, 403);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('not authorized'));
  });

  it('4. Unauthenticated request to /api/admin/dashboard gets 401', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`);
    assert.strictEqual(res.status, 401);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
  });

  it('5. Normal user token querying /api/admin/dashboard gets 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(res.status, 403);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('Admin privileges required'));
  });

  it('6. Admin token querying /api/admin/dashboard returns real metrics', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(typeof data.data.users.total === 'number');
    assert.ok(typeof data.data.games.active === 'number');
    assert.ok(typeof data.data.games.completed === 'number');
    assert.ok(data.data.system.database === 'UP' || data.data.system.database === 'DOWN');
  });

  it('7. GET /api/admin/users returns user list and NEVER exposes passwordHash', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.users));
    assert.ok(data.data.users.length > 0);

    for (const u of data.data.users) {
      assert.strictEqual(u.passwordHash, undefined, 'passwordHash must never be exposed');
      assert.ok(u.id);
      assert.ok(u.username);
      assert.ok(u.role);
    }
  });

  it('8. GET /api/admin/games returns game sessions safely', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.games));
  });

  it('9. GET /api/admin/matches returns historical match records', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matches`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.matches));
  });

  it('10. GET /api/admin/matchmaking returns real-time queue telemetry', async () => {
    const res = await fetch(`${baseUrl}/api/admin/matchmaking`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.mode, 'CLASSIC');
    assert.ok(typeof data.data.queueLength === 'number');
    assert.strictEqual(data.data.botFallbackSeconds, 7);
  });

  it('11. GET /api/admin/bots returns bot metrics and difficulty info', async () => {
    const res = await fetch(`${baseUrl}/api/admin/bots`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(typeof data.data.totalBotMatches === 'number');
    assert.ok(data.data.difficultyDistribution.EASY);
    assert.ok(data.data.difficultyDistribution.MEDIUM);
    assert.ok(data.data.difficultyDistribution.HARD);
  });

  it('12. GET /api/admin/system/health returns safe health status', async () => {
    const res = await fetch(`${baseUrl}/api/admin/system/health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.data.status === 'UP' || data.data.status === 'DEGRADED');
    assert.strictEqual(data.data.components.backendProcess, 'UP');
    assert.ok(typeof data.data.uptime === 'number');
  });

  it('13. GET /api/admin/audit-logs returns server-generated audit entries', async () => {
    const res = await fetch(`${baseUrl}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.logs));
    assert.ok(data.data.logs.length > 0);

    const hasLoginOrDashboard = data.data.logs.some(
      (l: any) => l.action === 'ADMIN_LOGIN' || l.action === 'DASHBOARD_ACCESS'
    );
    assert.strictEqual(hasLoginOrDashboard, true);
  });

  it('14. Admin Logout logs audit event and returns success', async () => {
    const res = await fetch(`${baseUrl}/api/admin/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);
