import crypto from 'crypto';
import { SnakeLadderPlayer, SnakeLadderColor } from '../SnakeLadderTypes';

export class SnakeLadderBotService {
  /**
   * Create a virtual BOT player for Snake & Ladder.
   */
  public static createBotPlayer(
    color: SnakeLadderColor,
    customBotId?: string
  ): SnakeLadderPlayer {
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const botId = customBotId || `bot_${color.toLowerCase()}_${randomSuffix}`;

    return {
      playerId: botId,
      userId: botId,
      username: 'Smart Snake Bot',
      color,
      position: 1,
      isConnected: true,
      playerType: 'BOT',
      missedTurns: 0,
      isDisqualified: false,
    };
  }
}
