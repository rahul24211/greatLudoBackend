import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app';
import sequelize from '../../../config/database';
import { User, Session, AuditLog } from '../../../models';
import { generateAccessToken } from '../../../utils/tokenUtils';
import { redisService } from '../../../services/redis/redisService';

describe('Admin Security Center Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let testSuperAdmin: User;
  let testAdmin: User;
  let testSupport: User;
  let testViewer: User;
  let testNormalUser: User;

  let superAdminToken: string;
  let adminToken: string;
  let supportToken: string;
  let viewerToken: string;
  let normalUserToken: string;

  let createdSessionId: string;

  before(async () => {
    await sequelize.sync({ force: false });

    const passwordHash = await bcrypt.hash('SecurityPass#123', 10);

    // 1. Super Admin
    const [superAdmin] = await User.findOrCreate({
      where: { email: 'super_admin_sec@ludoarena.com' },
      defaults: {
        username: 'super_admin_sec',
        email: 'super_admin_sec@ludoarena.com',
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
      where: { email: 'admin_sec@ludoarena.com' },
      defaults: {
        username: 'admin_sec',
        email: 'admin_sec@ludoarena.com',
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

    // 3. Support
    const [support] = await User.findOrCreate({
      where: { email: 'support_sec@ludoarena.com' },
      defaults: {
        username: 'support_sec',
        email: 'support_sec@ludoarena.com',
        passwordHash,
        role: 'SUPPORT',
        status: 'ACTIVE',
        coins: 2000,
        xp: 20,
        level: 2,
      },
    });
    testSupport = support;
    supportToken = generateAccessToken({
      id: testSupport.id,
      email: testSupport.email,
      username: testSupport.username,
      role: testSupport.role,
    });

    // 4. Viewer
    const [viewer] = await User.findOrCreate({
      where: { email: 'viewer_sec@ludoarena.com' },
      defaults: {
        username: 'viewer_sec',
        email: 'viewer_sec@ludoarena.com',
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

    // 5. Normal User
    const [normalUser] = await User.findOrCreate({
      where: { email: 'normal_sec@ludoarena.com' },
      defaults: {
        username: 'normal_sec',
        email: 'normal_sec@ludoarena.com',
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

    // Create a dummy session for testAdmin
    const session = await Session.create({
      userId: testAdmin.id,
      refreshToken: 'dummy_refresh_token_sec_123',
      deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    createdSessionId = session.id;

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

  /* ---------------- 1. OVERVIEW & HEALTH ---------------- */
  it('1. GET /api/admin/security/overview returns live KPIs and health diagnostics', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/overview`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(typeof data.data.totalAdmins === 'number');
    assert.ok(data.data.totalAdmins >= 2);
    assert.ok(Array.isArray(data.data.securityHealth));
    assert.ok(data.data.securityHealth.some((h: any) => h.name === 'Authentication Subsystem'));
    assert.ok(data.data.securityHealth.some((h: any) => h.name === 'RBAC Policy Engine'));
  });

  /* ---------------- 2. ADMIN ACCOUNTS & DETAIL ---------------- */
  it('2. GET /api/admin/security/admins lists administrative accounts with password exclusion', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/admins`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.admins));

    // Verify passwordHash and raw tokens are omitted
    for (const adm of data.data.admins) {
      assert.strictEqual(adm.passwordHash, undefined);
      assert.strictEqual(adm.password, undefined);
      assert.strictEqual(adm.token, undefined);
    }
  });

  it('3. GET /api/admin/security/admins/:id returns admin profile, sessions, and recent security logs', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/admins/${testAdmin.id}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.admin.id, testAdmin.id);
    assert.strictEqual(data.data.admin.passwordHash, undefined);
    assert.ok(Array.isArray(data.data.activeSessions));
  });

  /* ---------------- 3. ACTIVE SESSIONS & REVOCATION ---------------- */
  it('4. GET /api/admin/security/sessions lists active sessions with token exclusion', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/sessions`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.sessions));

    for (const s of data.data.sessions) {
      assert.strictEqual(s.refreshToken, undefined);
      assert.ok(s.id);
      assert.ok(s.deviceInfo);
    }
  });

  it('5. POST /api/admin/security/sessions/:id/revoke enforces mandatory reason (min 10 chars)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/sessions/${createdSessionId}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ reason: 'Short' }),
    });

    assert.strictEqual(res.status, 400);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
  });

  it('6. POST /api/admin/security/sessions/:id/revoke destroys session and writes audit log', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/sessions/${createdSessionId}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ reason: 'Terminated suspicious administrative session on test host' }),
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    // Verify session removed from DB
    const check = await Session.findByPk(createdSessionId);
    assert.strictEqual(check, null);

    // Verify audit log
    const audit = await AuditLog.findOne({
      where: {
        action: 'ADMIN_SESSION_REVOKED',
        resourceId: createdSessionId,
      },
    });
    assert.ok(audit);
  });

  /* ---------------- 4. EMERGENCY REVOKE ALL SESSIONS ---------------- */
  it('7. POST /api/admin/security/admins/:id/revoke-all-sessions blocks self-lockout without confirmation', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/admins/${testSuperAdmin.id}/revoke-all-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        reason: 'Attempting self-session emergency purge without allowSelf flag',
      }),
    });

    assert.strictEqual(res.status, 400);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('self-revocation confirmation'));
  });

  it('8. POST /api/admin/security/admins/:id/revoke-all-sessions successfully invalidates target admin in Redis and DB', async () => {
    // Create new session for testAdmin
    await Session.create({
      userId: testAdmin.id,
      refreshToken: 'refresh_to_be_purged_001',
      deviceInfo: 'Mozilla/5.0 iPad Safari',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const res = await fetch(`${baseUrl}/api/admin/security/admins/${testAdmin.id}/revoke-all-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        reason: 'Emergency security revocation across all mobile and web clients',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    // Verify Redis invalidation key set
    const revokedVal = await redisService.get(`ludo:user:session_revoked:${testAdmin.id}`);
    assert.ok(revokedVal);

    // Verify DB sessions deleted for testAdmin
    const remaining = await Session.count({ where: { userId: testAdmin.id } });
    assert.strictEqual(remaining, 0);
  });

  /* ---------------- 5. LOGIN ACTIVITY & EVENTS ---------------- */
  it('9. GET /api/admin/security/login-activity returns login attempts with masked IPs', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/login-activity?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.logs));
  });

  it('10. GET /api/admin/security/events returns security events stream', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/events?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.events));
  });

  it('11. GET /api/admin/security/permissions-matrix returns dynamic RBAC matrix', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/permissions-matrix`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.roles));
    assert.ok(Array.isArray(data.data.modules));
    assert.ok(data.data.modules.some((m: any) => m.permission === 'SECURITY_VIEW'));
  });

  /* ---------------- 6. RBAC & PERMISSION REJECTION ---------------- */
  it('12. SUPPORT & VIEWER roles are rejected with 403 for security endpoints', async () => {
    // Support
    const resSup = await fetch(`${baseUrl}/api/admin/security/overview`, {
      headers: { Authorization: `Bearer ${supportToken}` },
    });
    assert.strictEqual(resSup.status, 403);

    // Viewer
    const resView = await fetch(`${baseUrl}/api/admin/security/overview`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    assert.strictEqual(resView.status, 403);
  });

  it('13. ADMIN role can view security overview but is rejected from revoking sessions', async () => {
    // Admin can view overview (SECURITY_VIEW)
    const resView = await fetch(`${baseUrl}/api/admin/security/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(resView.status, 200);

    // Admin CANNOT revoke sessions (requires ADMIN_SESSION_REVOKE)
    const resRevoke = await fetch(`${baseUrl}/api/admin/security/admins/${testAdmin.id}/revoke-all-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ reason: 'Admin role unauthorized revocation attempt' }),
    });
    assert.strictEqual(resRevoke.status, 403);
  });

  it('14. Normal USER is blocked with 403 on all security endpoints', async () => {
    const res = await fetch(`${baseUrl}/api/admin/security/overview`, {
      headers: { Authorization: `Bearer ${normalUserToken}` },
    });
    assert.strictEqual(res.status, 403);
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);
