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

const router = Router();

router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, getMe);
router.post('/refresh', validateBody(refreshTokenSchema), refresh);

export default router;
