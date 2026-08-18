import { Request, Response } from 'express';
import sequelize from '../config/database';
import { checkRedisHealth } from '../config/redis';

export const getHealth = async (_req: Request, res: Response): Promise<void> => {
  let dbStatus = 'ok';
  try {
    await sequelize.authenticate();
  } catch {
    dbStatus = 'down';
  }

  const isRedisOk = await checkRedisHealth();
  const redisStatus = isRedisOk ? 'ok' : 'down';

  res.status(200).json({
    success: true,
    services: {
      api: 'ok',
      database: dbStatus,
      redis: redisStatus,
    },
  });
};
