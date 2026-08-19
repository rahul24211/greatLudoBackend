import { Request } from 'express';
import { AuditLog, User } from '../../models';

export interface LogActionParams {
  adminUserId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, any>;
  req?: Request;
}

export interface GetAuditLogsParams {
  limit?: number;
  offset?: number;
  adminUserId?: string;
  action?: string;
  resourceType?: string;
}

const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'jwtSecret',
  'secret',
  'apiKey',
  'authorization',
  'creditCard',
];

/**
 * Recursively sanitize metadata object to strip out sensitive passwords/tokens.
 */
export function sanitizeAuditMetadata(metadata?: Record<string, any>): Record<string, any> | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeAuditMetadata(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export class AuditLogService {
  /**
   * Record a server-side audit event.
   */
  public static async logAction(params: LogActionParams): Promise<AuditLog | null> {
    try {
      const { adminUserId, action, resourceType, resourceId, metadata, req } = params;

      const ipAddress = req
        ? (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || req.ip
        : undefined;
      const userAgent = req ? (req.headers['user-agent'] as string) : undefined;

      const sanitizedMeta = sanitizeAuditMetadata(metadata);

      return await AuditLog.create({
        adminUserId,
        action,
        resourceType,
        resourceId,
        metadata: sanitizedMeta,
        ipAddress: ipAddress ? String(ipAddress).substring(0, 45) : undefined,
        userAgent: userAgent ? String(userAgent).substring(0, 255) : undefined,
      });
    } catch (err) {
      console.error('⚠️ Failed to write audit log:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Retrieve paginated audit logs for admin review.
   */
  public static async getAuditLogs(params: GetAuditLogsParams) {
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const offset = Math.max(params.offset || 0, 0);

    const where: any = {};
    if (params.adminUserId) where.adminUserId = params.adminUserId;
    if (params.action) where.action = params.action;
    if (params.resourceType) where.resourceType = params.resourceType;

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: User,
          as: 'adminUser',
          attributes: ['id', 'username', 'email', 'role'],
        },
      ],
    });

    return {
      total: count,
      limit,
      offset,
      logs: rows,
    };
  }
}

export default AuditLogService;
