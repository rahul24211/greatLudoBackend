import { Request, Response, NextFunction } from 'express';
import env from '../config/env';

export interface CustomError extends Error {
  statusCode?: number;
  errors?: Record<string, string[]>;
}

export const errorHandler = (
  err: CustomError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  
  // Log detailed error securely to server console
  if (statusCode >= 500) {
    console.error('🚨 Internal Server Error:', err.stack || err.message);
  }

  const isProduction = env.nodeEnv === 'production';
  const clientMessage = isProduction && statusCode >= 500 
    ? 'Internal Server Error' 
    : err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message: clientMessage,
    errors: err.errors || undefined,
    stack: !isProduction ? err.stack : undefined,
  });
};
