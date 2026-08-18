import sequelize from '../../config/database';
import { LudoMatch, LudoMatchPlayer } from '../../models';
import { LudoGameState } from '../../game-engine/ludo/LudoTypes';

export interface PlayerHistoryResult {
  matches: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class LudoMatchHistoryService {
  /**
   * Idempotently create permanent MySQL match history for a FINISHED Ludo game.
   * Executes inside a Sequelize database transaction.
   */
  public static async createMatchResult(
    gameState: LudoGameState
  ): Promise<{ success: boolean; match?: LudoMatch; isDuplicate?: boolean }> {
    if (!gameState || gameState.status !== 'FINISHED' || !gameState.gameId) {
      return { success: false };
    }

    // 1. Idempotency Check (Check if match already persisted)
    try {
      const existingMatch = await LudoMatch.findOne({
        where: { gameId: gameState.gameId },
        include: [{ model: LudoMatchPlayer, as: 'players' }],
      });

      if (existingMatch) {
        return { success: true, match: existingMatch, isDuplicate: true };
      }
    } catch (err) {
      console.warn(`⚠️ Error checking existing match for gameId [${gameState.gameId}]:`, err);
    }

    // 2. Start Sequelize Database Transaction
    const transaction = await sequelize.transaction();

    try {
      const winnerPlayer = gameState.players.find((p) => p.playerId === gameState.winner);
      const winnerColor = winnerPlayer ? winnerPlayer.color : null;
      const finishedAt = gameState.finishedAt ? new Date(gameState.finishedAt) : new Date();
      const startedAt = gameState.turnStartedAt ? new Date(gameState.turnStartedAt) : new Date();

      // Create LudoMatch record
      const match = await LudoMatch.create(
        {
          gameId: gameState.gameId,
          status: 'FINISHED',
          gameMode: gameState.mode || 'CLASSIC',
          winnerId: gameState.winner || null,
          winnerColor,
          startedAt,
          finishedAt,
        },
        { transaction }
      );

      // Create LudoMatchPlayer records for all participants
      for (const player of gameState.players) {
        const isWinner = player.playerId === gameState.winner;
        await LudoMatchPlayer.create(
          {
            matchId: match.id,
            userId: player.userId || player.playerId,
            color: player.color,
            playerType: player.playerType || 'HUMAN',
            finalPosition: isWinner ? 1 : null,
          },
          { transaction }
        );
      }

      await transaction.commit();
      return { success: true, match, isDuplicate: false };
    } catch (error) {
      await transaction.rollback();
      console.error(`❌ Transaction failed saving LudoMatch for gameId [${gameState.gameId}]:`, error);
      return { success: false };
    }
  }

  /**
   * Get completed match result by gameId.
   */
  public static async getMatchResult(gameId: string): Promise<LudoMatch | null> {
    if (!gameId) return null;
    return await LudoMatch.findOne({
      where: { gameId },
      include: [{ model: LudoMatchPlayer, as: 'players' }],
    });
  }

  /**
   * Get paginated completed match history for a specific user.
   */
  public static async getPlayerMatchHistory(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<PlayerHistoryResult> {
    if (!userId) {
      return { matches: [], total: 0, page: 1, limit: 10, totalPages: 0 };
    }

    const validPage = Math.max(1, page);
    const validLimit = Math.min(50, Math.max(1, limit));
    const offset = (validPage - 1) * validLimit;

    const { rows, count } = await LudoMatchPlayer.findAndCountAll({
      where: { userId },
      limit: validLimit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: LudoMatch,
          as: 'match',
          include: [{ model: LudoMatchPlayer, as: 'players' }],
        },
      ],
    });

    const matches = rows.map((row) => (row as any).match).filter(Boolean);

    return {
      matches,
      total: count,
      page: validPage,
      limit: validLimit,
      totalPages: Math.ceil(count / validLimit),
    };
  }
}

export default LudoMatchHistoryService;
