import crypto from 'crypto';
import {
  SnakeLadderGameState,
  SnakeLadderPlayer,
  SnakeLadderMoveResult,
  SnakeLadderCreateGameOptions,
  SnakeLadderColor,
} from './SnakeLadderTypes';
import {
  BOARD_SIZE,
  LADDERS,
  SNAKES,
  SNAKE_LADDER_COLORS,
  DEFAULT_TURN_TIME_LIMIT_SECONDS,
} from './SnakeLadderConstants';

export class SnakeLadderEngine {
  /**
   * Generates a unique lock key for Redis distributed synchronization.
   */
  public static getGameLockKey(gameId: string): string {
    return `lock:snake_ladder:game:${gameId}`;
  }

  /**
   * Initializes a new Snake & Ladder game state.
   */
  public static createGame(options?: SnakeLadderCreateGameOptions): SnakeLadderGameState {
    const gameId = options?.gameId || `sl_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const playerIds = options?.playerIds || ['player_red', 'player_green'];
    const usernames = options?.usernames || [];
    const colors: SnakeLadderColor[] = options?.colors || SNAKE_LADDER_COLORS.slice(0, playerIds.length);

    const players: SnakeLadderPlayer[] = playerIds.map((pid, idx) => {
      const color = colors[idx] || SNAKE_LADDER_COLORS[idx % SNAKE_LADDER_COLORS.length];
      const isBot = pid.startsWith('bot_');

      return {
        playerId: pid,
        userId: pid,
        username: usernames[idx] || (isBot ? 'Bot Player' : `Player ${idx + 1}`),
        color,
        position: 1, // All players start at Tile 1
        isConnected: true,
        playerType: isBot ? 'BOT' : 'HUMAN',
        missedTurns: 0,
        isDisqualified: false,
      };
    });

    return {
      gameId,
      mode: 'SNAKE_LADDER',
      status: 'WAITING',
      players,
      currentPlayerId: players[0]?.playerId || null,
      diceValue: null,
      diceRolled: false,
      turnNumber: 1,
      turnStartedAt: Date.now(),
      turnTimeLimit: options?.turnTimeLimit || DEFAULT_TURN_TIME_LIMIT_SECONDS,
      winner: null,
      createdAt: Date.now(),
    };
  }

  /**
   * Starts an active game match.
   */
  public static startGame(state: SnakeLadderGameState): SnakeLadderGameState {
    return {
      ...state,
      status: 'ACTIVE',
      currentPlayerId: state.players[0]?.playerId || null,
      diceValue: null,
      diceRolled: false,
      turnNumber: 1,
      turnStartedAt: Date.now(),
      startedAt: Date.now(),
      lastAction: {
        type: 'GAME_STARTED',
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Server-authoritative dice roll (1 to 6).
   */
  public static rollDice(
    state: SnakeLadderGameState,
    playerId: string,
    forcedValue?: number
  ): { success: boolean; diceValue?: number; gameState?: SnakeLadderGameState; reason?: string } {
    if (state.status !== 'ACTIVE') {
      return { success: false, reason: `Game is not ACTIVE (current: ${state.status})` };
    }

    if (state.currentPlayerId !== playerId) {
      return { success: false, reason: `It is not player ${playerId}'s turn` };
    }

    if (state.diceRolled) {
      return { success: false, reason: 'Dice has already been rolled for this turn' };
    }

    const diceValue =
      typeof forcedValue === 'number' && forcedValue >= 1 && forcedValue <= 6
        ? forcedValue
        : crypto.randomInt(1, 7);

    const updatedState: SnakeLadderGameState = {
      ...state,
      diceValue,
      diceRolled: true,
      lastAction: {
        type: 'DICE_ROLLED',
        playerId,
        payload: { diceValue },
        timestamp: Date.now(),
      },
    };

