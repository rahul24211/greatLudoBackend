import crypto from 'crypto';
import {
  LudoPlayer,
  LudoColor,
  LudoBotDifficulty,
  LudoGameState,
  LudoValidTokenMove,
} from '../LudoTypes';
import { LudoTokenService } from '../LudoTokenService';
import { LudoBotStrategy } from './LudoBotStrategy';

export class LudoBotService {
  /**
   * Create a virtual BOT player.
   * Does NOT create any rows in MySQL User tables.
   */
  public static createBotPlayer(
    color: LudoColor,
    difficulty: LudoBotDifficulty = 'MEDIUM',
    customBotId?: string
  ): LudoPlayer {
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const botId = customBotId || `bot_${color.toLowerCase()}_${randomSuffix}`;
    const botTokens = LudoTokenService.createPlayerTokens(botId, color);

    const difficultyNames: Record<LudoBotDifficulty, string> = {
      EASY: 'Beginner Bot',
      MEDIUM: 'Smart Bot',
      HARD: 'Master Bot',
    };

    return {
      playerId: botId,
      userId: botId,
      username: difficultyNames[difficulty] || 'Smart Bot',
      color,
      tokens: botTokens,
      isConnected: true,
      playerType: 'BOT',
      botDifficulty: difficulty,
      missedTurns: 0,
      isDisqualified: false,
    };
  }

  /**
   * Select a move for the bot based on its difficulty strategy.
   * Pure decision function; server executes the chosen move through LudoGameEngine.moveToken().
   */
  public static selectMove(
    gameState: LudoGameState,
    _botPlayerId: string,
    validMoves: LudoValidTokenMove[],
    difficulty: LudoBotDifficulty = 'MEDIUM'
  ): LudoValidTokenMove | null {
    if (!validMoves || validMoves.length === 0) {
      return null;
    }

    switch (difficulty) {
      case 'EASY':
        return LudoBotStrategy.selectEasyMove(validMoves);
      case 'HARD':
        return LudoBotStrategy.selectHardMove(gameState, validMoves);
      case 'MEDIUM':
      default:
        return LudoBotStrategy.selectMediumMove(gameState, validMoves);
    }
  }
}

export default LudoBotService;
