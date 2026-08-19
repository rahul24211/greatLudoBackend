export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | 'VIEWER';

export type AdminPermission =
  | 'DASHBOARD_VIEW'
  | 'USER_VIEW'
  | 'USER_MANAGE'
  | 'SESSION_REVOKE'
  | 'GAME_VIEW'
  | 'GAME_MANAGE'
  | 'GAME_FORCE_END'
  | 'MATCH_HISTORY_VIEW'
  | 'MATCH_HISTORY_EXPORT'
  | 'REPORT_VIEW'
  | 'MATCHMAKING_VIEW'
  | 'BOT_VIEW'
  | 'BOT_MANAGE'
  | 'SYSTEM_VIEW'
  | 'ADMIN_MANAGE'
  | 'AUDIT_LOG_VIEW'
  | 'NOTIFICATION_VIEW'
  | 'NOTIFICATION_MANAGE'
  | 'SECURITY_VIEW'
  | 'ADMIN_SESSION_REVOKE'
  | 'SECURITY_MANAGE';

export const ALL_ADMIN_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'VIEWER'];

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  SUPER_ADMIN: [
    'DASHBOARD_VIEW',
    'USER_VIEW',
    'USER_MANAGE',
    'SESSION_REVOKE',
    'GAME_VIEW',
    'GAME_MANAGE',
    'GAME_FORCE_END',
    'MATCH_HISTORY_VIEW',
    'MATCH_HISTORY_EXPORT',
    'REPORT_VIEW',
    'MATCHMAKING_VIEW',
    'BOT_VIEW',
    'BOT_MANAGE',
    'SYSTEM_VIEW',
    'ADMIN_MANAGE',
    'AUDIT_LOG_VIEW',
    'NOTIFICATION_VIEW',
    'NOTIFICATION_MANAGE',
    'SECURITY_VIEW',
    'ADMIN_SESSION_REVOKE',
    'SECURITY_MANAGE',
  ],
  ADMIN: [
    'DASHBOARD_VIEW',
    'USER_VIEW',
    'USER_MANAGE',
    'SESSION_REVOKE',
    'GAME_VIEW',
    'GAME_MANAGE',
    'GAME_FORCE_END',
    'MATCH_HISTORY_VIEW',
    'MATCH_HISTORY_EXPORT',
    'REPORT_VIEW',
    'MATCHMAKING_VIEW',
    'BOT_VIEW',
    'BOT_MANAGE',
    'SYSTEM_VIEW',
    'AUDIT_LOG_VIEW',
    'NOTIFICATION_VIEW',
    'NOTIFICATION_MANAGE',
    'SECURITY_VIEW',
  ],
  SUPPORT: [
    'USER_VIEW',
    'GAME_VIEW',
    'MATCH_HISTORY_VIEW',
    'REPORT_VIEW',
    'MATCHMAKING_VIEW',
    'BOT_VIEW',
    'NOTIFICATION_VIEW',
    'NOTIFICATION_MANAGE',
  ],
  VIEWER: [
    'DASHBOARD_VIEW',
    'GAME_VIEW',
    'MATCH_HISTORY_VIEW',
    'REPORT_VIEW',
    'MATCHMAKING_VIEW',
    'BOT_VIEW',
    'NOTIFICATION_VIEW',
    'NOTIFICATION_MANAGE',
  ],
};

/**
 * Checks if a given role has the requested permission.
 */
export function hasPermission(role: string | undefined, permission: AdminPermission): boolean {
  if (!role || !ALL_ADMIN_ROLES.includes(role as AdminRole)) {
    return false;
  }
  const permissions = ROLE_PERMISSIONS[role as AdminRole];
  return Boolean(permissions && permissions.includes(permission));
}

/**
 * Returns true if the role is a valid administrative role.
 */
export function isAdminRole(role: string | undefined): boolean {
  return Boolean(role && ALL_ADMIN_ROLES.includes(role as AdminRole));
}
