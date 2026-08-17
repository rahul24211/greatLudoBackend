import jwt from 'jsonwebtoken';
import env from '../config/env';

export interface TokenPayload {
  id: string;
  email: string;
  username: string;
}

export const generateAccessToken = (user: { id: string; email: string; username: string }): string => {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    env.jwtSecret,
    { expiresIn: '1d' }
  );
};

export const generateRefreshToken = (user: { id: string; email: string; username: string }): string => {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    env.jwtRefreshSecret,
    { expiresIn: '7d' }
  );
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.jwtRefreshSecret) as TokenPayload;
};

export const sanitizeUser = (user: any): any => {
  const json = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete json.passwordHash;
  return json;
};
