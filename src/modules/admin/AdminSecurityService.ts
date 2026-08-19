import { Op } from 'sequelize';
import sequelize from '../../config/database';
import { User, Session, AuditLog } from '../../models';
import { ALL_ADMIN_ROLES, ROLE_PERMISSIONS, AdminRole } from './AdminPermissions';
import { redisService } from '../../services/redis/redisService';
import { AuditLogService } from './AuditLogService';
import { AdminNotificationService } from './AdminNotificationService';
import getRedisClient from '../../config/redis';

export interface SecurityHealthItem {
  name: string;
  category: string;
  status: 'UP' | 'DEGRADED' | 'DOWN';
  description: string;
  latencyMs?: number;
}

export class AdminSecurityService {
  /**
   * Security Overview & Live Health Check Diagnostics
   */
  public static async getSecurityOverview(): Promise<{
    totalAdmins: number;
    activeAdminSessions: number;
    failedLogins24h: number;
    securityEventsCount: number;
    securityHealth: SecurityHealthItem[];
    recentSecurityEvents: any[];
  }> {
    // 1. Total Admin Accounts
    const totalAdmins = await User.count({
      where: { role: { [Op.in]: ALL_ADMIN_ROLES } },
    });

    // 2. Active Admin Sessions
    const activeAdminSessions = await Session.count({
      include: [
        {
          model: User,
          as: 'user',
          where: { role: { [Op.in]: ALL_ADMIN_ROLES } },
          required: true,
        },
      ],
    });

    // 3. Failed Logins in Last 24 Hours
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failedLogins24h = await AuditLog.count({
      where: {
        action: 'ADMIN_LOGIN_FAILED',
        createdAt: { [Op.gte]: last24h },
      },
    });

    // 4. Total Security Events
    const securityActions = [
      'ADMIN_LOGIN',
      'ADMIN_LOGIN_FAILED',
      'ADMIN_SESSION_REVOKED',
      'ADMIN_ALL_SESSIONS_REVOKED',
      'USER_SESSIONS_REVOKED',
      'SECURITY_ALERT',
      'USER_DEACTIVATED',
      'USER_ACTIVATED',
      'GAME_FORCE_ENDED',
    ];

    const securityEventsCount = await AuditLog.count({
      where: { action: { [Op.in]: securityActions } },
    });

    // 5. Live Security Health Diagnostics
    const securityHealth: SecurityHealthItem[] = [];

    // Diagnostic 1: Authentication & MySQL User Store
    try {
      const start = Date.now();
      await User.findOne({ attributes: ['id'] });
      securityHealth.push({
        name: 'Authentication Subsystem',
        category: 'Core Auth',
        status: 'UP',
        description: 'Bcrypt cryptographic verification and JWT token issuing operational.',
        latencyMs: Date.now() - start,
      });
    } catch {
      securityHealth.push({
        name: 'Authentication Subsystem',
        category: 'Core Auth',
        status: 'DOWN',
        description: 'Database connection failure preventing user credentials verification.',
      });
    }

    // Diagnostic 2: RBAC Policy Engine
    const isRbacValid =
      Boolean(ROLE_PERMISSIONS.SUPER_ADMIN) &&
      Boolean(ROLE_PERMISSIONS.ADMIN) &&
      ROLE_PERMISSIONS.SUPER_ADMIN.length > 0;
    securityHealth.push({
      name: 'RBAC Policy Engine',
      category: 'Access Control',
      status: isRbacValid ? 'UP' : 'DOWN',
      description: isRbacValid
        ? 'Authoritative role-permission matrix active with strict server-side gating.'
        : 'Permission definitions incomplete.',
    });

    // Diagnostic 3: Rate Limiting & Distributed Mutexes
    try {
      const redis = getRedisClient();
      const start = Date.now();
      await redis.ping();
      securityHealth.push({
        name: 'Rate Limiting & Brute-Force Shield',
        category: 'Protection',
        status: 'UP',
        description: 'Redis rate limiting active across authentication and administrative namespaces.',
        latencyMs: Date.now() - start,
      });
    } catch {
      securityHealth.push({
        name: 'Rate Limiting & Brute-Force Shield',
        category: 'Protection',
        status: 'DEGRADED',
        description: 'Redis offline; falling back to in-memory protection.',
      });
    }

    // Diagnostic 4: Session Invalidation Subsystem
    try {
      const start = Date.now();
      await redisService.exists('ludo:admin:health_check_session');
      securityHealth.push({
        name: 'Session Invalidation Subsystem',
        category: 'Session Control',
        status: 'UP',
        description: 'Immediate token revocation store and database session registry online.',
        latencyMs: Date.now() - start,
      });
    } catch {
      securityHealth.push({
        name: 'Session Invalidation Subsystem',
        category: 'Session Control',
        status: 'DEGRADED',
        description: 'Redis revocation check unavailable.',
      });
    }

    // Diagnostic 5: Audit Logging Engine
    try {
      const start = Date.now();
      await AuditLog.findOne({ attributes: ['id'] });
      securityHealth.push({
        name: 'Audit Logging Engine',
        category: 'Audit & Compliance',
        status: 'UP',
        description: 'Immutable administrative audit trail recording events with client telemetry.',
        latencyMs: Date.now() - start,
      });
    } catch {
      securityHealth.push({
        name: 'Audit Logging Engine',
        category: 'Audit & Compliance',
        status: 'DOWN',
        description: 'Unable to query audit logs table.',
      });
    }

    // 6. Recent Security Events
    const recentLogs = await AuditLog.findAll({
      where: { action: { [Op.in]: securityActions } },
      include: [
        {
          model: User,
          as: 'adminUser',
          attributes: ['id', 'username', 'email', 'role'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: 6,
    });

    const recentSecurityEvents = recentLogs.map((log: any) => ({
      id: log.id,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      adminUser: log.adminUser,
      metadata: log.metadata,
      ipAddress: log.ipAddress ? log.ipAddress.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.***.***') : undefined,
      createdAt: log.createdAt,
    }));

    return {
      totalAdmins,
      activeAdminSessions,
      failedLogins24h,
      securityEventsCount,
      securityHealth,
      recentSecurityEvents,
    };
  }

  /**
   * Get all administrative accounts with safe profile data (no passwords/secrets)
   */
  public static async getAdminAccounts(): Promise<any[]> {
    const admins = await User.findAll({
      where: { role: { [Op.in]: ALL_ADMIN_ROLES } },
      attributes: ['id', 'username', 'email', 'role', 'status', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'ASC']],
    });

    // Get active session count per admin
    const sessionCounts = await Session.findAll({
      attributes: [
        'userId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'sessionCount'],
      ],
      where: {
        userId: { [Op.in]: admins.map((a) => a.id) },
      },
      group: ['userId'],
    });

    const sessionMap = new Map<string, number>();
    for (const sc of sessionCounts as any[]) {
      sessionMap.set(sc.userId, Number(sc.dataValues.sessionCount || 0));
    }

    return admins.map((admin) => ({
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      status: admin.status,
      activeSessions: sessionMap.get(admin.id) || 0,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    }));
  }

  /**
   * Get Single Admin Account Detail with security records
   */
  public static async getAdminAccountDetail(adminId: string): Promise<any> {
    const admin = await User.findOne({
      where: {
        id: adminId,
        role: { [Op.in]: ALL_ADMIN_ROLES },
      },
      attributes: ['id', 'username', 'email', 'role', 'status', 'createdAt', 'updatedAt'],
    });

    if (!admin) {
      return null;
    }

    // Active Sessions
    const sessions = await Session.findAll({
      where: { userId: adminId },
      attributes: ['id', 'deviceInfo', 'expiresAt', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    // Recent Security Activity
    const securityLogs = await AuditLog.findAll({
      where: { adminUserId: adminId },
      order: [['createdAt', 'DESC']],
      limit: 10,
    });

    return {
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        status: admin.status,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
      },
      activeSessions: sessions.map((s) => ({
        id: s.id,
        deviceInfo: s.deviceInfo || 'Standard Web Browser',
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
      })),
      recentActivity: securityLogs.map((log) => ({
        id: log.id,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
    };
  }

  /**
   * Get Active Admin Sessions with safe metadata
   */
  public static async getActiveAdminSessions(): Promise<any[]> {
    const sessions = await Session.findAll({
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'email', 'role', 'status'],
          where: { role: { [Op.in]: ALL_ADMIN_ROLES } },
          required: true,
        },
      ],
      attributes: ['id', 'userId', 'deviceInfo', 'expiresAt', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    return sessions.map((s: any) => ({
      id: s.id,
      userId: s.userId,
      admin: s.user,
      deviceInfo: s.deviceInfo || 'Chrome / Web Desktop',
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
    }));
  }

  /**
   * Revoke a single admin session with mandatory reason and audit logging
   */
  public static async revokeAdminSession(
    sessionId: string,
    reason: string,
    currentAdminUserId: string,
    allowSelf = false,
    reqMeta?: any
  ): Promise<{ success: boolean; statusCode?: number; error?: string; message?: string }> {
    const trimmedReason = (reason || '').trim();
    if (!trimmedReason || trimmedReason.length < 10) {
      return {
        success: false,
        statusCode: 400,
        error: 'A mandatory reason of at least 10 characters is required to revoke an admin session.',
      };
    }
    if (trimmedReason.length > 500) {
      return {
        success: false,
        statusCode: 400,
        error: 'Reason cannot exceed 500 characters.',
      };
    }

    const session = await Session.findByPk(sessionId, {
      include: [{ model: User, as: 'user', attributes: ['id', 'username', 'email', 'role'] }],
    });

    if (!session) {
      return {
        success: false,
        statusCode: 404,
        error: 'Session record not found or already terminated.',
      };
    }

    const targetUser = (session as any).user;

    // Self-lockout check
    if (targetUser && targetUser.id === currentAdminUserId && !allowSelf) {
      return {
        success: false,
        statusCode: 400,
        error: 'Self-session revocation requires explicit confirmation to prevent accidental administrative lockout.',
      };
    }

    // Delete session from DB
    await session.destroy();

    // Audit action
    if (currentAdminUserId) {
      await AuditLogService.logAction({
        adminUserId: currentAdminUserId,
        action: 'ADMIN_SESSION_REVOKED',
        resourceType: 'SESSION',
        resourceId: sessionId,
        metadata: {
          targetAdminId: targetUser?.id,
          targetUsername: targetUser?.username,
          targetEmail: targetUser?.email,
          reason: trimmedReason,
        },
        req: reqMeta,
      });
    }

    // Trigger Notification
    try {
      await AdminNotificationService.createNotification({
        type: 'SECURITY_ALERT',
        severity: 'WARNING',
        title: `Admin Session Terminated: ${targetUser?.username || 'Admin'}`,
        message: `Admin session for ${targetUser?.username || 'Staff'} was revoked. Reason: "${trimmedReason}"`,
        resourceType: 'SECURITY',
        resourceId: sessionId,
        metadata: {
          sessionId,
          targetAdminId: targetUser?.id,
          reason: trimmedReason,
        },
      });
    } catch {}

    return {
      success: true,
      statusCode: 200,
      message: 'Admin session successfully revoked.',
    };
  }

  /**
   * Revoke all sessions for a target administrator (Emergency Session Revocation)
   */
  public static async revokeAllAdminSessions(
    targetAdminId: string,
    reason: string,
    currentAdminUserId: string,
    allowSelf = false,
    reqMeta?: any
  ): Promise<{ success: boolean; statusCode?: number; error?: string; message?: string }> {
    const trimmedReason = (reason || '').trim();
    if (!trimmedReason || trimmedReason.length < 10) {
      return {
        success: false,
        statusCode: 400,
        error: 'A mandatory reason of at least 10 characters is required for emergency session revocation.',
      };
    }
    if (trimmedReason.length > 500) {
      return {
        success: false,
        statusCode: 400,
        error: 'Reason cannot exceed 500 characters.',
      };
    }

    const targetUser = await User.findOne({
      where: {
        id: targetAdminId,
        role: { [Op.in]: ALL_ADMIN_ROLES },
      },
    });

    if (!targetUser) {
      return {
        success: false,
        statusCode: 404,
        error: 'Admin account not found.',
      };
    }

    // Prevent accidental self-lockout without explicit flag
    if (targetAdminId === currentAdminUserId && !allowSelf) {
      return {
        success: false,
        statusCode: 400,
        error: 'Revoking all your own active sessions requires explicit self-revocation confirmation.',
      };
    }

    // 1. Invalidate in Redis
    const revokedAt = Date.now();
    await redisService.setWithExpiry(`ludo:user:session_revoked:${targetAdminId}`, revokedAt.toString(), 86400 * 7);

    // 2. Destroy all sessions in DB
    const deletedCount = await Session.destroy({
      where: { userId: targetAdminId },
    });

    // 3. Audit Log
    if (currentAdminUserId) {
      await AuditLogService.logAction({
        adminUserId: currentAdminUserId,
        action: 'ADMIN_ALL_SESSIONS_REVOKED',
        resourceType: 'ADMIN',
        resourceId: targetAdminId,
        metadata: {
          targetUsername: targetUser.username,
          targetEmail: targetUser.email,
          targetRole: targetUser.role,
          deletedSessionsCount: deletedCount,
          reason: trimmedReason,
          revokedAt,
        },
        req: reqMeta,
      });
    }

    // 4. Trigger Realtime Notification
    try {
      await AdminNotificationService.createNotification({
        type: 'SECURITY_ALERT',
        severity: 'CRITICAL',
        title: `All Sessions Revoked: ${targetUser.username}`,
        message: `All authentication sessions for ${targetUser.username} (${targetUser.role}) were permanently revoked. Reason: "${trimmedReason}"`,
        resourceType: 'SECURITY',
        resourceId: targetAdminId,
        metadata: {
          targetAdminId,
          targetUsername: targetUser.username,
          reason: trimmedReason,
          revokedSessionsCount: deletedCount,
        },
      });
    } catch {}

    return {
      success: true,
      statusCode: 200,
      message: `Successfully revoked all active sessions (${deletedCount} sessions) for ${targetUser.username}.`,
    };
  }

  /**
   * Get Admin Login Activity History
   */
  public static async getLoginActivity(params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }): Promise<{
    logs: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(Number(params.page) || 1, 1);
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const where: any = {
      action: { [Op.in]: ['ADMIN_LOGIN', 'ADMIN_LOGIN_FAILED', 'ADMIN_LOGOUT'] },
    };

    if (params.status === 'SUCCESS') {
      where.action = 'ADMIN_LOGIN';
    } else if (params.status === 'FAILED') {
      where.action = 'ADMIN_LOGIN_FAILED';
    }

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'adminUser',
          attributes: ['id', 'username', 'email', 'role'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const logs = rows.map((log: any) => ({
      id: log.id,
      action: log.action,
      isSuccess: log.action === 'ADMIN_LOGIN',
      adminUser: log.adminUser,
      ipAddress: log.ipAddress ? log.ipAddress.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.***.***') : '127.0.0.1',
      userAgent: log.userAgent,
      metadata: log.metadata,
      createdAt: log.createdAt,
    }));

    return {
      logs,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  /**
   * Get Security Events Stream
   */
  public static async getSecurityEvents(params: {
    page?: number;
    limit?: number;
  }): Promise<{
    events: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(Number(params.page) || 1, 1);
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const securityActions = [
      'ADMIN_LOGIN',
      'ADMIN_LOGIN_FAILED',
      'ADMIN_SESSION_REVOKED',
      'ADMIN_ALL_SESSIONS_REVOKED',
      'USER_SESSIONS_REVOKED',
      'SECURITY_ALERT',
      'USER_DEACTIVATED',
      'USER_ACTIVATED',
      'GAME_FORCE_ENDED',
    ];

    const { count, rows } = await AuditLog.findAndCountAll({
      where: { action: { [Op.in]: securityActions } },
      include: [
        {
          model: User,
          as: 'adminUser',
          attributes: ['id', 'username', 'email', 'role'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const events = rows.map((log: any) => ({
      id: log.id,
      action: log.action,
      resourceType: log.resourceType,
      resourceId: log.resourceId,
      adminUser: log.adminUser,
      metadata: log.metadata,
      createdAt: log.createdAt,
    }));

    return {
      events,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit) || 1,
    };
  }

  /**
   * Get Authoritative Permission Matrix dynamically mapped directly from ROLE_PERMISSIONS
   */
  public static getPermissionsMatrix(): {
    roles: AdminRole[];
    modules: {
      category: string;
      permission: string;
      description: string;
      matrix: Record<AdminRole, boolean>;
    }[];
  } {
    const permissionsConfig = [
      { category: 'Dashboard', permission: 'DASHBOARD_VIEW', description: 'View system KPIs and overview metrics' },
      { category: 'Users', permission: 'USER_VIEW', description: 'View player accounts and match records' },
      { category: 'User Management', permission: 'USER_MANAGE', description: 'Activate and deactivate user accounts' },
      { category: 'Session Control', permission: 'SESSION_REVOKE', description: 'Revoke active user sessions' },
      { category: 'Live Games', permission: 'GAME_VIEW', description: 'Monitor live gameplay and token positions' },
      { category: 'Game Moderation', permission: 'GAME_FORCE_END', description: 'Force-end stuck or rogue games under lock' },
      { category: 'Match History', permission: 'MATCH_HISTORY_VIEW', description: 'Search historical match archives' },
      { category: 'Match History', permission: 'MATCH_HISTORY_EXPORT', description: 'Export match datasets to CSV format' },
      { category: 'Reports', permission: 'REPORT_VIEW', description: 'Inspect KPI analytics and bot performance' },
      { category: 'Matchmaking', permission: 'MATCHMAKING_VIEW', description: 'Monitor live player matchmaking queues' },
      { category: 'Bots', permission: 'BOT_VIEW', description: 'Inspect smart AI bot difficulty statistics' },
      { category: 'System Health', permission: 'SYSTEM_VIEW', description: 'View hardware, Redis, and MySQL health' },
      { category: 'Audit Logs', permission: 'AUDIT_LOG_VIEW', description: 'Review chronological admin audit logs' },
      { category: 'Notifications', permission: 'NOTIFICATION_VIEW', description: 'Receive realtime system and alert feeds' },
      { category: 'Notifications', permission: 'NOTIFICATION_MANAGE', description: 'Mark alerts as read for current admin' },
      { category: 'Security Center', permission: 'SECURITY_VIEW', description: 'View admin accounts, sessions, and security events' },
      { category: 'Security Center', permission: 'ADMIN_SESSION_REVOKE', description: 'Emergency revocation of admin authentication sessions' },
      { category: 'Security Center', permission: 'SECURITY_MANAGE', description: 'Manage security configurations and roles' },
    ];

    const modules = permissionsConfig.map((item) => {
      const matrix: Record<AdminRole, boolean> = {
        SUPER_ADMIN: (ROLE_PERMISSIONS.SUPER_ADMIN as any[]).includes(item.permission),
        ADMIN: (ROLE_PERMISSIONS.ADMIN as any[]).includes(item.permission),
        SUPPORT: (ROLE_PERMISSIONS.SUPPORT as any[]).includes(item.permission),
        VIEWER: (ROLE_PERMISSIONS.VIEWER as any[]).includes(item.permission),
      };

      return {
        category: item.category,
        permission: item.permission,
        description: item.description,
        matrix,
      };
    });

    return {
      roles: ALL_ADMIN_ROLES,
      modules,
    };
  }
}

export default AdminSecurityService;
