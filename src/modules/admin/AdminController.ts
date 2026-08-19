import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { User, Profile } from '../../models';
import { generateAccessToken, generateRefreshToken } from '../../utils/tokenUtils';
import { AdminAuthenticatedRequest } from './adminAuthMiddleware';
import { AdminService } from './AdminService';
import { AdminGameModerationService } from './AdminGameModerationService';
import { AdminNotificationService } from './AdminNotificationService';
import { AdminSecurityService } from './AdminSecurityService';
import { AuditLogService } from './AuditLogService';
import { ROLE_PERMISSIONS, AdminRole, isAdminRole } from './AdminPermissions';

export class AdminController {
  /**
   * Admin Login
   */
  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
        return;
      }

      const user = await User.findOne({
        where: { email },
        include: [{ model: Profile, as: 'profile' }],
      });

      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Invalid administrative credentials',
        });
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({
          success: false,
          message: 'Invalid administrative credentials',
        });
        return;
      }

      if (user.status !== 'ACTIVE') {
        res.status(403).json({
          success: false,
          message: `Admin account is ${user.status.toLowerCase()}`,
        });
        return;
      }

      if (!isAdminRole(user.role)) {
        res.status(403).json({
          success: false,
          message: 'Access denied: User is not authorized for Admin Panel access',
        });
        return;
      }

      const token = generateAccessToken({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      });

      const refreshToken = generateRefreshToken({
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      });

      // Audit Admin Login Event
      await AuditLogService.logAction({
        adminUserId: user.id,
        action: 'ADMIN_LOGIN',
        resourceType: 'AUTH',
        resourceId: user.id,
        metadata: { role: user.role },
        req,
      });

      res.status(200).json({
        success: true,
        message: 'Admin authentication successful',
        data: {
          adminUser: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            permissions: ROLE_PERMISSIONS[user.role as AdminRole] || [],
          },
          token,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Admin Logout
   */
  public static async logout(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'ADMIN_LOGOUT',
          resourceType: 'AUTH',
          resourceId: req.adminUser.id,
          req,
        });
      }

      res.status(200).json({
        success: true,
        message: 'Admin logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Current Admin Profile & Permissions
   */
  public static async getMe(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.adminUser) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }

      const permissions = ROLE_PERMISSIONS[req.adminUser.role] || [];

      res.status(200).json({
        success: true,
        data: {
          adminUser: {
            ...req.adminUser,
            permissions,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Dashboard Metrics
   */
  public static async getDashboard(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminService.getDashboardMetrics();

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'DASHBOARD_ACCESS',
          resourceType: 'DASHBOARD',
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * User Management List
   */
  public static async getUsers(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { search, status, role, page, limit } = req.query;

      const data = await AdminService.getUsers({
        search: search ? String(search) : undefined,
        status: status ? String(status) : undefined,
        role: role ? String(role) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10,
      });

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'USER_LIST_ACCESS',
          resourceType: 'USER',
          metadata: { filter: { search, status, role, page, limit } },
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * User Detail by ID
   */
  public static async getUserById(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = String(req.params.id);

      const data = await AdminService.getUserById(id);

      if (!data) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'USER_DETAIL_ACCESS',
          resourceType: 'USER',
          resourceId: id,
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * User Match History by User ID
   */
  public static async getUserMatches(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = String(req.params.id);
      const { page, limit } = req.query;

      const data = await AdminService.getUserMatches(id, {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10,
      });

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'USER_MATCH_HISTORY_ACCESS',
          resourceType: 'USER',
          resourceId: id,
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Games List
   */
  public static async getGames(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { status, gameMode, gameType, search, page, limit } = req.query;

      const data = await AdminService.getGames({
        search: search ? String(search) : undefined,
        status: status ? String(status) : undefined,
        gameMode: gameMode ? String(gameMode) : undefined,
        gameType: gameType ? String(gameType) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'GAME_LIST_ACCESS',
          resourceType: 'GAME',
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Game Detail by ID
   */
  public static async getGameById(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = String(req.params.id);

      const data = await AdminService.getGameById(id);

      if (!data) {
        res.status(404).json({
          success: false,
          message: 'Game session not found',
        });
        return;
      }

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'GAME_DETAIL_ACCESS',
          resourceType: 'GAME',
          resourceId: id,
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Match History
   */
  public static async getMatches(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        search,
        gameMode,
        winnerId,
        userId,
        matchType,
        status,
        datePreset,
        startDate,
        endDate,
        page,
        limit,
      } = req.query;

      const data = await AdminService.getMatches({
        search: search ? String(search) : undefined,
        gameMode: gameMode ? String(gameMode) : undefined,
        winnerId: winnerId ? String(winnerId) : undefined,
        userId: userId ? String(userId) : undefined,
        matchType: matchType ? String(matchType) : undefined,
        status: status ? String(status) : undefined,
        datePreset: datePreset ? String(datePreset) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'MATCH_HISTORY_ACCESS',
          resourceType: 'MATCH',
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Match Details by Match ID
   */
  public static async getMatchById(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = String(req.params.id);

      const data = await AdminService.getMatchById(id);

      if (!data) {
        res.status(404).json({
          success: false,
          message: 'Match not found',
        });
        return;
      }

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'MATCH_DETAIL_ACCESS',
          resourceType: 'MATCH',
          resourceId: id,
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export Matches as CSV
   */
  public static async exportMatchesCsv(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        search,
        gameMode,
        winnerId,
        userId,
        matchType,
        status,
        datePreset,
        startDate,
        endDate,
      } = req.query;

      const filter = {
        search: search ? String(search) : undefined,
        gameMode: gameMode ? String(gameMode) : undefined,
        winnerId: winnerId ? String(winnerId) : undefined,
        userId: userId ? String(userId) : undefined,
        matchType: matchType ? String(matchType) : undefined,
        status: status ? String(status) : undefined,
        datePreset: datePreset ? String(datePreset) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
      };

      const csvData = await AdminService.exportMatchesCsv(filter);

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'MATCH_HISTORY_EXPORT',
          resourceType: 'MATCH',
          metadata: { filter },
          req,
        });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="ludo_matches_export_${Date.now()}.csv"`);
      res.status(200).send(csvData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reports: Overview
   */
  public static async getReportsOverview(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminService.getReportsOverview();

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'REPORT_OVERVIEW_ACCESS',
          resourceType: 'REPORT',
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reports: Game Modes Breakdown
   */
  public static async getReportsGameModes(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminService.getReportsGameModes();

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'REPORT_GAME_MODES_ACCESS',
          resourceType: 'REPORT',
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reports: Bot Analytics
   */
  public static async getReportsBots(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminService.getReportsBots();

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'REPORT_BOTS_ACCESS',
          resourceType: 'REPORT',
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reports: Winners Leaderboard
   */
  public static async getReportsWinners(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminService.getReportsWinners();

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'REPORT_WINNERS_ACCESS',
          resourceType: 'REPORT',
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Matchmaking Monitor (Live Queue)
   */
  public static async getMatchmaking(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminService.getMatchmakingStats();

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'MATCHMAKING_MONITOR_ACCESS',
          resourceType: 'MATCHMAKING',
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Matchmaking Performance Statistics
   */
  public static async getMatchmakingStats(
    _req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminService.getMatchmakingPerformanceStats();

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bot Monitor
   */
  public static async getBots(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminService.getBotStats();

      if (req.adminUser) {
        await AuditLogService.logAction({
          adminUserId: req.adminUser.id,
          action: 'BOT_MONITOR_ACCESS',
          resourceType: 'BOT',
          req,
        });
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bot Stats
   */
  public static async getBotPerformanceStats(
    _req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminService.getBotStats();

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * System Health
   */
  public static async getSystemHealth(
    _req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminService.getSystemHealth();

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Audit Logs
   */
  public static async getAuditLogs(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { page, limit, adminUserId, action, resourceType } = req.query;

      const p = Math.max(Number(page) || 1, 1);
      const l = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const offset = (p - 1) * l;

      const data = await AuditLogService.getAuditLogs({
        limit: l,
        offset,
        adminUserId: adminUserId ? String(adminUserId) : undefined,
        action: action ? String(action) : undefined,
        resourceType: resourceType ? String(resourceType) : undefined,
      });

      res.status(200).json({
        success: true,
        data: {
          page: p,
          totalPages: Math.ceil(data.total / l),
          ...data,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * User Action: Update User Status (ACTIVE / INACTIVE)
   */
  public static async updateUserStatus(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = String(req.params.id);
      const { status, reason } = req.body;

      if (!status || !reason) {
        res.status(400).json({
          success: false,
          message: 'Both status (ACTIVE/INACTIVE) and a mandatory reason are required.',
        });
        return;
      }

      const result = await AdminService.updateUserStatus(
        id,
        status,
        reason,
        req.adminUser?.id || '',
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

      if (!result.success) {
        res.status(result.statusCode || 400).json({
          success: false,
          message: result.error || 'Failed to update user status.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `User status has been successfully updated to ${status}.`,
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * User Action: Revoke Active Sessions
   */
  public static async revokeUserSessions(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = String(req.params.id);
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({
          success: false,
          message: 'A mandatory reason is required to revoke user sessions.',
        });
        return;
      }

      const result = await AdminService.revokeUserSessions(
        id,
        reason,
        req.adminUser?.id || '',
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

      if (!result.success) {
        res.status(result.statusCode || 400).json({
          success: false,
          message: result.error || 'Failed to revoke user sessions.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message || 'User sessions have been successfully revoked.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Game Moderation: Force-End Active Game
   */
  public static async forceEndGame(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const gameId = String(req.params.gameId);
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({
          success: false,
          message: 'A mandatory reason of at least 10 characters is required to force-end a game.',
        });
        return;
      }

      const io = req.app.get('io');

      const result = await AdminGameModerationService.forceEndGame(
        gameId,
        req.adminUser?.id || '',
        reason,
        io,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

      if (!result.success) {
        res.status(result.statusCode || 400).json({
          success: false,
          message: result.error || 'Failed to force-end game session.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message || 'Game session has been permanently ended by administrator.',
        data: {
          gameState: result.gameState,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Notifications: List Paginated Notifications
   */
  public static async getNotifications(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const adminUserId = req.adminUser?.id || '';
      const { page, limit, status, severity, type, category, search } = req.query;

      const result = await AdminNotificationService.getNotifications({
        adminUserId,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status: status as any,
        severity: severity as any,
        type: type ? String(type) : undefined,
        category: category as any,
        search: search ? String(search) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Notifications: Get Unread Count for Current Admin
   */
  public static async getUnreadNotificationCount(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const adminUserId = req.adminUser?.id || '';
      const unreadCount = await AdminNotificationService.getUnreadCount(adminUserId);

      res.status(200).json({
        success: true,
        data: {
          unreadCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Notifications: Mark Single Notification as Read
   */
  public static async markNotificationRead(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const adminUserId = req.adminUser?.id || '';
      const notificationId = String(req.params.id);

      const result = await AdminNotificationService.markAsRead(notificationId, adminUserId);

      if (!result.success) {
        res.status(400).json({
          success: false,
          message: result.error || 'Failed to mark notification as read.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Notification marked as read.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Notifications: Mark All Notifications as Read for Current Admin
   */
  public static async markAllNotificationsRead(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const adminUserId = req.adminUser?.id || '';
      const result = await AdminNotificationService.markAllAsRead(adminUserId);

      res.status(200).json({
        success: true,
        message: 'All notifications marked as read.',
        data: {
          markedCount: result.count,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Notifications: Purge Expired Notifications
   */
  public static async cleanupOldNotifications(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { retentionDays } = req.body;
      const days = retentionDays ? Number(retentionDays) : 90;
      const deletedCount = await AdminNotificationService.cleanupOldNotifications(days);

      res.status(200).json({
        success: true,
        message: `Purged ${deletedCount} notifications older than ${days} days.`,
        data: {
          deletedCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /* ====================================================================
   * STEP 25: ADMIN SECURITY CENTER ENDPOINTS
   * ==================================================================== */

  /**
   * Security: Overview & Health Diagnostics
   */
  public static async getSecurityOverview(
    _req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await AdminSecurityService.getSecurityOverview();
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Security: List Admin Accounts
   */
  public static async getAdminAccounts(
    _req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const admins = await AdminSecurityService.getAdminAccounts();
      res.status(200).json({
        success: true,
        data: {
          admins,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Security: Get Single Admin Account Detail
   */
  public static async getAdminAccountDetail(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = String(req.params.id);
      const data = await AdminSecurityService.getAdminAccountDetail(id);

      if (!data) {
        res.status(404).json({
          success: false,
          message: 'Admin account not found.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Security: List Active Admin Sessions
   */
  public static async getActiveAdminSessions(
    _req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sessions = await AdminSecurityService.getActiveAdminSessions();
      res.status(200).json({
        success: true,
        data: {
          sessions,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Security: Revoke a single admin session
   */
  public static async revokeAdminSession(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = String(req.params.id);
      const { reason, allowSelf } = req.body;

      if (!reason) {
        res.status(400).json({
          success: false,
          message: 'A mandatory reason of at least 10 characters is required.',
        });
        return;
      }

      const result = await AdminSecurityService.revokeAdminSession(
        id,
        reason,
        req.adminUser?.id || '',
        Boolean(allowSelf),
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

      if (!result.success) {
        res.status(result.statusCode || 400).json({
          success: false,
          message: result.error || 'Failed to revoke session.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message || 'Admin session successfully revoked.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Security: Revoke all sessions for a target administrator (Emergency Revocation)
   */
  public static async revokeAllAdminSessions(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = String(req.params.id);
      const { reason, allowSelf } = req.body;

      if (!reason) {
        res.status(400).json({
          success: false,
          message: 'A mandatory reason of at least 10 characters is required.',
        });
        return;
      }

      const result = await AdminSecurityService.revokeAllAdminSessions(
        id,
        reason,
        req.adminUser?.id || '',
        Boolean(allowSelf),
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        }
      );

      if (!result.success) {
        res.status(result.statusCode || 400).json({
          success: false,
          message: result.error || 'Failed to revoke all sessions.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message || 'All sessions for this administrator have been revoked.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Security: Get Admin Login Activity History
   */
  public static async getLoginActivity(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { page, limit, status, search } = req.query;
      const data = await AdminSecurityService.getLoginActivity({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status: status ? String(status) : undefined,
        search: search ? String(search) : undefined,
      });

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Security: Get Security Events Stream
   */
  public static async getSecurityEvents(
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { page, limit } = req.query;
      const data = await AdminSecurityService.getSecurityEvents({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Security: Get Live Authoritative Permissions Matrix
   */
  public static async getPermissionsMatrix(
    _req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = AdminSecurityService.getPermissionsMatrix();
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default AdminController;
