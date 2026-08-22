export type SnakeLadderColor = 'RED' | 'GREEN' | 'YELLOW' | 'BLUE';

export type SnakeLadderPlayerType = 'HUMAN' | 'BOT';

export type SnakeLadderGameStatus = 'WAITING' | 'ACTIVE' | 'FINISHED' | 'ABANDONED';

export interface SnakeLadderPlayer {
  playerId: string;
  userId: string;
  username: string;
  color: SnakeLadderColor;
  position: number; // 1 to 100
  isConnected: boolean;
  playerType: SnakeLadderPlayerType;
  missedTurns?: number;
  isDisqualified?: boolean;
}

export interface SnakeLadderSpecialMove {
  type: 'LADDER' | 'SNAKE';
  from: number;
  to: number;
}

export interface SnakeLadderMoveResult {
  valid: boolean;
  reason?: string;
  initialPosition: number;
  rolledSteps: number;
  intermediatePosition: number; // Before ladder/snake
  finalPosition: number; // After ladder/snake
  specialMove?: SnakeLadderSpecialMove;
  reachesGoal: boolean;
  extraTurn: boolean;
}

export interface SnakeLadderGameState {
  gameId: string;
  mode: 'SNAKE_LADDER';
  status: SnakeLadderGameStatus;
  players: SnakeLadderPlayer[];
  currentPlayerId: string | null;
  diceValue: number | null;
  diceRolled: boolean;
  turnNumber: number;
  turnStartedAt: number;
  turnTimeLimit: number;
  winner: string | null;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  lastAction?: {
    type: string;
    playerId?: string;
    payload?: any;
    timestamp: number;
  };
}

export interface SnakeLadderCreateGameOptions {
  gameId?: string;
  playerIds?: string[];
  usernames?: string[];
  colors?: SnakeLadderColor[];
  turnTimeLimit?: number;
}
