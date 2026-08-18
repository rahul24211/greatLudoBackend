import { LudoGameState, LudoPlayer } from './LudoTypes';

export const DEFAULT_TURN_TIME_LIMIT_SECONDS = 15;

export class LudoTurnService {
  /**
   * Deterministically select the starting player (server authority).
   */
  public static selectStartingPlayer(players: LudoPlayer[], index: number = 0): LudoPlayer {
    if (!Array.isArray(players) || players.length === 0) {
      throw new Error('Cannot select starting player from an empty player list');
    }
    const safeIndex = Math.abs(index) % players.length;
    return players[safeIndex];
  }

  /**
   * Get the current active player from game state.
   */
  public static getCurrentPlayer(state: LudoGameState): LudoPlayer | null {
    if (!state || !state.currentPlayerId || !Array.isArray(state.players)) return null;
    return state.players.find((p) => p.playerId === state.currentPlayerId) || null;
  }

  /**
   * Check if it is currently a specific player's turn.
   */
  public static isPlayerTurn(state: LudoGameState, playerId: string): boolean {
    if (!state || !playerId) return false;
    return state.currentPlayerId === playerId;
  }

  /**
   * Validate if a player is authorized to perform turn actions.
   */
  public static validatePlayerAction(
    state: LudoGameState,
    playerId: string
  ): { valid: boolean; reason?: string } {
    if (!state || !Array.isArray(state.players)) {
      return { valid: false, reason: 'Invalid game state' };
    }

    const player = state.players.find((p) => p.playerId === playerId);
    if (!player) {
      return { valid: false, reason: `Player ${playerId} does not exist in this game` };
    }

    if (!player.isConnected) {
      return { valid: false, reason: `Player ${playerId} is disconnected` };
    }

    if (state.currentPlayerId !== playerId) {
      return { valid: false, reason: `It is not player ${playerId}'s turn` };
    }

    return { valid: true };
  }

  /**
   * Determine the next player in sequence for 2, 3, or 4 players.
   */
  public static getNextPlayer(state: LudoGameState): LudoPlayer | null {
    if (!state || !Array.isArray(state.players) || state.players.length === 0) {
      return null;
    }

    const activePlayers = state.players.filter((p) => !p.isDisqualified);
    if (activePlayers.length === 0) {
      return state.players[0];
    }

    const currentIndex = state.players.findIndex((p) => p.playerId === state.currentPlayerId);
    if (currentIndex === -1) {
      return activePlayers[0] || state.players[0];
    }

    for (let i = 1; i <= state.players.length; i++) {
      const nextIndex = (currentIndex + i) % state.players.length;
      const candidate = state.players[nextIndex];
      if (candidate && !candidate.isDisqualified) {
        return candidate;
      }
    }

    return activePlayers[0] || state.players[0];
  }

  /**
   * Immutably advance turn to the next player.
   */
  public static advanceTurn(
    state: LudoGameState,
    nextPlayerId?: string,
    currentTime?: number
  ): LudoGameState {
    const timestamp = currentTime || Date.now();
    const nextPlayer = nextPlayerId
      ? state.players.find((p) => p.playerId === nextPlayerId) || LudoTurnService.getNextPlayer(state)
      : LudoTurnService.getNextPlayer(state);

    const targetPlayerId = nextPlayer ? nextPlayer.playerId : state.currentPlayerId;

    return {
      ...state,
      currentPlayerId: targetPlayerId,
      moveNumber: state.moveNumber + 1,
      turnNumber: (state.turnNumber || 1) + 1,
      diceValue: null,
      diceRolled: false,
      turnStartedAt: timestamp,
      turnTimeLimit: state.turnTimeLimit || DEFAULT_TURN_TIME_LIMIT_SECONDS,
      lastAction: {
        type: 'TURN_ADVANCED',
        playerId: targetPlayerId || undefined,
        timestamp,
      },
    };
  }

  /**
   * Configurable helper to check if dice roll grants an extra turn.
   */
  public static shouldGetExtraTurn(diceValue: number, extraTurnOnSix: boolean = true): boolean {
    return extraTurnOnSix && diceValue === 6;
  }

  /**
   * Calculate remaining turn time in seconds based on server timestamp.
   */
  public static getRemainingTurnTime(state: LudoGameState, now?: number): number {
    const currentTimestamp = now || Date.now();
    const turnStartedAt = state.turnStartedAt || currentTimestamp;
    const limitSeconds = state.turnTimeLimit || DEFAULT_TURN_TIME_LIMIT_SECONDS;
    const limitMs = limitSeconds * 1000;
    const elapsedMs = currentTimestamp - turnStartedAt;

    return Math.max(0, Math.ceil((limitMs - elapsedMs) / 1000));
  }

  /**
   * Detect if the current turn has expired based on server time.
   */
  public static isTurnExpired(state: LudoGameState, now?: number): boolean {
    return LudoTurnService.getRemainingTurnTime(state, now) <= 0;
  }
}

export default LudoTurnService;
