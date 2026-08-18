import {
  LudoGameState,
  LudoCaptureResult,
  LudoTurnResolutionReason,
  LudoTurnResolutionResult,
} from './LudoTypes';
import { LudoTurnService } from './LudoTurnService';

export class LudoTurnResolutionService {
  /**
   * Pure, deterministic turn-resolution engine for Classic Ludo.
   * Evaluates extra-turn rules (SIX, CAPTURE) vs normal turn advancement.
   * Immutably returns the updated game state with dice state reset and updated timestamps.
   */
  public static resolveTurn(
    state: LudoGameState,
    currentPlayerId: string,
    diceValue: number,
    captureResult?: LudoCaptureResult,
    options?: { extraTurnOnSix?: boolean; extraTurnOnCapture?: boolean },
    currentTime?: number
  ): LudoTurnResolutionResult {
    const timestamp = currentTime || Date.now();
    const extraTurnOnSix = options?.extraTurnOnSix ?? true;
    const extraTurnOnCapture = options?.extraTurnOnCapture ?? true;

    // Validate player existence
    const player = state.players.find((p) => p.playerId === currentPlayerId);
    if (!player) {
      throw new Error(`Cannot resolve turn: Player ${currentPlayerId} does not exist in game`);
    }

    let reason: LudoTurnResolutionReason = 'NORMAL_MOVE';
    let extraTurn = false;
    let nextPlayerId = currentPlayerId;

    // 1. Check SIX extra turn rule
    if (diceValue === 6 && extraTurnOnSix) {
      reason = 'SIX';
      extraTurn = true;
      nextPlayerId = currentPlayerId;
    }
    // 2. Check CAPTURE extra turn rule
    else if (captureResult?.captured && extraTurnOnCapture) {
      reason = 'CAPTURE';
      extraTurn = true;
      nextPlayerId = currentPlayerId;
    }
    // 3. Normal Move turn rotation
    else {
      reason = 'NORMAL_MOVE';
      extraTurn = false;
      const nextPlayer = LudoTurnService.getNextPlayer(state);
      nextPlayerId = nextPlayer ? nextPlayer.playerId : currentPlayerId;
    }

    // Derive updated game state immutably
    const updatedGameState: LudoGameState = {
      ...state,
      currentPlayerId: nextPlayerId,
      diceValue: null,
      diceRolled: false,
      turnNumber: (state.turnNumber || 1) + 1,
      turnStartedAt: timestamp,
      lastAction: {
        type: 'TURN_RESOLVED',
        playerId: nextPlayerId,
        payload: {
          previousPlayerId: currentPlayerId,
          reason,
          extraTurn,
          diceValue,
        },
        timestamp,
      },
    };

    return {
      reason,
      extraTurn,
      nextPlayerId,
      updatedGameState,
    };
  }
}

export default LudoTurnResolutionService;
