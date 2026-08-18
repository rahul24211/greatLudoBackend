import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import env from './config/env';
import apiRouter from './routes/apiRouter';
import { globalRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

export const isOriginAllowed = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void => {
  const allowed = [
    env.clientUrl,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];

  if (
    !origin ||
    allowed.includes(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
  ) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
};

export const createApp = (): Express => {
  const app: Express = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws:', 'wss:', env.clientUrl],
        },
      },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'same-origin' },
    })
  );

  app.use(
    cors({
      origin: isOriginAllowed,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  app.use(globalRateLimiter);

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  app.use('/api', apiRouter);

  app.use(errorHandler);

  return app;
};

export default createApp;
