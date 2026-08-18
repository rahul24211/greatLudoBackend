import {
  LudoColor,
  LudoToken,
  LudoValidMovesResult,
  LudoValidTokenMove,
  LudoInvalidTokenMove,
} from './LudoTypes';
import { LudoMovementService } from './LudoMovementService';

export class LudoValidMovesService {
  /**
   * Determine all legal token moves for a given player and dice value.
   * Pure, deterministic function that does NOT mutate token objects or game state.
   */
  public static getValidMoves(
    tokens: LudoToken[],
    playerId: string,
    playerColor: LudoColor,
    diceValue: number
  ): LudoValidMovesResult {
    const validMoves: LudoValidTokenMove[] = [];
    const invalidMoves: LudoInvalidTokenMove[] = [];

    // Guard against malformed tokens array or missing IDs
    if (!Array.isArray(tokens) || !playerId || !playerColor) {
      return {
        valid: false,
        playerId: playerId || '',
        playerColor,
        diceValue,
        validMoves,
        invalidMoves,
      };
    }

    // Filter tokens for requested playerId (and color match) & deduplicate by tokenId
    const seenTokenIds = new Set<string>();
    const playerTokens: LudoToken[] = [];

    for (const token of tokens) {
      if (
        token &&
        token.playerId === playerId &&
        token.color === playerColor &&
        token.tokenId &&
        !seenTokenIds.has(token.tokenId)
      ) {
        seenTokenIds.add(token.tokenId);
        playerTokens.push(token);
      }
    }

    // Evaluate each token using LudoMovementService
    for (const token of playerTokens) {
      const moveResult = LudoMovementService.calculateMove(token, diceValue, playerColor);

      if (moveResult.valid && moveResult.toCategory && typeof moveResult.toPosition === 'number') {
        validMoves.push({
          tokenId: token.tokenId,
          token: { ...token },
          fromCategory: moveResult.fromCategory,
          fromPosition: moveResult.fromPosition,
          toCategory: moveResult.toCategory,
          toPosition: moveResult.toPosition,
          stepsMoved: moveResult.stepsMoved || 0,
          entersBoard: !!moveResult.entersBoard,
          entersHomePath: !!moveResult.entersHomePath,
          reachesFinish: !!moveResult.reachesFinish,
        });
      } else {
        invalidMoves.push({
          tokenId: token.tokenId,
          token: { ...token },
          reason: moveResult.reason || 'Movement invalid',
        });
      }
    }

    return {
      valid: validMoves.length > 0,
      playerId,
      playerColor,
      diceValue,
      validMoves,
      invalidMoves,
    };
  }

  /**
   * Helper check if at least one token can legally move.
   */
  public static hasValidMoves(
    tokens: LudoToken[],
    playerId: string,
    playerColor: LudoColor,
    diceValue: number
  ): boolean {
    return LudoValidMovesService.getValidMoves(tokens, playerId, playerColor, diceValue).valid;
  }
}

export default LudoValidMovesService;
