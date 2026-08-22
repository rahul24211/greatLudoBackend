import { SnakeLadderColor } from './SnakeLadderTypes';

export const BOARD_SIZE = 100;
export const DEFAULT_TURN_TIME_LIMIT_SECONDS = 15;

/**
 * Authoritative Ladders Map: { [bottomTile]: topTile }
 */
export const LADDERS: Record<number, number> = {
  4: 14,
  9: 31,
  20: 38,
  28: 84,
  40: 59,
  51: 67,
  63: 81,
  71: 91,
};

/**
 * Authoritative Snakes Map: { [headTile]: tailTile }
 */
export const SNAKES: Record<number, number> = {
  17: 7,
  54: 34,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  99: 78,
};

export const SNAKE_LADDER_COLORS: SnakeLadderColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
