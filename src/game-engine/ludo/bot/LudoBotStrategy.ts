import {
  LudoGameState,
  LudoValidTokenMove,
  LudoPositionCategory,
  LudoToken,
} from '../LudoTypes';
import { LudoBoard } from '../LudoBoard';
import { LudoCaptureService } from '../LudoCaptureService';
import crypto from 'crypto';

export class LudoBotStrategy {
  /**
   * EASY Bot: Randomly picks any valid move using secure random selection.
   * Never cheats, only chooses from server-calculated validMoves.
   */
  public static selectEasyMove(
    validMoves: LudoValidTokenMove[]
  ): LudoValidTokenMove | null {
    if (!validMoves || validMoves.length === 0) return null;
    if (validMoves.length === 1) return validMoves[0];

    const randomIndex = crypto.randomInt(0, validMoves.length);
    return validMoves[randomIndex];
  }

  /**
   * MEDIUM Bot: Priority-based tactical decision making:
   * 1. Capture opponent if available.
   * 2. Finish token into goal if possible.
   * 3. Move token out of HOME yard (on rolling a 6).
   * 4. Move token into a SAFE cell.
   * 5. Fallback: Advance token closest to finish.
   */
  public static selectMediumMove(
    gameState: LudoGameState,
    validMoves: LudoValidTokenMove[]
  ): LudoValidTokenMove | null {
    if (!validMoves || validMoves.length === 0) return null;
    if (validMoves.length === 1) return validMoves[0];

    const allTokens: LudoToken[] = gameState.players.flatMap((p) => p.tokens);

    // 1. Priority: Captures
    const captureMove = validMoves.find((move) => {
      if (move.toCategory !== LudoPositionCategory.MAIN_PATH) return false;
      const capturable = LudoCaptureService.findCapturableTokens(
        move.token,
        allTokens,
        move.toPosition
      );
      return capturable.length > 0;
    });
    if (captureMove) return captureMove;

    // 2. Priority: Finish Token
    const finishMove = validMoves.find(
      (move) => move.reachesFinish || move.toCategory === LudoPositionCategory.FINISHED
    );
    if (finishMove) return finishMove;

    // 3. Priority: Exit HOME Yard
    const exitHomeMove = validMoves.find(
      (move) => move.entersBoard || move.fromCategory === LudoPositionCategory.HOME
    );
    if (exitHomeMove) return exitHomeMove;

    // 4. Priority: Enter Safe Cell
    const safeMove = validMoves.find(
      (move) =>
        move.toCategory === LudoPositionCategory.MAIN_PATH &&
        LudoBoard.isSafeCell(move.toPosition)
    );
    if (safeMove) return safeMove;

    // 5. Fallback: Furthest advanced token
    return [...validMoves].sort((a, b) => b.toPosition - a.toPosition)[0];
  }

  /**
   * HARD Bot: Comprehensive deterministic evaluation scoring.
   * Evaluates tactical threats, opportunities, safety, and goal progress.
   */
  public static selectHardMove(
    gameState: LudoGameState,
    validMoves: LudoValidTokenMove[]
  ): LudoValidTokenMove | null {
    if (!validMoves || validMoves.length === 0) return null;
    if (validMoves.length === 1) return validMoves[0];

    const allTokens: LudoToken[] = gameState.players.flatMap((p) => p.tokens);
    const botPlayer = gameState.players.find(
      (p) => p.playerId === gameState.currentPlayerId
    );
    const opponentTokens = allTokens.filter(
      (t) => t.playerId !== gameState.currentPlayerId && t.state === 'ACTIVE'
    );

    let bestMove = validMoves[0];
    let highestScore = -Infinity;

    for (const move of validMoves) {
      let score = 0;

      // 1. Goal Progress
      score += move.stepsMoved * 2;

      // 2. Capture Opponent Reward (+150)
      if (move.toCategory === LudoPositionCategory.MAIN_PATH) {
        const capturable = LudoCaptureService.findCapturableTokens(
          move.token,
          allTokens,
          move.toPosition
        );
        if (capturable.length > 0) {
          score += 150 * capturable.length;
        }
      }

      // 3. Finish Token Reward (+120, +200 if final winning token)
      if (move.reachesFinish || move.toCategory === LudoPositionCategory.FINISHED) {
        score += 120;
        const remainingToFinish =
          botPlayer?.tokens.filter(
            (t) => t.tokenId !== move.tokenId && t.state !== 'FINISHED'
          ).length || 0;
        if (remainingToFinish === 0) {
          score += 200; // Immediate match winning move
        }
      }

      // 4. Escape Threat Reward (+45)
      // Check if current position is vulnerable to any opponent within 1..6 steps behind
      if (
        move.fromCategory === LudoPositionCategory.MAIN_PATH &&
        !LudoBoard.isSafeCell(move.fromPosition)
      ) {
        const hasThreatBehind = opponentTokens.some((opp) => {
          if (opp.position < 0 || opp.position >= 52) return false;
          const dist = (move.fromPosition - opp.position + 52) % 52;
          return dist >= 1 && dist <= 6;
        });
        if (hasThreatBehind) {
          score += 45;
        }
      }

      // 5. Land on Safe Cell Reward (+35)
      if (
        move.toCategory === LudoPositionCategory.MAIN_PATH &&
        LudoBoard.isSafeCell(move.toPosition)
      ) {
        score += 35;
      }

      // 6. Enter Protected Home Path Reward (+30)
      if (
        move.entersHomePath ||
        move.toCategory === LudoPositionCategory.HOME_PATH
      ) {
        score += 30;
      }

      // 7. Exit HOME Yard Reward (+25)
      if (
        move.entersBoard ||
        move.fromCategory === LudoPositionCategory.HOME
      ) {
        score += 25;
      }

      // 8. Danger Penalty (-35)
      // Moving out of safe cell to an unsafe cell with opponent 1..6 steps behind
      if (
        move.fromCategory === LudoPositionCategory.MAIN_PATH &&
        LudoBoard.isSafeCell(move.fromPosition) &&
        move.toCategory === LudoPositionCategory.MAIN_PATH &&
        !LudoBoard.isSafeCell(move.toPosition)
      ) {
        const movesIntoThreat = opponentTokens.some((opp) => {
          if (opp.position < 0 || opp.position >= 52) return false;
          const dist = (move.toPosition - opp.position + 52) % 52;
          return dist >= 1 && dist <= 6;
        });
        if (movesIntoThreat) {
          score -= 35;
        }
      }

      // Deterministic tie-breaking by score, then alphabetical tokenId
      if (
        score > highestScore ||
        (score === highestScore && move.tokenId.localeCompare(bestMove.tokenId) < 0)
      ) {
        highestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }
}

export default LudoBotStrategy;
