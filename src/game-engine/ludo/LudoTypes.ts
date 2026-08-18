export type LudoColor = 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';

export type LudoTokenState = 'HOME' | 'ACTIVE' | 'FINISHED';

export type LudoGameStatus = 'WAITING' | 'ACTIVE' | 'FINISHED';

export type LudoGameMode = 'CLASSIC' | 'QUICK' | 'TEAM' | string;

export enum LudoPositionCategory {
  HOME = 'HOME',
  MAIN_PATH = 'MAIN_PATH',
  HOME_PATH = 'HOME_PATH',
  FINISHED = 'FINISHED',
}

export interface LudoPositionModel {
  category: LudoPositionCategory;
  index: number;
  color?: LudoColor;
}

export interface LudoToken {
  tokenId: string;
  playerId: string;
  color: LudoColor;
  position: number;
  state: LudoTokenState;
}

export interface LudoMoveResult {
  valid: boolean;
  reason?: string;
  token: LudoToken;
  diceValue: number;
  fromCategory: LudoPositionCategory;
  fromPosition: number;
  toCategory?: LudoPositionCategory;
  toPosition?: number;
  stepsMoved?: number;
  entersBoard?: boolean;
  entersHomePath?: boolean;
  reachesFinish?: boolean;
}

export interface LudoValidTokenMove {
  tokenId: string;
  token: LudoToken;
  fromCategory: LudoPositionCategory;
  fromPosition: number;
  toCategory: LudoPositionCategory;
  toPosition: number;
  stepsMoved: number;
  entersBoard: boolean;
  entersHomePath: boolean;
  reachesFinish: boolean;
}

export interface LudoInvalidTokenMove {
  tokenId: string;
  token: LudoToken;
  reason: string;
}

export interface LudoValidMovesResult {
  valid: boolean;
  playerId: string;
  playerColor: LudoColor;
  diceValue: number;
  validMoves: LudoValidTokenMove[];
  invalidMoves: LudoInvalidTokenMove[];
}

export interface LudoRollDiceActionResult {
  success: boolean;
  reason?: string;
  diceValue?: number;
  validMoves?: LudoValidTokenMove[];
  invalidMoves?: LudoInvalidTokenMove[];
  gameState?: LudoGameState;
}

export interface LudoCaptureResult {
  captured: boolean;
  capturedTokenIds: string[];
  capturingTokenId: string;
  position: number;
  updatedTokens: LudoToken[];
}

export type LudoTurnResolutionReason = 'SIX' | 'CAPTURE' | 'NORMAL_MOVE';

export interface LudoTurnResolutionResult {
  reason: LudoTurnResolutionReason;
  extraTurn: boolean;
  nextPlayerId: string;
  updatedGameState: LudoGameState;
}

export interface LudoMoveTokenActionResult {
  success: boolean;
  reason?: string;
  isFinished?: boolean;
  winnerId?: string | null;
  moveResult?: LudoMoveResult;
  captureResult?: LudoCaptureResult;
  turnResolution?: LudoTurnResolutionResult;
  gameState?: LudoGameState;
}

export interface LudoGameResult {
  status: LudoGameStatus;
  winnerId: string | null;
  winnerColor: LudoColor | null;
  finishedAt: number | null;
  reason: string;
}

export type LudoPlayerType = 'HUMAN' | 'BOT';
export type LudoBotDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface LudoPlayer {
  playerId: string;
  userId: string;
  username?: string;
  color: LudoColor;
  tokens: LudoToken[];
  isConnected: boolean;
  missedTurns?: number;
  isDisqualified?: boolean;
  playerType?: LudoPlayerType;
  botDifficulty?: LudoBotDifficulty;
}

export interface LudoLastAction {
  type: string;
  playerId?: string;
  payload?: Record<string, any>;
  timestamp: number;
}

export interface LudoGameState {
  gameId: string;
  roomId: string;
  mode: LudoGameMode;
  status: LudoGameStatus;
  players: LudoPlayer[];
  currentPlayerId: string | null;
  diceValue: number | null;
  diceRolled: boolean;
  moveNumber: number;
  winner: string | null;
  lastAction: LudoLastAction | null;
  turnNumber?: number;
  turnStartedAt?: number;
  turnTimeLimit?: number;
  finishedAt?: number;
}

export interface LudoConfig {
  players: number;
  tokensPerPlayer: number;
  turnTimeLimit: number;
  extraTurnOnSix: boolean;
}
