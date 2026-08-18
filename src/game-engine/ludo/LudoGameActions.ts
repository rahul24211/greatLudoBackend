import {
  LudoGameState,
  LudoRollDiceActionResult,
} from './LudoTypes';
import { LudoTurnService } from './LudoTurnService';
import { LudoDiceService } from './LudoDiceService';
import { LudoValidMovesService } from './LudoValidMovesService';

export class LudoGameActions {
  /**
   * Execute server-side Roll Dice action for the current player.
   * Pure function that immutably returns the updated game state and valid moves.
   */
  public static handleRollDice(
    state: LudoGameState,
    playerId: string,
    mockDiceValue?: number
  ): LudoRollDiceActionResult {
    // 1. Verify game state exists
    if (!state) {
      return { success: false, reason: 'Game state is missing' };
    }

    // 2. Verify game status is ACTIVE
    if (state.status !== 'ACTIVE') {
      return { success: false, reason: `Game is not ACTIVE (current status: ${state.status})` };
    }

    // 3. Verify player exists
    if (!Array.isArray(state.players)) {
      return { success: false, reason: 'Game players list is invalid' };
    }
    const player = state.players.find((p) => p.playerId === playerId);
    if (!player) {
      return { success: false, reason: `Player ${playerId} does not exist in this game` };
    }

    // 4. Verify player is current player
    if (!LudoTurnService.isPlayerTurn(state, playerId)) {
      return { success: false, reason: `It is not player ${playerId}'s turn` };
    }

    // 5. Verify dice has not already been rolled for current turn
    if (state.diceRolled) {
      return { success: false, reason: 'Dice has already been rolled for this turn' };
    }

    // 6. Generate server-side cryptographically secure dice value (or mock for testing)
    const diceValue =
      typeof mockDiceValue === 'number' && LudoDiceService.isValidDiceValue(mockDiceValue)
        ? mockDiceValue
        : LudoDiceService.rollDice();

    // 7. Calculate valid moves for player's tokens
    const validMovesResult = LudoValidMovesService.getValidMoves(
      player.tokens,
      playerId,
      player.color,
      diceValue
    );

    // 8. Construct updated game state immutably
    const updatedState: LudoGameState = {
      ...state,
      diceValue,
      diceRolled: true,
      lastAction: {
        type: 'DICE_ROLLED',
        playerId,
        payload: {
          diceValue,
          validMovesCount: validMovesResult.validMoves.length,
        },
        timestamp: Date.now(),
      },
    };

    // 9. Return result payload
    return {
      success: true,
      diceValue,
      validMoves: validMovesResult.validMoves,
      invalidMoves: validMovesResult.invalidMoves,
      gameState: updatedState,
    };
  }
}

export default LudoGameActions;
