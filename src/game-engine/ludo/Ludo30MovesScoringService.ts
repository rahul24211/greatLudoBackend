import { LudoGameState, LudoPlayer } from './LudoTypes';

/**
 * Ludo30MovesScoringService
 *
 * Implements deterministic scoring and game-ending arithmetic for the 30-Moves Skill Ludo mode:
 * 1. Step Advancement: +1 Point per tile moved.
 * 2. Home Finish Bonus: +56 Bonus Points when a token enters the HOME triangle.
 * 3. Token Capture Bonus: +20 Bonus Points for hunter player.
 * 4. Token Captured Penalty: -20 Points for victim player (floor at 0).
 * 5. Winner Resolution: Highest score when all active players exhaust their 30 moves,
 *    or instant win if all 4 tokens reach HOME.
 */
export class Ludo30MovesScoringService {
  public static readonly DEFAULT_MAX_MOVES = 30;
  public static readonly POINTS_PER_STEP = 1;
  public static readonly BONUS_POINTS_HOME = 56;
  public static readonly BONUS_POINTS_CAPTURE = 20;
  public static readonly PENALTY_POINTS_CAPTURED = 20;

  /**
   * Initializes player scoring and move quotas for 30 Moves mode.
   */
  public static initializePlayer(player: LudoPlayer, maxMoves: number = Ludo30MovesScoringService.DEFAULT_MAX_MOVES): LudoPlayer {
    return {
      ...player,
      score: player.score ?? 0,
      movesRemaining: player.movesRemaining ?? maxMoves,
      movesUsed: player.movesUsed ?? 0,
    };
  }

  /**
   * Applies point arithmetic and move decrementing for a token movement.
   */
  public static applyMoveScore(
    player: LudoPlayer,
    stepsMoved: number,
    reachesFinish: boolean = false
  ): { updatedPlayer: LudoPlayer; pointsGained: number } {
    const stepPoints = Math.max(0, stepsMoved) * Ludo30MovesScoringService.POINTS_PER_STEP;
    const homeBonus = reachesFinish ? Ludo30MovesScoringService.BONUS_POINTS_HOME : 0;
    const pointsGained = stepPoints + homeBonus;

    const currentScore = player.score ?? 0;
    const currentRemaining = player.movesRemaining ?? Ludo30MovesScoringService.DEFAULT_MAX_MOVES;
    const currentUsed = player.movesUsed ?? 0;

    const updatedPlayer: LudoPlayer = {
      ...player,
      score: currentScore + pointsGained,
      movesRemaining: Math.max(0, currentRemaining - 1),
      movesUsed: currentUsed + 1,
    };

    return { updatedPlayer, pointsGained };
  }

  /**
   * Applies capture scoring adjustments (+20 pts to hunter, -20 pts to victim).
   */
  public static applyCaptureScore(
    hunterPlayer: LudoPlayer,
    victimPlayer: LudoPlayer,
    capturedCount: number = 1
  ): { updatedHunter: LudoPlayer; updatedVictim: LudoPlayer; hunterBonus: number; victimPenalty: number } {
    const hunterBonus = Ludo30MovesScoringService.BONUS_POINTS_CAPTURE * capturedCount;
    const victimPenalty = Ludo30MovesScoringService.PENALTY_POINTS_CAPTURED * capturedCount;

    const updatedHunter: LudoPlayer = {
      ...hunterPlayer,
      score: (hunterPlayer.score ?? 0) + hunterBonus,
    };

    const updatedVictim: LudoPlayer = {
      ...victimPlayer,
      score: Math.max(0, (victimPlayer.score ?? 0) - victimPenalty),
    };

    return { updatedHunter, updatedVictim, hunterBonus, victimPenalty };
  }

  /**
   * Checks if all active (non-disqualified) players have exhausted their 30 moves.
   */
  public static haveAllPlayersExhaustedMoves(gameState: LudoGameState): boolean {
    if (!gameState || !Array.isArray(gameState.players) || gameState.players.length === 0) {
      return false;
    }

    const activePlayers = gameState.players.filter((p) => !p.isDisqualified);
    if (activePlayers.length === 0) return true;

    return activePlayers.every((p) => (p.movesRemaining ?? 0) <= 0);
  }

  /**
   * Evaluates the winner of a 30-Moves match based on highest score with tie-breaker logic.
   */
  public static get30MovesWinner(gameState: LudoGameState): LudoPlayer | null {
    if (!gameState || !Array.isArray(gameState.players) || gameState.players.length === 0) {
      return null;
    }

    const activePlayers = gameState.players.filter((p) => !p.isDisqualified);
    if (activePlayers.length === 0) return null;
    if (activePlayers.length === 1) return activePlayers[0];

    // Check if any player has finished all 4 tokens (instant win)
    for (const player of activePlayers) {
      if (player.tokens && player.tokens.every((t) => t.state === 'FINISHED')) {
        return player;
      }
    }

    // Otherwise sort by score descending
    const sorted = [...activePlayers].sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;

      // Tie-breaker 1: Count of tokens finished in HOME
      const finishedA = a.tokens?.filter((t) => t.state === 'FINISHED').length ?? 0;
      const finishedB = b.tokens?.filter((t) => t.state === 'FINISHED').length ?? 0;
      if (finishedB !== finishedA) return finishedB - finishedA;

      // Tie-breaker 2: Player with fewer moves used
      const movesUsedA = a.movesUsed ?? 0;
      const movesUsedB = b.movesUsed ?? 0;
      return movesUsedA - movesUsedB;
    });

    return sorted[0] || null;
  }

  /**
   * Evaluates 30-moves game finish status and applies winner results.
   */
  public static evaluate30MovesFinish(
    gameState: LudoGameState,
    now: number = Date.now()
  ): { isFinished: boolean; winnerId: string | null; updatedGameState: LudoGameState } {
    if (gameState.status === 'FINISHED' || gameState.winner !== null) {
      return {
        isFinished: true,
        winnerId: gameState.winner,
        updatedGameState: { ...gameState },
      };
    }

    // Condition 1: Any player reached 4 tokens in HOME
    for (const p of gameState.players) {
      if (p.tokens && p.tokens.every((t) => t.state === 'FINISHED')) {
        return {
          isFinished: true,
          winnerId: p.playerId,
          updatedGameState: {
            ...gameState,
            status: 'FINISHED',
            winner: p.playerId,
            finishedAt: now,
          },
        };
      }
    }

    // Condition 2: All players exhausted their 30 moves
    if (Ludo30MovesScoringService.haveAllPlayersExhaustedMoves(gameState)) {
      const winner = Ludo30MovesScoringService.get30MovesWinner(gameState);
      return {
        isFinished: true,
        winnerId: winner ? winner.playerId : null,
        updatedGameState: {
          ...gameState,
          status: 'FINISHED',
          winner: winner ? winner.playerId : null,
          finishedAt: now,
        },
      };
    }

    return {
      isFinished: false,
      winnerId: null,
      updatedGameState: { ...gameState },
    };
  }
}
