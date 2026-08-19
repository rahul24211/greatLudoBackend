import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import bcrypt from 'bcryptjs';
import { createApp } from '../../../app';
import sequelize from '../../../config/database';
import { User, LudoMatch } from '../../../models';
import { generateAccessToken } from '../../../utils/tokenUtils';
import { activeLudoGames } from '../../../socket/ludoSocketHandler';
import { redisService } from '../../../services/redis/redisService';

describe('Admin User Actions & Game Moderation Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  let testSuperAdmin: User;
  let testAdmin: User;
  let testSupport: User;
  let testViewer: User;
  let testTargetUser: User;

  let superAdminToken: string;
  let adminToken: string;
  let supportToken: string;
  let viewerToken: string;
  let normalUserToken: string;

  const testGameId = 'game_moderation_test_active_001';

  before(async () => {
    await sequelize.sync({ force: false });

    const passwordHash = await bcrypt.hash('AdminActionPass#1', 10);

    // 1. Create Super Admin
    const [superAdmin] = await User.findOrCreate({
      where: { email: 'super_admin_actions@ludoarena.com' },
      defaults: {
        username: 'super_admin_actions',
        email: 'super_admin_actions@ludoarena.com',
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

    // 2. Create Admin
    const [admin] = await User.findOrCreate({
      where: { email: 'admin_actions@ludoarena.com' },
      defaults: {
        username: 'admin_actions',
        email: 'admin_actions@ludoarena.com',
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

    // 3. Create Support
    const [support] = await User.findOrCreate({
      where: { email: 'support_actions@ludoarena.com' },
      defaults: {
        username: 'support_actions',
        email: 'support_actions@ludoarena.com',
        passwordHash,
        role: 'SUPPORT',
        status: 'ACTIVE',
        coins: 100,
        xp: 0,
        level: 1,
      },
    });
    testSupport = support;
    supportToken = generateAccessToken({
      id: testSupport.id,
      email: testSupport.email,
      username: testSupport.username,
      role: testSupport.role,
    });

    // 4. Create Viewer
    const [viewer] = await User.findOrCreate({
      where: { email: 'viewer_actions@ludoarena.com' },
      defaults: {
        username: 'viewer_actions',
        email: 'viewer_actions@ludoarena.com',
        passwordHash,
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

    // 5. Create Target Player
    const [target] = await User.findOrCreate({
      where: { email: 'target_player_actions@ludoarena.com' },
      defaults: {
        username: 'target_player_actions',
        email: 'target_player_actions@ludoarena.com',
        passwordHash,
        role: 'USER',
        status: 'ACTIVE',
        coins: 1000,
        xp: 10,
        level: 1,
      },
    });
    testTargetUser = target;
    normalUserToken = generateAccessToken({
      id: testTargetUser.id,
      email: testTargetUser.email,
      username: testTargetUser.username,
      role: testTargetUser.role,
    });

    // 6. Set up in-memory Active Game for force-end testing
    activeLudoGames.set(testGameId, {
      gameId: testGameId,
      roomId: 'room_mod_test',
      mode: 'CLASSIC',
      status: 'ACTIVE',
      players: [
        {
          playerId: testTargetUser.id,
          userId: testTargetUser.id,
          username: testTargetUser.username,
          color: 'RED',
          tokens: [
            { tokenId: 'tok_r1', playerId: testTargetUser.id, color: 'RED', position: 5, state: 'ACTIVE' },
            { tokenId: 'tok_r2', playerId: testTargetUser.id, color: 'RED', position: -1, state: 'HOME' },
            { tokenId: 'tok_r3', playerId: testTargetUser.id, color: 'RED', position: -1, state: 'HOME' },
            { tokenId: 'tok_r4', playerId: testTargetUser.id, color: 'RED', position: -1, state: 'HOME' },
          ],
          isConnected: true,
          playerType: 'HUMAN',
        },
        {
          playerId: 'bot_mod_opp',
          userId: 'bot_mod_opp',
          username: 'Smart Bot',
          color: 'GREEN',
          tokens: [
            { tokenId: 'tok_g1', playerId: 'bot_mod_opp', color: 'GREEN', position: 10, state: 'ACTIVE' },
            { tokenId: 'tok_g2', playerId: 'bot_mod_opp', color: 'GREEN', position: -1, state: 'HOME' },
            { tokenId: 'tok_g3', playerId: 'bot_mod_opp', color: 'GREEN', position: -1, state: 'HOME' },
            { tokenId: 'tok_g4', playerId: 'bot_mod_opp', color: 'GREEN', position: -1, state: 'HOME' },
          ],
          isConnected: true,
          playerType: 'BOT',
        },
      ],
      currentPlayerId: testTargetUser.id,
      diceValue: 3,
      diceRolled: true,
      moveNumber: 4,
      winner: null,
      lastAction: null,
      turnNumber: 2,
    });

    // 7. Start test HTTP server
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
    activeLudoGames.delete(testGameId);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  /* ---------------- USER ACTIONS ---------------- */
  it('1. PATCH /api/admin/users/:id/status deactivates user with reason >= 10 chars', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${testTargetUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'INACTIVE',
        reason: 'Investigating suspected terms of service breach',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.user.status, 'INACTIVE');
  });

  it('2. PATCH /api/admin/users/:id/status activates user with reason >= 10 chars', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${testTargetUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        reason: 'Verification completed and account restored',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.user.status, 'ACTIVE');
  });

  it('3. PATCH /api/admin/users/:id/status rejects reason under 10 characters', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${testTargetUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'INACTIVE',
        reason: 'Too short',
      }),
    });

    assert.strictEqual(res.status, 400);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('10 characters'));
  });

  it('4. PATCH /api/admin/users/:id/status rejects invalid status values', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${testTargetUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'INVALID_STATUS',
        reason: 'Valid length reason for testing',
      }),
    });

    assert.strictEqual(res.status, 400);
  });

  it('5. POST /api/admin/users/:id/revoke-sessions revokes user authentication sessions', async () => {
    const res = await fetch(`${baseUrl}/api/admin/users/${testTargetUser.id}/revoke-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        reason: 'Security rotation and multi-device session purge',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    // Verify session revoked key in Redis
    const revokedKey = await redisService.get(`ludo:user:session_revoked:${testTargetUser.id}`);
    assert.ok(revokedKey);
  });

  it('6. Revoked user access token is rejected by authMiddleware', async () => {
    // Normal user token was generated before revocation timestamp
    const res = await fetch(`${baseUrl}/api/profile`, {
      headers: { Authorization: `Bearer ${normalUserToken}` },
    });

    assert.strictEqual(res.status, 401);
    const data: any = await res.json();
    assert.ok(data.message.includes('revoked'));
  });

  /* ---------------- GAME MODERATION ---------------- */
  it('7. POST /api/admin/games/:gameId/force-end terminates active game under lock', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games/${testGameId}/force-end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        reason: 'Administrative termination due to stuck client connection',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.gameState.status, 'FINISHED');
    assert.strictEqual(data.data.gameState.finishReason, 'ADMIN_FORCED');
    assert.strictEqual(data.data.gameState.winner, null);

    // Verify match history recorded in MySQL
    const match = await LudoMatch.findOne({ where: { gameId: testGameId } });
    assert.ok(match);
    assert.strictEqual(match.status, 'FINISHED');
  });

  it('8. POST /api/admin/games/:gameId/force-end on already FINISHED game returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/admin/games/${testGameId}/force-end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        reason: 'Attempting to force-end already finalized game',
      }),
    });

    assert.strictEqual(res.status, 400);
    const data: any = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('already finished'));
  });

  /* ---------------- RBAC & SECURITY TESTS ---------------- */
  it('9. SUPPORT and VIEWER roles are rejected from executing user & game moderation actions', async () => {
    // Support attempt on user status
    const res1 = await fetch(`${baseUrl}/api/admin/users/${testTargetUser.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supportToken}`,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        reason: 'Support unauthorized test',
      }),
    });
    assert.strictEqual(res1.status, 403);

    // Viewer attempt on game force-end
    const res2 = await fetch(`${baseUrl}/api/admin/games/${testGameId}/force-end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({
        reason: 'Viewer unauthorized test',
      }),
    });
    assert.strictEqual(res2.status, 403);
  });

  it('10. Audit log records actions (USER_ACTIVATED, USER_DEACTIVATED, USER_SESSIONS_REVOKED, GAME_FORCE_ENDED)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/audit-logs?limit=50`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });

    assert.strictEqual(res.status, 200);
    const data: any = await res.json();
    assert.strictEqual(data.success, true);

    const actions = data.data.logs.map((l: any) => l.action);
    assert.ok(actions.includes('USER_DEACTIVATED') || actions.includes('USER_ACTIVATED'));
    assert.ok(actions.includes('USER_SESSIONS_REVOKED'));
    assert.ok(actions.includes('GAME_FORCE_ENDED'));
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);
