import { Router } from 'express';
import {
  register,
  login,
  logout,
  getMe,
  refresh,
} from './authController';
import { validateBody } from '../../middleware/validationMiddleware';
import { authenticateToken } from '../../middleware/authMiddleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from '../../validators/authValidators';

import { authRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.post('/register', authRateLimiter, validateBody(registerSchema), register);
router.post('/login', authRateLimiter, validateBody(loginSchema), login);
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, getMe);
router.post('/refresh', authRateLimiter, validateBody(refreshTokenSchema), refresh);

export default router;
