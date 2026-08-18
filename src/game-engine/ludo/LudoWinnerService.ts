import { LudoGameState, LudoPlayer, LudoGameResult } from './LudoTypes';

export class LudoWinnerService {
  /**
   * Check if a specific player has satisfied the winning condition (all 4 tokens FINISHED).
   */
  public static hasPlayerWon(player: LudoPlayer): boolean {
    if (!player || !Array.isArray(player.tokens) || player.tokens.length !== 4) {
      return false;
    }
    return player.tokens.every((token) => token && token.state === 'FINISHED');
  }

  /**
   * Find the winner from game state deterministically (first player in game order to finish 4 tokens).
   */
  public static getWinner(gameState: LudoGameState): LudoPlayer | null {
    if (!gameState || !Array.isArray(gameState.players)) {
      return null;
    }

    // If winner is already recorded, return that player object
    if (gameState.winner) {
      return gameState.players.find((p) => p.playerId === gameState.winner) || null;
    }

    // Otherwise evaluate players in game order
    for (const player of gameState.players) {
      if (LudoWinnerService.hasPlayerWon(player)) {
        return player;
      }
    }

    return null;
  }

  /**
   * Check if the game is finished.
   */
  public static isGameFinished(gameState: LudoGameState): boolean {
    if (!gameState) return false;
    if (gameState.status === 'FINISHED' || gameState.winner !== null) {
      return true;
    }
    return LudoWinnerService.getWinner(gameState) !== null;
  }

  /**
   * Get a strongly typed summary of game result.
   */
  public static getGameResult(gameState: LudoGameState, now?: number): LudoGameResult {
    if (!gameState) {
      return {
        status: 'WAITING',
        winnerId: null,
        winnerColor: null,
        finishedAt: null,
        reason: 'Invalid game state',
      };
    }

    const winner = LudoWinnerService.getWinner(gameState);
    if (winner) {
      return {
        status: 'FINISHED',
        winnerId: winner.playerId,
        winnerColor: winner.color,
        finishedAt: gameState.finishedAt || now || Date.now(),
        reason: `Player ${winner.playerId} (${winner.color}) won the game`,
      };
    }

    return {
      status: gameState.status,
      winnerId: null,
      winnerColor: null,
      finishedAt: null,
      reason: gameState.status === 'FINISHED' ? 'Game finished without winner' : 'Game in progress',
    };
  }

  /**
   * Immutably evaluate and apply game finish / winner logic.
   * If a winner is detected, sets status='FINISHED', winner=winnerId, and finishedAt timestamp.
   */
  public static evaluateAndApplyWinner(
    gameState: LudoGameState,
    now?: number
  ): { winnerFound: boolean; gameResult: LudoGameResult; updatedGameState: LudoGameState } {
    if (!gameState) {
      throw new Error('Cannot evaluate winner on missing game state');
    }

    // Edge case: game already finished or winner already recorded
    if (gameState.status === 'FINISHED' || gameState.winner !== null) {
      const existingResult = LudoWinnerService.getGameResult(gameState, now);
      return {
        winnerFound: existingResult.winnerId !== null,
        gameResult: existingResult,
        updatedGameState: { ...gameState },
      };
    }

    const winnerPlayer = LudoWinnerService.getWinner(gameState);
    if (winnerPlayer) {
      const timestamp = now || Date.now();
      const updatedGameState: LudoGameState = {
        ...gameState,
        status: 'FINISHED',
        winner: winnerPlayer.playerId,
        finishedAt: timestamp,
        lastAction: {
          type: 'GAME_FINISHED',
          playerId: winnerPlayer.playerId,
          payload: {
            winnerId: winnerPlayer.playerId,
            winnerColor: winnerPlayer.color,
          },
          timestamp,
        },
      };

      const gameResult = LudoWinnerService.getGameResult(updatedGameState, timestamp);
      return {
        winnerFound: true,
        gameResult,
        updatedGameState,
      };
    }

    return {
      winnerFound: false,
      gameResult: LudoWinnerService.getGameResult(gameState, now),
      updatedGameState: { ...gameState },
    };
  }
}

export default LudoWinnerService;
