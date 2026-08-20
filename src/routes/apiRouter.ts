import { Router } from 'express';
import healthRoutes from './healthRoutes';
import authRoutes from '../modules/auth/authRoutes';
import adminRoutes from '../modules/admin/adminRoutes';
import matchRoutes from '../modules/matches/matchRoutes';
import leaderboardRoutes from '../modules/leaderboard/leaderboardRoutes';

const apiRouter = Router();

apiRouter.use('/', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/matches', matchRoutes);
apiRouter.use('/leaderboard', leaderboardRoutes);

export default apiRouter;
