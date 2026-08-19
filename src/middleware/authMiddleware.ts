import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/tokenUtils';
import { redisService } from '../services/redis/redisService';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Access token required',
    });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);

    // Check if user session has been revoked by admin
    if (decoded && decoded.id) {
      try {
        const revokedTimestampStr = await redisService.get(`ludo:user:session_revoked:${decoded.id}`);
        if (revokedTimestampStr) {
          const revokedAt = parseInt(revokedTimestampStr, 10);
          const tokenIat = (decoded as any).iat ? (decoded as any).iat * 1000 : 0;
          if (tokenIat <= revokedAt) {
            res.status(401).json({
              success: false,
              message: 'Session has been revoked. Please log in again.',
            });
            return;
          }
        }
      } catch (redisErr) {
        // Fallback gracefully on Redis error
      }
    }

    req.user = decoded;
    next();
  } catch (error: any) {
    if (error?.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        message: 'Token has expired',
      });
      return;
    }

    res.status(403).json({
      success: false,
      message: 'Invalid access token',
    });
  }
};

