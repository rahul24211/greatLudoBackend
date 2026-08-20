import { Router } from 'express';
import { getMyMatchHistory } from './matchController';
import { optionalAuthenticateToken } from '../../middleware/authMiddleware';

const router = Router();

// GET /api/matches/my-history
router.get('/my-history', optionalAuthenticateToken, getMyMatchHistory);

export default router;
