import { LudoColor, LudoPositionCategory, LudoPositionModel } from './LudoTypes';
import {
  LUDO_COLORS,
  TOTAL_MAIN_PATH_CELLS,
  HOME_PATH_LENGTH,
  COLOR_START_POSITIONS,
  COLOR_HOME_ENTRY_POSITIONS,
  SAFE_CELLS,
  COLOR_HOME_PATHS,
  TOKENS_PER_PLAYER,
} from './LudoConstants';

export class LudoBoard {
  /**
   * Get the deterministic main-track start cell for a given color.
   */
  public static getStartSquare(color: LudoColor): number {
    return COLOR_START_POSITIONS[color];
  }

  /**
   * Get the main-track home-entry threshold cell for a given color.
   */
  public static getHomeEntrySquare(color: LudoColor): number {
    return COLOR_HOME_ENTRY_POSITIONS[color];
  }

  /**
   * Check if a main path position index is a designated safe cell.
   */
  public static isSafeCell(position: number): boolean {
    return SAFE_CELLS.includes(position);
  }

  /**
   * Get the home path indices for a color (0..5).
   */
  public static getHomePathForColor(color: LudoColor): number[] {
    return [...COLOR_HOME_PATHS[color]];
  }

  /**
   * Generate deterministic token IDs for a given color (e.g., ["red_1", "red_2", "red_3", "red_4"]).
   */
  public static generateTokenIds(color: LudoColor): string[] {
    const prefix = color.toLowerCase();
    const tokenIds: string[] = [];
    for (let i = 1; i <= TOKENS_PER_PLAYER; i++) {
      tokenIds.push(`${prefix}_${i}`);
    }
    return tokenIds;
  }

  /**
   * Create a structured position model representation.
   */
  public static createPositionModel(
    category: LudoPositionCategory,
    index: number,
    color?: LudoColor
  ): LudoPositionModel {
    return { category, index, color };
  }

  /**
   * Comprehensive validation of the logical Ludo board configuration.
   */
  public static validateBoardConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. Verify all 4 player colors exist
    const requiredColors: LudoColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
    for (const color of requiredColors) {
      if (!LUDO_COLORS.includes(color)) {
        errors.push(`Missing required player color: ${color}`);
      }
    }

    // 2. Verify all start positions are valid and unique
    const startPositions = new Set<number>();
    for (const color of requiredColors) {
      const startPos = COLOR_START_POSITIONS[color];
      if (typeof startPos !== 'number' || startPos < 0 || startPos >= TOTAL_MAIN_PATH_CELLS) {
        errors.push(`Invalid start position for color ${color}: ${startPos}`);
      } else if (startPositions.has(startPos)) {
        errors.push(`Duplicate start position detected: ${startPos}`);
      } else {
        startPositions.add(startPos);
      }
    }

    // 3. Verify safe cells
    if (!Array.isArray(SAFE_CELLS) || SAFE_CELLS.length === 0) {
      errors.push('Safe cells array is missing or empty');
    } else {
      for (const safeCell of SAFE_CELLS) {
        if (safeCell < 0 || safeCell >= TOTAL_MAIN_PATH_CELLS) {
          errors.push(`Invalid safe cell index: ${safeCell}`);
        }
      }
    }

    // 4. Verify home paths exist for all colors
    for (const color of requiredColors) {
      const homePath = COLOR_HOME_PATHS[color];
      if (!Array.isArray(homePath) || homePath.length !== HOME_PATH_LENGTH) {
        errors.push(`Invalid home path for color ${color}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default LudoBoard;
