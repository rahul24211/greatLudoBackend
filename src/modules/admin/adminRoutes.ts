import { Router } from 'express';
import { AdminController } from './AdminController';
import { requireAdminAuth, requirePermission } from './adminAuthMiddleware';
import { authRateLimiter } from '../../middleware/rateLimiter';

const adminRouter = Router();

// 1. Admin Authentication Routes
adminRouter.post('/auth/login', authRateLimiter, AdminController.login);
adminRouter.post('/auth/logout', requireAdminAuth, AdminController.logout);
adminRouter.get('/auth/me', requireAdminAuth, AdminController.getMe);

// 2. Dashboard
adminRouter.get(
  '/dashboard',
  requireAdminAuth,
  requirePermission('DASHBOARD_VIEW'),
  AdminController.getDashboard
);

// 3. User Management (Read-Only)
adminRouter.get(
  '/users',
  requireAdminAuth,
  requirePermission('USER_VIEW'),
  AdminController.getUsers
);
adminRouter.get(
  '/users/:id',
  requireAdminAuth,
  requirePermission('USER_VIEW'),
  AdminController.getUserById
);
adminRouter.get(
  '/users/:id/matches',
  requireAdminAuth,
  requirePermission('USER_VIEW'),
  AdminController.getUserMatches
);
adminRouter.patch(
  '/users/:id/status',
  requireAdminAuth,
  requirePermission('USER_MANAGE'),
  AdminController.updateUserStatus
);
adminRouter.post(
  '/users/:id/revoke-sessions',
  requireAdminAuth,
  requirePermission('SESSION_REVOKE'),
  AdminController.revokeUserSessions
);

// 4. Game Management & Moderation
adminRouter.get(
  '/games',
  requireAdminAuth,
  requirePermission('GAME_VIEW'),
  AdminController.getGames
);
adminRouter.get(
  '/games/:id',
  requireAdminAuth,
  requirePermission('GAME_VIEW'),
  AdminController.getGameById
);
adminRouter.post(
  '/games/:gameId/force-end',
  requireAdminAuth,
  requirePermission('GAME_FORCE_END'),
  AdminController.forceEndGame
);

// 5. Match History & Reports
adminRouter.get(
  '/matches/export/csv',
  requireAdminAuth,
  requirePermission('MATCH_HISTORY_EXPORT'),
  AdminController.exportMatchesCsv
);
adminRouter.get(
  '/matches',
  requireAdminAuth,
  requirePermission('MATCH_HISTORY_VIEW'),
  AdminController.getMatches
);
adminRouter.get(
  '/matches/:id',
  requireAdminAuth,
  requirePermission('MATCH_HISTORY_VIEW'),
  AdminController.getMatchById
);

// Reports
adminRouter.get(
  '/reports/overview',
  requireAdminAuth,
  requirePermission('REPORT_VIEW'),
  AdminController.getReportsOverview
);
adminRouter.get(
  '/reports/game-modes',
  requireAdminAuth,
  requirePermission('REPORT_VIEW'),
  AdminController.getReportsGameModes
);
adminRouter.get(
  '/reports/bots',
  requireAdminAuth,
  requirePermission('REPORT_VIEW'),
  AdminController.getReportsBots
);
adminRouter.get(
  '/reports/winners',
  requireAdminAuth,
  requirePermission('REPORT_VIEW'),
  AdminController.getReportsWinners
);

// 6. Matchmaking Monitoring
adminRouter.get(
  '/matchmaking',
  requireAdminAuth,
  requirePermission('MATCHMAKING_VIEW'),
  AdminController.getMatchmaking
);
adminRouter.get(
  '/matchmaking/stats',
  requireAdminAuth,
  requirePermission('MATCHMAKING_VIEW'),
  AdminController.getMatchmakingStats
);

// 7. Bot Monitoring
adminRouter.get(
  '/bots',
  requireAdminAuth,
  requirePermission('BOT_VIEW'),
  AdminController.getBots
);
adminRouter.get(
  '/bots/stats',
  requireAdminAuth,
  requirePermission('BOT_VIEW'),
  AdminController.getBotPerformanceStats
);

// 8. System Health
adminRouter.get(
  '/system/health',
  requireAdminAuth,
  requirePermission('SYSTEM_VIEW'),
  AdminController.getSystemHealth
);

// 9. Audit Logs
adminRouter.get(
  '/audit-logs',
  requireAdminAuth,
  requirePermission('AUDIT_LOG_VIEW'),
  AdminController.getAuditLogs
);

// 10. Admin Notifications & System Alerts
adminRouter.get(
  '/notifications',
  requireAdminAuth,
  requirePermission('NOTIFICATION_VIEW'),
  AdminController.getNotifications
);
adminRouter.get(
  '/notifications/unread-count',
  requireAdminAuth,
  requirePermission('NOTIFICATION_VIEW'),
  AdminController.getUnreadNotificationCount
);
adminRouter.patch(
  '/notifications/:id/read',
  requireAdminAuth,
  requirePermission('NOTIFICATION_MANAGE'),
  AdminController.markNotificationRead
);
adminRouter.post(
  '/notifications/read-all',
  requireAdminAuth,
  requirePermission('NOTIFICATION_MANAGE'),
  AdminController.markAllNotificationsRead
);
adminRouter.post(
  '/notifications/retention',
  requireAdminAuth,
  requirePermission('SYSTEM_VIEW'),
  AdminController.cleanupOldNotifications
);

// 11. Admin Security Center
adminRouter.get(
  '/security/overview',
  requireAdminAuth,
  requirePermission('SECURITY_VIEW'),
  AdminController.getSecurityOverview
);
adminRouter.get(
  '/security/admins',
  requireAdminAuth,
  requirePermission('SECURITY_VIEW'),
  AdminController.getAdminAccounts
);
adminRouter.get(
  '/security/admins/:id',
  requireAdminAuth,
  requirePermission('SECURITY_VIEW'),
  AdminController.getAdminAccountDetail
);
adminRouter.get(
  '/security/sessions',
  requireAdminAuth,
  requirePermission('SECURITY_VIEW'),
  AdminController.getActiveAdminSessions
);
adminRouter.post(
  '/security/sessions/:id/revoke',
  requireAdminAuth,
  requirePermission('ADMIN_SESSION_REVOKE'),
  AdminController.revokeAdminSession
);
adminRouter.post(
  '/security/admins/:id/revoke-all-sessions',
  requireAdminAuth,
  requirePermission('ADMIN_SESSION_REVOKE'),
  AdminController.revokeAllAdminSessions
);
adminRouter.get(
  '/security/login-activity',
  requireAdminAuth,
  requirePermission('SECURITY_VIEW'),
  AdminController.getLoginActivity
);
adminRouter.get(
  '/security/events',
  requireAdminAuth,
  requirePermission('SECURITY_VIEW'),
  AdminController.getSecurityEvents
);
adminRouter.get(
  '/security/permissions-matrix',
  requireAdminAuth,
  requirePermission('SECURITY_VIEW'),
  AdminController.getPermissionsMatrix
);

export default adminRouter;
