import { Op } from 'sequelize';
import { Server } from 'socket.io';
import { AdminNotification, AdminNotificationRead } from '../../models';
import {
  AdminNotificationSeverity,
  AdminNotificationType,
} from '../../models/AdminNotification';
import { redisService } from '../../services/redis/redisService';
import { sanitizeAuditMetadata } from './AuditLogService';

export interface CreateAdminNotificationParams {
  type: AdminNotificationType;
  severity: AdminNotificationSeverity;
  title: string;
  message: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, any> | null;
  io?: Server | null;
  throttleSeconds?: number;
  dedupKey?: string;
}

export interface GetAdminNotificationsParams {
  adminUserId: string;
  page?: number;
  limit?: number;
  status?: 'all' | 'unread' | 'read';
  severity?: AdminNotificationSeverity;
  type?: string;
  category?: 'ALL' | 'SYSTEM' | 'SECURITY' | 'GAMES' | 'USERS';
  search?: string;
}

const CATEGORY_TYPE_MAP: Record<string, string[]> = {
  SYSTEM: [
    'SYSTEM_HEALTH_CHANGED',
    'REDIS_DOWN',
    'REDIS_RECOVERED',
    'MYSQL_DOWN',
    'MYSQL_RECOVERED',
    'SOCKET_DOWN',
    'SOCKET_RECOVERED',
    'HIGH_ERROR_RATE',
    'MATCHMAKING_QUEUE_HIGH',
  ],
  SECURITY: ['SECURITY_ALERT', 'SESSION_REVOKED'],
  GAMES: ['GAME_FORCE_ENDED'],
  USERS: ['USER_DEACTIVATED', 'USER_ACTIVATED', 'SESSION_REVOKED'],
};

export class AdminNotificationService {
  /**
   * Create and broadcast an administrative notification with deduplication & throttling.
   */
  public static async createNotification(
    params: CreateAdminNotificationParams
  ): Promise<{ created: boolean; notification?: AdminNotification; throttled?: boolean }> {
    const {
      type,
      severity,
      title,
      message,
      resourceType = null,
      resourceId = null,
      metadata = null,
      io = null,
      throttleSeconds = 0,
      dedupKey,
    } = params;

    // 1. Check throttling / deduplication via Redis if specified
    if (throttleSeconds > 0) {
      const key = `ludo:admin:alert_throttle:${dedupKey || type}`;
      try {
        const isThrottled = await redisService.exists(key);
        if (isThrottled) {
          return { created: false, throttled: true };
        }
        await redisService.setWithExpiry(key, '1', throttleSeconds);
      } catch (err) {
        // Fallback to creation if Redis unavailable
      }
    }

    // 2. Sanitize metadata to never store secrets or credentials
    const safeMetadata = sanitizeAuditMetadata(metadata || undefined);

    // 3. Persist notification to MySQL
    const notification = await AdminNotification.create({
      type,
      severity,
      title,
      message,
      resourceType,
      resourceId,
      metadata: safeMetadata || null,
    });

    // 4. Broadcast realtime event to authorized admin sockets
    if (io) {
      const safePayload = {
        id: notification.id,
        type: notification.type,
        severity: notification.severity,
        title: notification.title,
        message: notification.message,
        resourceType: notification.resourceType,
        resourceId: notification.resourceId,
        metadata: notification.metadata,
        createdAt: notification.createdAt,
      };

      io.to('admin:notifications').emit('admin:notification', safePayload);
    }

    return { created: true, notification };
  }

  /**
   * Track system infrastructure health status transitions (e.g. UP -> DOWN, DOWN -> UP).
   * Only triggers an alert when the status actually transitions.
   */
  public static async recordSystemHealthTransition(
    service: 'REDIS' | 'MYSQL' | 'SOCKET' | 'API',
    newStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN',
    details?: { message?: string; io?: Server }
  ): Promise<void> {
    const stateKey = `ludo:admin:sys_health_state:${service}`;
    let prevStatus = 'HEALTHY';

    try {
      const stored = await redisService.get(stateKey);
      if (stored) prevStatus = stored;
    } catch {}

    if (prevStatus === newStatus) {
      return; // No state transition, do not spam alerts
    }

    // Transition detected
    try {
      await redisService.set(stateKey, newStatus);
    } catch {}

    let type: AdminNotificationType = 'SYSTEM_HEALTH_CHANGED';
    let severity: AdminNotificationSeverity = 'WARNING';
    let title = `${service} Status Transition`;
    let message = details?.message || `${service} status transitioned from ${prevStatus} to ${newStatus}.`;

    if (newStatus === 'DOWN') {
      severity = 'CRITICAL';
      if (service === 'REDIS') {
        type = 'REDIS_DOWN';
        title = 'Redis Infrastructure Down';
      } else if (service === 'MYSQL') {
        type = 'MYSQL_DOWN';
        title = 'MySQL Database Down';
      } else if (service === 'SOCKET') {
        type = 'SOCKET_DOWN';
        title = 'Socket.IO Service Degraded/Down';
      }
    } else if (newStatus === 'HEALTHY' && prevStatus === 'DOWN') {
      severity = 'INFO';
      if (service === 'REDIS') {
        type = 'REDIS_RECOVERED';
        title = 'Redis Infrastructure Restored';
      } else if (service === 'MYSQL') {
        type = 'MYSQL_RECOVERED';
        title = 'MySQL Database Restored';
      } else if (service === 'SOCKET') {
        type = 'SOCKET_RECOVERED';
        title = 'Socket.IO Service Restored';
      }
    }

    await this.createNotification({
      type,
      severity,
      title,
      message,
      resourceType: 'SYSTEM',
      resourceId: service,
      io: details?.io || null,
      throttleSeconds: 15,
      dedupKey: `${type}_${service}`,
    });
  }

