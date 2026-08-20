import { Router } from 'express';
import { getGlobalLeaderboard } from './leaderboardController';

const router = Router();

// GET /api/leaderboard
router.get('/', getGlobalLeaderboard);

export default router;
