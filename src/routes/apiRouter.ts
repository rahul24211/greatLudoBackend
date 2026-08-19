import { Router } from 'express';
import healthRoutes from './healthRoutes';
import authRoutes from '../modules/auth/authRoutes';
import adminRoutes from '../modules/admin/adminRoutes';

const apiRouter = Router();

apiRouter.use('/', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/admin', adminRoutes);

export default apiRouter;
