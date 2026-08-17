import { Router } from 'express';
import healthRoutes from './healthRoutes';
import authRoutes from '../modules/auth/authRoutes';

const apiRouter = Router();

apiRouter.use('/', healthRoutes);
apiRouter.use('/auth', authRoutes);

export default apiRouter;
