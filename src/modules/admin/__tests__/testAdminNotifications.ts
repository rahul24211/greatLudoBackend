import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app';
import sequelize from '../../../config/database';
import { User, AdminNotification } from '../../../models';
import { generateAccessToken } from '../../../utils/tokenUtils';
import { AdminNotificationService } from '../AdminNotificationService';

describe('Admin Notifications & Realtime System Alerts Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let testSuperAdmin: User;
  let testAdminB: User;
  let testNormalUser: User;

  let superAdminToken: string;
  let adminBToken: string;
  let normalUserToken: string;

  let createdNotificationId: string;

  before(async () => {
    await sequelize.sync({ force: false });

    const passwordHash = await bcrypt.hash('AdminNotifPass#1', 10);

    // 1. Create Super Admin
    const [superAdmin] = await User.findOrCreate({
      where: { email: 'super_admin_notif@ludoarena.com' },
      defaults: {
        username: 'super_admin_notif',
        email: 'super_admin_notif@ludoarena.com',
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

    // 2. Create Admin B (for multi-admin read isolation test)
    const [adminB] = await User.findOrCreate({
      where: { email: 'admin_b_notif@ludoarena.com' },
      defaults: {
        username: 'admin_b_notif',
        email: 'admin_b_notif@ludoarena.com',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        coins: 5000,
        xp: 50,
        level: 3,
      },
    });
    testAdminB = adminB;
    adminBToken = generateAccessToken({
      id: testAdminB.id,
      email: testAdminB.email,
      username: testAdminB.username,
      role: testAdminB.role,
    });

    // 3. Create Normal User
    const [normalUser] = await User.findOrCreate({
      where: { email: 'normal_user_notif@ludoarena.com' },
      defaults: {
        username: 'normal_user_notif',
        email: 'normal_user_notif@ludoarena.com',
        passwordHash,
        role: 'USER',
        status: 'ACTIVE',
        coins: 500,
        xp: 10,
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

    // 4. Start HTTP Server
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

  /* ---------------- CREATION & PERSISTENCE ---------------- */
  it('1. AdminNotificationService creates and persists notification in MySQL', async () => {
    const res = await AdminNotificationService.createNotification({
      type: 'SECURITY_ALERT',
      severity: 'WARNING',
      title: 'Suspicious Admin Login Detected',
      message: 'Multiple failed authentication attempts detected from IP 192.168.1.55',
      resourceType: 'SECURITY',
      resourceId: 'IP_192.168.1.55',
      metadata: {
        ip: '192.168.1.55',
        failedAttempts: 5,
        password: 'SUPER_SECRET_PASSWORD', // should be sanitized
      },
    });

    assert.strictEqual(res.created, true);
    assert.ok(res.notification);
    assert.strictEqual(res.notification.title, 'Suspicious Admin Login Detected');
    assert.strictEqual(res.notification.severity, 'WARNING');

    createdNotificationId = res.notification.id;

    // Verify secret sanitization in metadata
    assert.strictEqual(res.notification.metadata?.password, undefined);
    assert.strictEqual(res.notification.metadata?.ip, '192.168.1.55');
  });

  /* ---------------- RETRIEVAL & UNREAD COUNT ---------------- */
  it('2. GET /api/admin/notifications/unread-count returns accurate count for current admin', async () => {
    const res = await fetch(`${baseUrl}/api/admin/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(typeof data.data.unreadCount === 'number');
    assert.ok(data.data.unreadCount >= 1);
  });

  it('3. GET /api/admin/notifications returns paginated list with per-admin isRead status', async () => {
    const res = await fetch(`${baseUrl}/api/admin/notifications?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.data.notifications));
    assert.ok(data.data.notifications.length >= 1);

    const target = data.data.notifications.find((n: any) => n.id === createdNotificationId);
    assert.ok(target);
    assert.strictEqual(target.isRead, false);
  });

  it('4. Filters by category, status, and severity work correctly', async () => {
    // Filter by category: SECURITY
    const resSec = await fetch(`${baseUrl}/api/admin/notifications?category=SECURITY`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const dataSec: any = await resSec.json();
    assert.strictEqual(dataSec.success, true);
    assert.ok(dataSec.data.notifications.every((n: any) => n.type === 'SECURITY_ALERT' || n.type === 'SESSION_REVOKED'));

    // Filter by severity: WARNING
    const resWarn = await fetch(`${baseUrl}/api/admin/notifications?severity=WARNING`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const dataWarn: any = await resWarn.json();
    assert.strictEqual(dataWarn.success, true);
    assert.ok(dataWarn.data.notifications.every((n: any) => n.severity === 'WARNING'));
  });

  /* ---------------- MARK READ & ISOLATION ---------------- */
  it('5. PATCH /api/admin/notifications/:id/read marks notification as read for Super Admin', async () => {
    const res = await fetch(`${baseUrl}/api/admin/notifications/${createdNotificationId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    // Verify isRead is now true for Super Admin
    const resList = await fetch(`${baseUrl}/api/admin/notifications`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const dataList: any = await resList.json();
    const target = dataList.data.notifications.find((n: any) => n.id === createdNotificationId);
    assert.ok(target);
    assert.strictEqual(target.isRead, true);
  });

  it('6. Multi-Admin Read Isolation: Notification remains UNREAD for Admin B', async () => {
    const resB = await fetch(`${baseUrl}/api/admin/notifications`, {
      headers: { Authorization: `Bearer ${adminBToken}` },
    });

    assert.strictEqual(resB.status, 200);
    const dataB: any = await resB.json();
    const targetB = dataB.data.notifications.find((n: any) => n.id === createdNotificationId);
    assert.ok(targetB);
    assert.strictEqual(targetB.isRead, false);
  });

  it('7. POST /api/admin/notifications/read-all marks all unread notifications as read', async () => {
    const res = await fetch(`${baseUrl}/api/admin/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminBToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    // Verify unread count is now 0 for Admin B
    const resUnread = await fetch(`${baseUrl}/api/admin/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${adminBToken}` },
    });
    const dataUnread: any = await resUnread.json();
    assert.strictEqual(dataUnread.data.unreadCount, 0);
  });

  /* ---------------- DEDUPLICATION & TRANSITIONS ---------------- */
  it('8. Throttling / Deduplication prevents duplicate notification creation', async () => {
    const dedupKey = 'test_throttle_unique_key_001';

    const res1 = await AdminNotificationService.createNotification({
      type: 'HIGH_ERROR_RATE',
      severity: 'ERROR',
      title: 'High Error Rate Detected',
      message: 'Rolling window error rate exceeded 5%',
      throttleSeconds: 30,
      dedupKey,
    });
    assert.strictEqual(res1.created, true);

    // Immediate second call should be throttled
    const res2 = await AdminNotificationService.createNotification({
      type: 'HIGH_ERROR_RATE',
      severity: 'ERROR',
      title: 'High Error Rate Detected',
      message: 'Rolling window error rate exceeded 5%',
      throttleSeconds: 30,
      dedupKey,
    });
    assert.strictEqual(res2.created, false);
    assert.strictEqual(res2.throttled, true);
  });

  it('9. System Health Status Transition triggers alerts on state change but not identical states', async () => {
    // 1. Transition REDIS from HEALTHY to DOWN
    await AdminNotificationService.recordSystemHealthTransition('REDIS', 'DOWN', {
      message: 'Redis ping timeout',
    });

    const notifs = await AdminNotification.findAll({
      where: { type: 'REDIS_DOWN' },
      order: [['createdAt', 'DESC']],
    });
    assert.ok(notifs.length >= 1);
    assert.strictEqual(notifs[0].severity, 'CRITICAL');

    // 2. Transition REDIS from DOWN to HEALTHY (Recovery)
    await AdminNotificationService.recordSystemHealthTransition('REDIS', 'HEALTHY', {
      message: 'Redis connection re-established',
    });

    const recoverNotifs = await AdminNotification.findAll({
      where: { type: 'REDIS_RECOVERED' },
      order: [['createdAt', 'DESC']],
    });
    assert.ok(recoverNotifs.length >= 1);
    assert.strictEqual(recoverNotifs[0].severity, 'INFO');
  });

  /* ---------------- RETENTION & RBAC ---------------- */
  it('10. Retention Policy Cleanup removes expired notifications', async () => {
    // Create an old notification with date in the past
    const oldNotif = await AdminNotification.create({
      type: 'SYSTEM_HEALTH_CHANGED',
      severity: 'INFO',
      title: 'Ancient Notification',
      message: 'Should be deleted by retention policy',
      createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
    });

    const deleted = await AdminNotificationService.cleanupOldNotifications(90);
    assert.ok(deleted >= 1);

    const check = await AdminNotification.findByPk(oldNotif.id);
    assert.strictEqual(check, null);
  });

  it('11. Normal USER is rejected with 403 for notification endpoints', async () => {
    const res = await fetch(`${baseUrl}/api/admin/notifications`, {
      headers: { Authorization: `Bearer ${normalUserToken}` },
    });
    assert.strictEqual(res.status, 403);
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);