  /**
   * Get unread notifications count for a specific administrator.
   */
  public static async getUnreadCount(adminUserId: string): Promise<number> {
    if (!adminUserId) return 0;

    const totalCount = await AdminNotification.count();
    const readCount = await AdminNotificationRead.count({
      where: { adminUserId },
    });

    return Math.max(0, totalCount - readCount);
  }

  /**
   * Get paginated notifications list with filter support and per-admin read state.
   */
  public static async getNotifications(params: GetAdminNotificationsParams): Promise<{
    notifications: any[];
    total: number;
    unreadCount: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      adminUserId,
      page = 1,
      limit = 20,
      status = 'all',
      severity,
      type,
      category = 'ALL',
      search,
    } = params;

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const offset = (safePage - 1) * safeLimit;

    // Get all notification IDs that this admin has read
    const readRecords = await AdminNotificationRead.findAll({
      where: { adminUserId },
      attributes: ['notificationId'],
    });
    const readIds = new Set(readRecords.map((r) => r.notificationId));

    const where: any = {};

    if (severity) {
      where.severity = severity;
    }

    if (type) {
      where.type = type;
    }

    if (category && category !== 'ALL' && CATEGORY_TYPE_MAP[category]) {
      where.type = { [Op.in]: CATEGORY_TYPE_MAP[category] };
    }

    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      where[Op.or] = [
        { title: { [Op.like]: term } },
        { message: { [Op.like]: term } },
        { resourceId: { [Op.like]: term } },
      ];
    }

    if (status === 'read') {
      where.id = { [Op.in]: Array.from(readIds) };
    } else if (status === 'unread') {
      if (readIds.size > 0) {
        where.id = { [Op.notIn]: Array.from(readIds) };
      }
    }

    const { count, rows } = await AdminNotification.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: safeLimit,
      offset,
    });

    const notifications = rows.map((n) => ({
      id: n.id,
      type: n.type,
      severity: n.severity,
      title: n.title,
      message: n.message,
      resourceType: n.resourceType,
      resourceId: n.resourceId,
      metadata: n.metadata,
      isRead: readIds.has(n.id),
      createdAt: n.createdAt,
    }));

    const unreadCount = await this.getUnreadCount(adminUserId);

    return {
      notifications,
      total: count,
      unreadCount,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(count / safeLimit) || 1,
    };
  }

  /**
   * Mark a single notification as read for the current admin.
   */
  public static async markAsRead(
    notificationId: string,
    adminUserId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!notificationId || !adminUserId) {
      return { success: false, error: 'Notification ID and Admin User ID are required.' };
    }

    const notification = await AdminNotification.findByPk(notificationId);
    if (!notification) {
      return { success: false, error: 'Notification not found.' };
    }

    await AdminNotificationRead.findOrCreate({
      where: { notificationId, adminUserId },
      defaults: {
        notificationId,
        adminUserId,
        readAt: new Date(),
      },
    });

    return { success: true };
  }

  /**
   * Mark all notifications as read for the current admin.
   */
  public static async markAllAsRead(adminUserId: string): Promise<{ success: boolean; count: number }> {
    if (!adminUserId) {
      return { success: false, count: 0 };
    }

    const allNotifications = await AdminNotification.findAll({
      attributes: ['id'],
    });

    const readRecords = await AdminNotificationRead.findAll({
      where: { adminUserId },
      attributes: ['notificationId'],
    });
    const readIds = new Set(readRecords.map((r) => r.notificationId));

    const unreadIds = allNotifications.map((n) => n.id).filter((id) => !readIds.has(id));

    if (unreadIds.length > 0) {
      const recordsToCreate = unreadIds.map((notificationId) => ({
        notificationId,
        adminUserId,
        readAt: new Date(),
      }));

      await AdminNotificationRead.bulkCreate(recordsToCreate, {
        ignoreDuplicates: true,
      });
    }

    return { success: true, count: unreadIds.length };
  }

  /**
   * Retention Policy Cleanup: Delete notifications older than specified retention days.
   */
  public static async cleanupOldNotifications(retentionDays = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const deletedCount = await AdminNotification.destroy({
      where: {
        createdAt: {
          [Op.lt]: cutoffDate,
        },
      },
    });

    return deletedCount;
  }
}

export default AdminNotificationService;
