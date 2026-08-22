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
    customBotId?: string,
    mode: string = 'CLASSIC'
  ): LudoPlayer {
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const botId = customBotId || `bot_${color.toLowerCase()}_${randomSuffix}`;
    const is30Moves = mode === 'MOVES_30';
    const botTokens = is30Moves
      ? LudoTokenService.create30MovesPlayerTokens(botId, color)
      : LudoTokenService.createPlayerTokens(botId, color);

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
      score: is30Moves ? 0 : undefined,
      movesRemaining: is30Moves ? 30 : undefined,
      movesUsed: is30Moves ? 0 : undefined,
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
