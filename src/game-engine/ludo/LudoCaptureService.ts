import { LudoToken, LudoCaptureResult } from './LudoTypes';
import { LudoBoard } from './LudoBoard';
import { HOME_POSITION } from './LudoTokenService';

export class LudoCaptureService {
  /**
   * Pure function to determine which opponent tokens are capturable on a target destination.
   * Safe cells and non-main path cells strictly prevent captures.
   */
  public static findCapturableTokens(
    movingToken: LudoToken,
    allTokens: LudoToken[],
    destinationPosition: number
  ): LudoToken[] {
    if (!movingToken || !Array.isArray(allTokens)) {
      return [];
    }

    // 1. Safe cell protection check (using server-side board configuration)
    if (LudoBoard.isSafeCell(destinationPosition)) {
      return [];
    }

    // 2. Only main path cells (0..51) support capture. Home path (100..105), HOME (-1), FINISHED (99) cannot be captured.
    if (destinationPosition < 0 || destinationPosition >= 52) {
      return [];
    }

    // 3. Filter active opponent tokens at destination
    return allTokens.filter(
      (token) =>
        token &&
        token.tokenId !== movingToken.tokenId &&
        token.playerId !== movingToken.playerId &&
        token.color !== movingToken.color &&
        token.state === 'ACTIVE' &&
        token.position === destinationPosition
    );
  }

  /**
   * Immutably apply capture rules after a token move.
   * Sends captured opponent tokens to state='HOME' and position=HOME_POSITION (-1).
   */
  public static applyCapture(
    movingToken: LudoToken,
    allTokens: LudoToken[],
    destinationPosition: number
  ): LudoCaptureResult {
    const capturable = LudoCaptureService.findCapturableTokens(
      movingToken,
      allTokens,
      destinationPosition
    );

    if (capturable.length === 0) {
      return {
        captured: false,
        capturedTokenIds: [],
        capturingTokenId: movingToken.tokenId,
        position: destinationPosition,
        updatedTokens: [...allTokens],
      };
    }

    const capturedTokenIds = capturable.map((t) => t.tokenId);
    const capturedSet = new Set(capturedTokenIds);

    const updatedTokens: LudoToken[] = allTokens.map((token) => {
      if (capturedSet.has(token.tokenId)) {
        return {
          ...token,
          state: 'HOME',
          position: HOME_POSITION,
        };
      }
      return { ...token };
    });

    return {
      captured: true,
      capturedTokenIds,
      capturingTokenId: movingToken.tokenId,
      position: destinationPosition,
      updatedTokens,
    };
  }
}

export default LudoCaptureService;
