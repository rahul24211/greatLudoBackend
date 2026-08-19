import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../../utils/tokenUtils';
import { User } from '../../models';
import { AdminRole, AdminPermission, hasPermission, isAdminRole } from './AdminPermissions';

export interface AdminUserContext {
  id: string;
  email: string;
  username: string;
  role: AdminRole;
}

export interface AdminAuthenticatedRequest extends Request {
  adminUser?: AdminUserContext;
}

/**
 * Middleware: Verify that the request has a valid JWT and the user has an administrative role.
 */
export const requireAdminAuth = async (
  req: AdminAuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Admin authorization token required',
    });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    if (!decoded || !decoded.id) {
      res.status(401).json({
        success: false,
        message: 'Invalid authorization token',
      });
      return;
    }

    // Lookup user in database to get authoritative role and status
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'username', 'email', 'role', 'status'],
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User account not found',
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
        message: 'Access forbidden: Admin privileges required',
      });
      return;
    }

    req.adminUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role as AdminRole,
    };

    next();
  } catch (error: any) {
    if (error?.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        message: 'Admin session expired. Please log in again.',
      });
      return;
    }

    res.status(403).json({
      success: false,
      message: 'Invalid access token',
    });
  }
};

/**
 * Middleware: Verify that the authenticated admin possesses one of the allowed roles.
 */
export const requireRole = (...allowedRoles: AdminRole[]) => {
  return (req: AdminAuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.adminUser) {
      res.status(401).json({
        success: false,
        message: 'Admin authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.adminUser.role)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Requires one of [${allowedRoles.join(', ')}] role privileges`,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware: Verify that the authenticated admin's role grants a specific fine-grained permission.
 */
export const requirePermission = (permission: AdminPermission) => {
  return (req: AdminAuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.adminUser) {
      res.status(401).json({
        success: false,
        message: 'Admin authentication required',
      });
      return;
    }

    if (!hasPermission(req.adminUser.role, permission)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Missing required '${permission}' permission`,
      });
      return;
    }

    next();
  };
};
