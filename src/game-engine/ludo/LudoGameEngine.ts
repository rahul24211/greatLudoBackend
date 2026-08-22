import {
  LudoGameState,
  LudoPlayer,
  LudoToken,
  LudoColor,
  LudoGameMode,
  LudoRollDiceActionResult,
  LudoMoveTokenActionResult,
  LudoValidMovesResult,
  LudoGameResult,
  LudoMoveResult,
} from './LudoTypes';
import { LUDO_COLORS } from './LudoConstants';
import { LudoTokenService } from './LudoTokenService';
import { LudoMovementService } from './LudoMovementService';
import { LudoValidMovesService } from './LudoValidMovesService';
import { LudoTurnService } from './LudoTurnService';
import { LudoGameActions } from './LudoGameActions';
import { LudoCaptureService } from './LudoCaptureService';
import { LudoTurnResolutionService } from './LudoTurnResolutionService';
import { LudoWinnerService } from './LudoWinnerService';
import { Ludo30MovesScoringService } from './Ludo30MovesScoringService';

export class LudoGameEngine {
  /**
   * Facade: Lock key generator helper for concurrency serialization.
   */
  public static getGameLockKey(gameId: string): string {
    return `ludo:lock:game:${gameId}`;
  }

  /**
   * Facade: Pure creation of a initial WAITING Ludo game state.
   */
  public static createGame(params?: {
    gameId?: string;
    roomId?: string;
    mode?: LudoGameMode;
    playerIds?: string[];
    colors?: LudoColor[];
    maxMovesPerPlayer?: number;
  }): LudoGameState {
    const gameId = params?.gameId || `game_${Date.now()}`;
    const roomId = params?.roomId || `room_${Date.now()}`;
    const mode = params?.mode || 'CLASSIC';
    const playerIds = params?.playerIds || ['p1', 'p2'];
    const colors = params?.colors || (LUDO_COLORS.slice(0, playerIds.length) as LudoColor[]);
    const is30Moves = mode === 'MOVES_30';
    const maxMoves = params?.maxMovesPerPlayer || (is30Moves ? 30 : undefined);

    const players: LudoPlayer[] = playerIds.map((pid, idx) => {
      const pColor = colors[idx] || LUDO_COLORS[idx % 4];
      const tokens = is30Moves
        ? LudoTokenService.create30MovesPlayerTokens(pid, pColor)
        : LudoTokenService.createPlayerTokens(pid, pColor);

      return {
        playerId: pid,
        userId: `user_${pid}`,
        color: pColor,
        tokens,
        isConnected: true,
        score: is30Moves ? 0 : undefined,
        movesRemaining: is30Moves ? maxMoves : undefined,
        movesUsed: is30Moves ? 0 : undefined,
      };
    });

    return {
      gameId,
      roomId,
      mode,
      status: 'WAITING',
      players,
      currentPlayerId: null,
      diceValue: null,
      diceRolled: false,
      moveNumber: 0,
      winner: null,
      maxMovesPerPlayer: maxMoves,
      lastAction: {
        type: 'GAME_CREATED',
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Facade: Pure server-side start game operation.
   */
  public static startGame(gameState: LudoGameState, currentTime?: number): LudoGameState {
    if (!gameState || !Array.isArray(gameState.players) || gameState.players.length < 2) {
      throw new Error('Cannot start game: Minimum 2 players required');
    }

    if (gameState.status !== 'WAITING') {
      throw new Error(`Cannot start game: Game status is ${gameState.status}, expected WAITING`);
    }

    const timestamp = currentTime || Date.now();
    const startingPlayer = LudoTurnService.selectStartingPlayer(gameState.players);

    return {
      ...gameState,
      status: 'ACTIVE',
      currentPlayerId: startingPlayer.playerId,
      diceValue: null,
      diceRolled: false,
      turnNumber: 1,
      turnStartedAt: timestamp,
      lastAction: {
        type: 'GAME_STARTED',
        playerId: startingPlayer.playerId,
        payload: { firstPlayerId: startingPlayer.playerId },
        timestamp,
      },
    };
  }

  /**
   * Facade: Orchestrate server-side Roll Dice action.
   */
  public static rollDice(
    gameState: LudoGameState,
    playerId: string,
    mockDiceValue?: number
  ): LudoRollDiceActionResult {
    if (gameState.status === 'FINISHED') {
      return { success: false, reason: 'Cannot roll dice: Game is already FINISHED' };
    }
    return LudoGameActions.handleRollDice(gameState, playerId, mockDiceValue);
  }

  /**
   * Facade: Orchestrate complete token movement, capture, winner, and turn resolution flow.
   */
  public static moveToken(
    gameState: LudoGameState,
    playerId: string,
    tokenId: string,
    currentTime?: number
  ): LudoMoveTokenActionResult {
    const timestamp = currentTime || Date.now();

    // 1. Verify game is ACTIVE
    if (!gameState || gameState.status !== 'ACTIVE') {
      return {
        success: false,
        reason: `Cannot move token: Game is ${gameState?.status || 'INVALID'}, expected ACTIVE`,
      };
    }

    // 2. Verify player's turn
    if (!LudoTurnService.isPlayerTurn(gameState, playerId)) {
      return { success: false, reason: `It is not player ${playerId}'s turn` };
    }

    // 3. Verify dice was rolled for current turn
    if (!gameState.diceRolled || typeof gameState.diceValue !== 'number') {
      return { success: false, reason: 'Dice has not been rolled for this turn' };
    }

    // 4. Find player and token
    const player = gameState.players.find((p) => p.playerId === playerId);
    if (!player) {
      return { success: false, reason: `Player ${playerId} does not exist in game` };
    }

    if (gameState.mode === 'MOVES_30' && typeof player.movesRemaining === 'number' && player.movesRemaining <= 0) {
      return { success: false, reason: `Player ${playerId} has exhausted all 30 moves` };
    }

    const token = player.tokens.find((t) => t.tokenId === tokenId);
    if (!token) {
      return { success: false, reason: `Token ${tokenId} does not belong to player ${playerId}` };
    }

    // 5. Calculate valid moves for player's tokens
    const validMovesRes = LudoValidMovesService.getValidMoves(
      player.tokens,
      playerId,
      player.color,
      gameState.diceValue
    );

    const validMove = validMovesRes.validMoves.find((m) => m.tokenId === tokenId);
    if (!validMove) {
      return {
        success: false,
        reason: `Token ${tokenId} cannot legally move for dice roll ${gameState.diceValue}`,
      };
    }

    // 6. Calculate movement destination
    const moveResult: LudoMoveResult = LudoMovementService.calculateMove(
      token,
      gameState.diceValue,
      player.color
    );

    if (!moveResult.valid || typeof moveResult.toPosition !== 'number') {
      return { success: false, reason: moveResult.reason || 'Invalid movement calculation' };
    }

    // 7. Apply token position update immutably
    const updatedToken: LudoToken = {
      ...token,
      position: moveResult.toPosition,
      state: moveResult.toCategory === 'FINISHED' ? 'FINISHED' : 'ACTIVE',
    };

    const updatedPlayerTokens = LudoTokenService.updateTokensList(player.tokens, updatedToken);

    // Rebuild players list with updated player tokens & apply 30-moves point scoring
    let tempPlayers = gameState.players.map((p) => {
      if (p.playerId === playerId) {
        if (gameState.mode === 'MOVES_30') {
          const stepsMoved = moveResult.stepsMoved || gameState.diceValue || 0;
          const reachesFinish = moveResult.toCategory === 'FINISHED';
          const { updatedPlayer } = Ludo30MovesScoringService.applyMoveScore(
            { ...p, tokens: updatedPlayerTokens },
            stepsMoved,
            reachesFinish
          );
          return updatedPlayer;
        }
        return { ...p, tokens: updatedPlayerTokens };
      }
      return { ...p };
    });

    // Collect all tokens across all players for capture calculation
    const allTokens = tempPlayers.flatMap((p) => p.tokens);

    // 8. Run capture detection via LudoCaptureService
    const captureResult = LudoCaptureService.applyCapture(
      updatedToken,
      allTokens,
      moveResult.toPosition
    );

    // If tokens were captured, update affected players' tokens in state & apply 30-moves capture scoring
    if (captureResult.captured) {
      const capturedMap = new Map(captureResult.updatedTokens.map((t) => [t.tokenId, t]));
      const hunterId = playerId;

      tempPlayers = tempPlayers.map((p) => {
        const playerTokens = p.tokens.map((t) => capturedMap.get(t.tokenId) || t);
        const capturedFromThisPlayer = p.tokens.filter((t) => captureResult.capturedTokenIds.includes(t.tokenId)).length;

        let updatedPlayerObj: LudoPlayer = { ...p, tokens: playerTokens };

        // If 30-moves mode, apply capture bonus to hunter and penalty to victim
        if (gameState.mode === 'MOVES_30' && capturedFromThisPlayer > 0) {
          if (p.playerId !== hunterId) {
            const hunter = tempPlayers.find((tp) => tp.playerId === hunterId) || p;
            const { updatedVictim } = Ludo30MovesScoringService.applyCaptureScore(
              hunter,
              updatedPlayerObj,
              capturedFromThisPlayer
            );
            updatedPlayerObj = updatedVictim;
          }
        }
        return updatedPlayerObj;
      });

      // Apply hunter bonus
      if (gameState.mode === 'MOVES_30') {
        const totalCaptured = captureResult.capturedTokenIds.length;
        tempPlayers = tempPlayers.map((p) => {
          if (p.playerId === hunterId) {
            return {
              ...p,
              score: (p.score ?? 0) + Ludo30MovesScoringService.BONUS_POINTS_CAPTURE * totalCaptured,
            };
          }
          return p;
        });
      }
    }

    // Build intermediate state with moved tokens & captures applied
    const stateWithMovedTokens: LudoGameState = {
      ...gameState,
      players: tempPlayers,
      lastAction: {
        type: 'TOKEN_MOVED',
        playerId,
        payload: {
          tokenId,
          fromPosition: moveResult.fromPosition,
          toPosition: moveResult.toPosition,
          capturedCount: captureResult.capturedTokenIds.length,
        },
        timestamp,
      },
    };

    // 9. Evaluate winner via LudoWinnerService
    const winnerEval = LudoWinnerService.evaluateAndApplyWinner(stateWithMovedTokens, timestamp);
    if (winnerEval.winnerFound) {
      return {
        success: true,
        isFinished: true,
        winnerId: winnerEval.gameResult.winnerId,
        moveResult,
        captureResult,
        gameState: winnerEval.updatedGameState,
      };
    }

    // 10. Resolve turn via LudoTurnResolutionService if game is not finished
    const turnResolution = LudoTurnResolutionService.resolveTurn(
      winnerEval.updatedGameState,
      playerId,
      gameState.diceValue,
      captureResult,
      undefined,
      timestamp
    );

    return {
      success: true,
      isFinished: false,
      moveResult,
      captureResult,
      turnResolution,
      gameState: turnResolution.updatedGameState,
    };
  }

  /**
   * Facade: Get valid moves for a player if dice rolled.
   */
  public static getValidMoves(gameState: LudoGameState, playerId: string): LudoValidMovesResult {
    const player = gameState?.players?.find((p) => p.playerId === playerId);
    if (!player || !gameState.diceRolled || typeof gameState.diceValue !== 'number') {
      return {
        valid: false,
        playerId,
        playerColor: player?.color || 'RED',
        diceValue: gameState?.diceValue || 0,
        validMoves: [],
        invalidMoves: [],
      };
    }

    return LudoValidMovesService.getValidMoves(
      player.tokens,
      playerId,
      player.color,
      gameState.diceValue
    );
  }

  /**
   * Facade: Check winner and get game result summary.
   */
  public static checkWinner(gameState: LudoGameState): LudoGameResult {
    return LudoWinnerService.getGameResult(gameState);
  }

  // --- Instance Wrapper Support (Maintains Backwards Compatibility) ---
  private state: LudoGameState;

  constructor(
    gameId: string,
    roomId: string,
    mode: LudoGameMode = 'CLASSIC',
    playerIds: string[] = ['p1', 'p2']
  ) {
    this.state = LudoGameEngine.createGame({ gameId, roomId, mode, playerIds });
  }

  public getState(): LudoGameState {
    return JSON.parse(JSON.stringify(this.state));
  }

  public startGame(): boolean {
    try {
      this.state = LudoGameEngine.startGame(this.state);
      return true;
    } catch {
      return false;
    }
  }

  public rollDice(playerId: string, mockDiceValue?: number): LudoRollDiceActionResult {
    const res = LudoGameEngine.rollDice(this.state, playerId, mockDiceValue);
    if (res.success && res.gameState) {
      this.state = res.gameState;
    }
    return res;
  }

  public moveToken(playerId: string, tokenId: string): LudoMoveTokenActionResult {
    const res = LudoGameEngine.moveToken(this.state, playerId, tokenId);
    if (res.success && res.gameState) {
      this.state = res.gameState;
    }
    return res;
  }
}

export default LudoGameEngine;