    return {
      success: true,
      diceValue,
      gameState: updatedState,
    };
  }

  /**
   * Moves a player token according to the dice roll, applying ladders, snakes, and goal conditions.
   */
  public static moveToken(
    state: SnakeLadderGameState,
    playerId: string
  ): {
    success: boolean;
    moveResult?: SnakeLadderMoveResult;
    gameState?: SnakeLadderGameState;
    isFinished?: boolean;
    winnerId?: string | null;
    reason?: string;
  } {
    if (state.status !== 'ACTIVE') {
      return { success: false, reason: `Game is not ACTIVE` };
    }

    if (state.currentPlayerId !== playerId) {
      return { success: false, reason: `It is not player ${playerId}'s turn` };
    }

    if (!state.diceRolled || typeof state.diceValue !== 'number') {
      return { success: false, reason: 'Dice has not been rolled for this turn' };
    }

    const playerIndex = state.players.findIndex((p) => p.playerId === playerId);
    if (playerIndex === -1) {
      return { success: false, reason: `Player ${playerId} not found` };
    }

    const player = state.players[playerIndex];
    const initialPosition = player.position || 1;
    const rolledSteps = state.diceValue;
    const intermediatePosition = initialPosition + rolledSteps;

    let finalPosition = initialPosition;
    let specialMove: SnakeLadderMoveResult['specialMove'] = undefined;
    let reachesGoal = false;
    let extraTurn = rolledSteps === 6;

    // Check bounds (must land <= 100)
    if (intermediatePosition <= BOARD_SIZE) {
      finalPosition = intermediatePosition;

      // Check for Ladder Climb
      if (LADDERS[intermediatePosition]) {
        const ladderTarget = LADDERS[intermediatePosition];
        specialMove = {
          type: 'LADDER',
          from: intermediatePosition,
          to: ladderTarget,
        };
        finalPosition = ladderTarget;
        extraTurn = true; // Bonus extra turn on climbing ladder!
      }
      // Check for Snake Bite
      else if (SNAKES[intermediatePosition]) {
        const snakeTarget = SNAKES[intermediatePosition];
        specialMove = {
          type: 'SNAKE',
          from: intermediatePosition,
          to: snakeTarget,
        };
        finalPosition = snakeTarget;
      }

      if (finalPosition === BOARD_SIZE) {
        reachesGoal = true;
      }
    } else {
      // Overshot Tile 100 -> remain at initial position (no movement)
      finalPosition = initialPosition;
    }

    const moveResult: SnakeLadderMoveResult = {
      valid: true,
      initialPosition,
      rolledSteps,
      intermediatePosition,
      finalPosition,
      specialMove,
      reachesGoal,
      extraTurn,
    };

    // Update Player position
    const updatedPlayers = state.players.map((p, idx) => {
      if (idx === playerIndex) {
        return {
          ...p,
          position: finalPosition,
          missedTurns: 0,
        };
      }
      return { ...p };
    });

    if (reachesGoal) {
      // Player won the game!
      const finalState: SnakeLadderGameState = {
        ...state,
        status: 'FINISHED',
        players: updatedPlayers,
        winner: playerId,
        finishedAt: Date.now(),
        lastAction: {
          type: 'GAME_FINISHED',
          playerId,
          payload: { winnerId: playerId, moveResult },
          timestamp: Date.now(),
        },
      };

      return {
        success: true,
        moveResult,
        gameState: finalState,
        isFinished: true,
        winnerId: playerId,
      };
    }

    // Determine Next Turn
    let nextPlayerId = state.currentPlayerId;
    let nextTurnNumber = state.turnNumber;

    if (!extraTurn) {
      const activePlayers = updatedPlayers.filter((p) => !p.isDisqualified);
      const currentActiveIndex = activePlayers.findIndex((p) => p.playerId === playerId);
      const nextActivePlayer = activePlayers[(currentActiveIndex + 1) % activePlayers.length];
      nextPlayerId = nextActivePlayer ? nextActivePlayer.playerId : playerId;
      nextTurnNumber = state.turnNumber + 1;
    }

    const updatedState: SnakeLadderGameState = {
      ...state,
      players: updatedPlayers,
      currentPlayerId: nextPlayerId,
      diceValue: null,
      diceRolled: false,
      turnNumber: nextTurnNumber,
      turnStartedAt: Date.now(),
      lastAction: {
        type: 'TOKEN_MOVED',
        playerId,
        payload: { moveResult, extraTurn },
        timestamp: Date.now(),
      },
    };

    return {
      success: true,
      moveResult,
      gameState: updatedState,
      isFinished: false,
      winnerId: null,
    };
  }
}
