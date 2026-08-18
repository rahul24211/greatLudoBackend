import { LudoColor, LudoToken, LudoMoveResult, LudoPositionCategory } from './LudoTypes';
import { LudoBoard } from './LudoBoard';
import { HOME_POSITION, FINISHED_POSITION } from './LudoTokenService';

export const HOME_PATH_BASE_OFFSET = 100;
export const MAX_TOTAL_STEPS = 56; // 50 main path steps + 6 home path steps

export class LudoMovementService {
  /**
   * Pure, deterministic calculation of where a token will move for a given dice value.
   * Does NOT mutate the input token or game state.
   */
  public static calculateMove(
    token: LudoToken,
    diceValue: number,
    playerColor: LudoColor
  ): LudoMoveResult {
    // 1. Validate Dice Input (must be integer 1..6)
    if (
      typeof diceValue !== 'number' ||
      !Number.isInteger(diceValue) ||
      diceValue < 1 ||
      diceValue > 6
    ) {
      return {
        valid: false,
        reason: `Invalid dice value: ${diceValue}. Must be an integer between 1 and 6.`,
        token: { ...token },
        diceValue,
        fromCategory: LudoMovementService.getCategoryForToken(token),
        fromPosition: token.position,
      };
    }

    // 2. Validate Token Color vs Player Color
    if (token.color !== playerColor) {
      return {
        valid: false,
        reason: `Token color (${token.color}) does not match player color (${playerColor}).`,
        token: { ...token },
        diceValue,
        fromCategory: LudoMovementService.getCategoryForToken(token),
        fromPosition: token.position,
      };
    }

    const fromCategory = LudoMovementService.getCategoryForToken(token);

    // 3. Handle HOME State Token
    if (token.state === 'HOME') {
      if (diceValue === 6) {
        const startSquare = LudoBoard.getStartSquare(playerColor);
        return {
          valid: true,
          token: { ...token },
          diceValue,
          fromCategory: LudoPositionCategory.HOME,
          fromPosition: HOME_POSITION,
          toCategory: LudoPositionCategory.MAIN_PATH,
          toPosition: startSquare,
          stepsMoved: 1,
          entersBoard: true,
          entersHomePath: false,
          reachesFinish: false,
        };
      } else {
        return {
          valid: false,
          reason: 'Dice value of 6 is required to move token out of HOME',
          token: { ...token },
          diceValue,
          fromCategory: LudoPositionCategory.HOME,
          fromPosition: HOME_POSITION,
        };
      }
    }

    // 4. Handle FINISHED State Token
    if (token.state === 'FINISHED') {
      return {
        valid: false,
        reason: 'Token is already FINISHED and cannot move',
        token: { ...token },
        diceValue,
        fromCategory: LudoPositionCategory.FINISHED,
        fromPosition: token.position,
      };
    }

    // 5. Handle ACTIVE Token Movement
    const currentSteps = LudoMovementService.getStepsFromStart(token, playerColor);
    const targetSteps = currentSteps + diceValue;

    // Check Overshoot
    if (targetSteps > MAX_TOTAL_STEPS) {
      return {
        valid: false,
        reason: `Dice value ${diceValue} exceeds exact steps required to finish (${MAX_TOTAL_STEPS - currentSteps} needed).`,
        token: { ...token },
        diceValue,
        fromCategory,
        fromPosition: token.position,
      };
    }

    const startSquare = LudoBoard.getStartSquare(playerColor);

    // Case A: Remaining on Main Path (steps <= 50)
    if (targetSteps <= 50) {
      const newMainPos = (startSquare + targetSteps) % 52;
      return {
        valid: true,
        token: { ...token },
        diceValue,
        fromCategory,
        fromPosition: token.position,
        toCategory: LudoPositionCategory.MAIN_PATH,
        toPosition: newMainPos,
        stepsMoved: diceValue,
        entersBoard: false,
        entersHomePath: false,
        reachesFinish: false,
      };
    }

    // Case B: Moving into Home Path (50 < steps < 56)
    if (targetSteps < MAX_TOTAL_STEPS) {
      const homeIndex = targetSteps - 51; // 0..4
      const newHomePos = HOME_PATH_BASE_OFFSET + homeIndex;
      return {
        valid: true,
        token: { ...token },
        diceValue,
        fromCategory,
        fromPosition: token.position,
        toCategory: LudoPositionCategory.HOME_PATH,
        toPosition: newHomePos,
        stepsMoved: diceValue,
        entersBoard: false,
        entersHomePath: fromCategory === LudoPositionCategory.MAIN_PATH,
        reachesFinish: false,
      };
    }

    // Case C: Reaching FINISHED (steps === 56)
    return {
      valid: true,
      token: { ...token },
      diceValue,
      fromCategory,
      fromPosition: token.position,
      toCategory: LudoPositionCategory.FINISHED,
      toPosition: FINISHED_POSITION,
      stepsMoved: diceValue,
      entersBoard: false,
      entersHomePath: false,
      reachesFinish: true,
    };
  }

  /**
   * Helper to check if a token move is valid for a given dice value and color.
   */
  public static isValidMove(
    token: LudoToken,
    diceValue: number,
    playerColor: LudoColor
  ): boolean {
    return LudoMovementService.calculateMove(token, diceValue, playerColor).valid;
  }

  /**
   * Calculate total steps taken from the color's starting cell.
   */
  private static getStepsFromStart(token: LudoToken, color: LudoColor): number {
    if (token.state === 'HOME') return 0;
    if (token.state === 'FINISHED') return MAX_TOTAL_STEPS;

    const startSquare = LudoBoard.getStartSquare(color);

    // Main path cell
    if (token.position >= 0 && token.position < 52) {
      return (token.position - startSquare + 52) % 52;
    }

    // Home path cell (encoded 100..105 or 0..5)
    if (token.position >= HOME_PATH_BASE_OFFSET && token.position <= HOME_PATH_BASE_OFFSET + 5) {
      const homeIndex = token.position - HOME_PATH_BASE_OFFSET;
      return 51 + homeIndex;
    }

    if (token.position >= 0 && token.position <= 5) {
      return 51 + token.position;
    }

    return 0;
  }

  /**
   * Helper to determine LudoPositionCategory from token state and position.
   */
  private static getCategoryForToken(token: LudoToken): LudoPositionCategory {
    if (token.state === 'HOME') return LudoPositionCategory.HOME;
    if (token.state === 'FINISHED') return LudoPositionCategory.FINISHED;
    if (token.position >= HOME_PATH_BASE_OFFSET) return LudoPositionCategory.HOME_PATH;
    return LudoPositionCategory.MAIN_PATH;
  }
}

export default LudoMovementService;
