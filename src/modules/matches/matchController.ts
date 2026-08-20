import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { LudoMatchHistoryService } from '../../services/ludo/LudoMatchHistoryService';

export const getMyMatchHistory = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.id || (req.query.userId as string);

    if (!userId) {
      res.status(200).json({
        success: true,
        data: {
          matches: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        },
      });
      return;
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    const history = await LudoMatchHistoryService.getPlayerMatchHistory(userId, page, limit);

    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    console.error('❌ Error fetching user match history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch match history',
    });
  }
};
