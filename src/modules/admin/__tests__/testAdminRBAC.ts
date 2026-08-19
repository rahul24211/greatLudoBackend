import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  hasPermission,
  isAdminRole,
  ROLE_PERMISSIONS,
} from '../AdminPermissions';

describe('Admin RBAC & Permission Matrix Unit Tests', () => {
  it('1. Recognizes valid admin roles and rejects normal USER', () => {
    assert.strictEqual(isAdminRole('SUPER_ADMIN'), true);
    assert.strictEqual(isAdminRole('ADMIN'), true);
    assert.strictEqual(isAdminRole('SUPPORT'), true);
    assert.strictEqual(isAdminRole('VIEWER'), true);
    assert.strictEqual(isAdminRole('USER'), false);
    assert.strictEqual(isAdminRole(undefined), false);
    assert.strictEqual(isAdminRole('RANDOM_ROLE'), false);
  });

  it('2. SUPER_ADMIN possesses all defined permissions', () => {
    const superAdminPerms = ROLE_PERMISSIONS.SUPER_ADMIN;
    assert.ok(superAdminPerms.includes('DASHBOARD_VIEW'));
    assert.ok(superAdminPerms.includes('USER_VIEW'));
    assert.ok(superAdminPerms.includes('USER_MANAGE'));
    assert.ok(superAdminPerms.includes('GAME_VIEW'));
    assert.ok(superAdminPerms.includes('GAME_MANAGE'));
    assert.ok(superAdminPerms.includes('MATCH_HISTORY_VIEW'));
    assert.ok(superAdminPerms.includes('MATCHMAKING_VIEW'));
    assert.ok(superAdminPerms.includes('BOT_VIEW'));
    assert.ok(superAdminPerms.includes('BOT_MANAGE'));
    assert.ok(superAdminPerms.includes('SYSTEM_VIEW'));
    assert.ok(superAdminPerms.includes('ADMIN_MANAGE'));
    assert.ok(superAdminPerms.includes('AUDIT_LOG_VIEW'));

    assert.strictEqual(hasPermission('SUPER_ADMIN', 'ADMIN_MANAGE'), true);
    assert.strictEqual(hasPermission('SUPER_ADMIN', 'USER_MANAGE'), true);
  });

  it('3. ADMIN possesses standard operational permissions but NOT ADMIN_MANAGE', () => {
    assert.strictEqual(hasPermission('ADMIN', 'DASHBOARD_VIEW'), true);
    assert.strictEqual(hasPermission('ADMIN', 'USER_VIEW'), true);
    assert.strictEqual(hasPermission('ADMIN', 'GAME_VIEW'), true);
    assert.strictEqual(hasPermission('ADMIN', 'MATCH_HISTORY_VIEW'), true);
    assert.strictEqual(hasPermission('ADMIN', 'SYSTEM_VIEW'), true);
    assert.strictEqual(hasPermission('ADMIN', 'AUDIT_LOG_VIEW'), true);
    assert.strictEqual(hasPermission('ADMIN', 'ADMIN_MANAGE'), false);
  });

  it('4. SUPPORT role is limited to read operations (Users, Games, Matches)', () => {
    assert.strictEqual(hasPermission('SUPPORT', 'USER_VIEW'), true);
    assert.strictEqual(hasPermission('SUPPORT', 'GAME_VIEW'), true);
    assert.strictEqual(hasPermission('SUPPORT', 'MATCH_HISTORY_VIEW'), true);

    // Forbidden for SUPPORT
    assert.strictEqual(hasPermission('SUPPORT', 'USER_MANAGE'), false);
    assert.strictEqual(hasPermission('SUPPORT', 'DASHBOARD_VIEW'), false);
    assert.strictEqual(hasPermission('SUPPORT', 'ADMIN_MANAGE'), false);
    assert.strictEqual(hasPermission('SUPPORT', 'SYSTEM_VIEW'), false);
    assert.strictEqual(hasPermission('SUPPORT', 'BOT_MANAGE'), false);
  });

  it('5. VIEWER role has read-only access to Dashboard, Games, and Matches only', () => {
    assert.strictEqual(hasPermission('VIEWER', 'DASHBOARD_VIEW'), true);
    assert.strictEqual(hasPermission('VIEWER', 'GAME_VIEW'), true);
    assert.strictEqual(hasPermission('VIEWER', 'MATCH_HISTORY_VIEW'), true);

    // Forbidden for VIEWER
    assert.strictEqual(hasPermission('VIEWER', 'USER_VIEW'), false);
    assert.strictEqual(hasPermission('VIEWER', 'USER_MANAGE'), false);
    assert.strictEqual(hasPermission('VIEWER', 'BOT_MANAGE'), false);
    assert.strictEqual(hasPermission('VIEWER', 'SYSTEM_VIEW'), false);
    assert.strictEqual(hasPermission('VIEWER', 'AUDIT_LOG_VIEW'), false);
  });

  it('6. Normal USER has ZERO admin permissions', () => {
    assert.strictEqual(hasPermission('USER', 'DASHBOARD_VIEW'), false);
    assert.strictEqual(hasPermission('USER', 'USER_VIEW'), false);
    assert.strictEqual(hasPermission('USER', 'GAME_VIEW'), false);
    assert.strictEqual(hasPermission('USER', 'MATCH_HISTORY_VIEW'), false);
    assert.strictEqual(hasPermission('USER', 'SYSTEM_VIEW'), false);
  });
});
