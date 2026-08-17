import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { User, Profile, Session } from '../../models';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  sanitizeUser,
} from '../../utils/tokenUtils';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { RegisterInput, LoginInput, RefreshTokenInput } from '../../validators/authValidators';

export const register = async (
  req: Request<{}, {}, RegisterInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { username, email, password } = req.body;

    // Check duplicate username
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      res.status(409).json({
        success: false,
        message: 'Username is already taken',
      });
      return;
    }

    // Check duplicate email
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) {
      res.status(409).json({
        success: false,
        message: 'Email is already registered',
      });
      return;
    }

    // Hash password using bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Create User in MySQL
    const user = await User.create({
      username,
      email,
      passwordHash,
      coins: 1000,
      xp: 0,
      level: 1,
      status: 'ACTIVE',
    });

    // Create Profile in MySQL
    await Profile.create({
      userId: user.id,
      bio: 'New Ludo Arena Champion 🎲',
      rankTitle: 'Rookie Roller',
      totalMatches: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      highestWinStreak: 0,
      currentWinStreak: 0,
    });

    // Generate Tokens
    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save Session in MySQL
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await Session.create({
      userId: user.id,
      refreshToken,
      deviceInfo: req.headers['user-agent'] || 'Unknown Device',
      expiresAt,
    });

    // Fetch user with profile
    const userWithProfile = await User.findByPk(user.id, {
      include: [{ model: Profile, as: 'profile' }],
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: sanitizeUser(userWithProfile || user),
        token,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request<{}, {}, LoginInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Find User by email
    const user = await User.findOne({
      where: { email },
      include: [{ model: Profile, as: 'profile' }],
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    // Verify Password using bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
      return;
    }

    // Check account status
    if (user.status !== 'ACTIVE') {
      res.status(403).json({
        success: false,
        message: `Your account is ${user.status.toLowerCase()}`,
      });
      return;
    }

    // Generate Tokens
    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Create / Update Session in MySQL
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await Session.create({
      userId: user.id,
      refreshToken,
      deviceInfo: req.headers['user-agent'] || 'Unknown Device',
      expiresAt,
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: sanitizeUser(user),
        token,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const refreshToken = req.body?.refreshToken;

    if (refreshToken) {
      await Session.destroy({ where: { refreshToken } });
    } else if (userId) {
      await Session.destroy({ where: { userId } });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    const user = await User.findByPk(userId, {
      include: [{ model: Profile, as: 'profile' }],
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        user: sanitizeUser(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (
  req: Request<{}, {}, RefreshTokenInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    // Verify signature of refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (_err) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token',
      });
      return;
    }

    // Check Session in MySQL database
    const session = await Session.findOne({ where: { refreshToken } });
    if (!session || new Date(session.expiresAt) < new Date()) {
      res.status(401).json({
        success: false,
        message: 'Session expired or invalidated',
      });
      return;
    }

    const user = await User.findByPk(payload.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Generate new Access Token & Refresh Token
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Update Session in MySQL
    session.refreshToken = newRefreshToken;
    session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await session.save();

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};
