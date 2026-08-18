import { LudoColor, LudoToken, LudoTokenState } from './LudoTypes';
import { TOKENS_PER_PLAYER, LUDO_COLORS } from './LudoConstants';

export const HOME_POSITION = -1;
export const FINISHED_POSITION = 99;

export class LudoTokenService {
  /**
   * Create 4 initial tokens for a player in the HOME state.
   */
  public static createPlayerTokens(playerId: string, color: LudoColor): LudoToken[] {
    if (!playerId || typeof playerId !== 'string') {
      throw new Error('Valid playerId is required to create tokens');
    }
    if (!LUDO_COLORS.includes(color)) {
      throw new Error(`Invalid Ludo color: ${color}`);
    }

    const tokens: LudoToken[] = [];
    for (let i = 1; i <= TOKENS_PER_PLAYER; i++) {
      tokens.push({
        tokenId: `${playerId}-token-${i}`,
        playerId,
        color,
        state: 'HOME',
        position: HOME_POSITION,
      });
    }
    return tokens;
  }

  /**
   * Find a token by its unique ID.
   */
  public static getTokenById(tokens: LudoToken[], tokenId: string): LudoToken | null {
    if (!Array.isArray(tokens) || !tokenId) return null;
    return tokens.find((t) => t.tokenId === tokenId) || null;
  }

  /**
   * Filter tokens belonging to a specific player ID.
   */
  public static getPlayerTokens(tokens: LudoToken[], playerId: string): LudoToken[] {
    if (!Array.isArray(tokens) || !playerId) return [];
    return tokens.filter((t) => t.playerId === playerId);
  }

  /**
   * Get the current state of a token.
   */
  public static getTokenState(token: LudoToken): LudoTokenState {
    return token.state;
  }

  /**
   * Check if token is in HOME state.
   */
  public static isTokenAtHome(token: LudoToken): boolean {
    return token.state === 'HOME' && token.position === HOME_POSITION;
  }

  /**
   * Check if token is in ACTIVE state.
   */
  public static isTokenActive(token: LudoToken): boolean {
    return token.state === 'ACTIVE' && token.position >= 0;
  }

  /**
   * Check if token is in FINISHED state.
   */
  public static isTokenFinished(token: LudoToken): boolean {
    return token.state === 'FINISHED';
  }

  /**
   * Immutably update a token's state and position.
   * Throws an Error if invalid state-position combinations are attempted.
   */
  public static updateTokenPosition(
    token: LudoToken,
    newState: LudoTokenState,
    newPosition: number
  ): LudoToken {
    // Validate combination
    if (newState === 'HOME' && newPosition !== HOME_POSITION) {
      throw new Error(`Token in HOME state cannot have active position ${newPosition}. Must be ${HOME_POSITION}.`);
    }
    if (newState === 'ACTIVE' && newPosition < 0) {
      throw new Error(`Token in ACTIVE state cannot have negative position ${newPosition}.`);
    }
    if (newState === 'FINISHED' && newPosition < 0) {
      throw new Error(`Token in FINISHED state cannot have invalid position ${newPosition}.`);
    }

    return {
      ...token,
      state: newState,
      position: newPosition,
    };
  }

  /**
   * Immutably update a token inside a token list.
   */
  public static updateTokensList(tokens: LudoToken[], updatedToken: LudoToken): LudoToken[] {
    if (!Array.isArray(tokens)) return [];
    return tokens.map((t) => (t.tokenId === updatedToken.tokenId ? { ...updatedToken } : t));
  }

  /**
   * Validate a list of tokens for structural integrity and game rules.
   */
  public static validateTokens(tokens: LudoToken[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(tokens)) {
      return { valid: false, errors: ['Tokens input must be an array'] };
    }

    const validStates: LudoTokenState[] = ['HOME', 'ACTIVE', 'FINISHED'];
    const seenTokenIds = new Set<string>();
    const playerTokenCounts: Record<string, number> = {};

    for (const token of tokens) {
      // 1. Token ID uniqueness
      if (!token.tokenId) {
        errors.push('Token missing tokenId');
      } else if (seenTokenIds.has(token.tokenId)) {
        errors.push(`Duplicate token ID detected: ${token.tokenId}`);
      } else {
        seenTokenIds.add(token.tokenId);
      }

      // 2. Player ID
      if (!token.playerId) {
        errors.push(`Token ${token.tokenId} missing playerId`);
      } else {
        playerTokenCounts[token.playerId] = (playerTokenCounts[token.playerId] || 0) + 1;
      }

      // 3. Color validity
      if (!LUDO_COLORS.includes(token.color)) {
        errors.push(`Token ${token.tokenId} has invalid color: ${token.color}`);
      }

      // 4. State validity
      if (!validStates.includes(token.state)) {
        errors.push(`Token ${token.tokenId} has invalid state: ${token.state}`);
      }

      // 5. Combination validity
      if (token.state === 'HOME' && token.position !== HOME_POSITION) {
        errors.push(`Token ${token.tokenId} in HOME state has invalid position ${token.position}`);
      } else if (token.state === 'ACTIVE' && token.position < 0) {
        errors.push(`Token ${token.tokenId} in ACTIVE state has invalid position ${token.position}`);
      } else if (token.state === 'FINISHED' && token.position < 0) {
        errors.push(`Token ${token.tokenId} in FINISHED state has invalid position ${token.position}`);
      }
    }

    // 6. Verify token counts per player (must be exactly 4 tokens per player)
    for (const [pId, count] of Object.entries(playerTokenCounts)) {
      if (count !== TOKENS_PER_PLAYER) {
        errors.push(`Player ${pId} has ${count} tokens instead of exactly ${TOKENS_PER_PLAYER}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default LudoTokenService;
