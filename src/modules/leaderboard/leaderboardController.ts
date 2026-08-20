import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { User } from '../../models/User';

export const getGlobalLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const search = (req.query.search as string)?.trim();
    const tier = (req.query.tier as string)?.trim();

    const whereClause: any = {
      status: 'ACTIVE',
    };

    if (search) {
      whereClause.username = { [Op.like]: `%${search}%` };
    }

    if (tier && tier !== 'ALL') {
      if (tier === 'Grandmaster') {
        whereClause.level = { [Op.gte]: 50 };
      } else if (tier === 'Master') {
        whereClause.level = { [Op.between]: [25, 49] };
      } else if (tier === 'Diamond') {
        whereClause.level = { [Op.between]: [10, 24] };
      } else {
        whereClause.level = { [Op.lt]: 10 };
      }
    }

    const offset = (page - 1) * limit;

    const { rows: users, count: total } = await User.findAndCountAll({
      where: whereClause,
      order: [
        ['coins', 'DESC'],
        ['xp', 'DESC'],
      ],
      limit,
      offset,
      attributes: ['id', 'username', 'avatar', 'coins', 'xp', 'level', 'createdAt'],
    });

    const leaderboard = users.map((u, idx) => {
      const globalRank = offset + idx + 1;
      const rankTier =
        u.level >= 50
          ? 'Grandmaster'
          : u.level >= 25
          ? 'Master'
          : u.level >= 10
          ? 'Diamond'
          : 'Gold';

      return {
        rank: globalRank,
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        coins: u.coins,
        xp: u.xp,
        level: u.level,
        rankTier,
        badge: rankTier,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        leaderboard,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error: any) {
    console.error('❌ Error in getGlobalLeaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch global leaderboard',
    });
  }
};
