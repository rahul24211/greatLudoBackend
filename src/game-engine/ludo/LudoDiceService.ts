import crypto from 'crypto';

export class LudoDiceService {
  /**
   * Cryptographically secure server-side dice generation.
   * Uses Node.js crypto.randomInt(1, 7).
   * Never uses Math.random().
   */
  public static rollDice(): number {
    return crypto.randomInt(1, 7);
  }

  /**
   * Strict validation for dice values.
   * Returns true ONLY if value is an integer between 1 and 6 inclusive.
   */
  public static isValidDiceValue(value: unknown): boolean {
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      !Number.isNaN(value) &&
      value >= 1 &&
      value <= 6
    );
  }

  /**
   * Detailed validation object for a dice roll result.
   */
  public static validateDiceRoll(value: unknown): { valid: boolean; error?: string } {
    if (value === null || value === undefined) {
      return { valid: false, error: 'Dice value is missing' };
    }
    if (typeof value !== 'number') {
      return { valid: false, error: `Dice value must be a number, received: ${typeof value}` };
    }
    if (!Number.isInteger(value)) {
      return { valid: false, error: `Dice value must be an integer, received float: ${value}` };
    }
    if (Number.isNaN(value)) {
      return { valid: false, error: 'Dice value cannot be NaN' };
    }
    if (value < 1 || value > 6) {
      return { valid: false, error: `Dice value must be between 1 and 6, received: ${value}` };
    }

    return { valid: true };
  }

  /**
   * Security helper: Sanitizes client payload by removing any client-supplied diceValue.
   * Guarantees the server remains the sole authority for dice generation.
   */
  public static sanitizeClientPayload(payload: any): Record<string, any> {
    if (!payload || typeof payload !== 'object') return {};
    const sanitized = { ...payload };
    delete sanitized.diceValue;
    delete sanitized.dice;
    return sanitized;
  }
}

export default LudoDiceService;
