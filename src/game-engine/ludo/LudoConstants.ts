import { LudoColor, LudoConfig } from './LudoTypes';

export const LUDO_COLORS: ReadonlyArray<LudoColor> = Object.freeze(['RED', 'GREEN', 'YELLOW', 'BLUE']);

export const TOTAL_MAIN_PATH_CELLS = 52;
export const HOME_PATH_LENGTH = 6;
export const TOKENS_PER_PLAYER = 4;

export const COLOR_START_POSITIONS: Readonly<Record<LudoColor, number>> = Object.freeze({
  RED: 0,
  GREEN: 13,
  YELLOW: 26,
  BLUE: 39,
});

export const COLOR_HOME_ENTRY_POSITIONS: Readonly<Record<LudoColor, number>> = Object.freeze({
  RED: 50,
  GREEN: 11,
  YELLOW: 24,
  BLUE: 37,
});

export const SAFE_CELLS: ReadonlyArray<number> = Object.freeze([0, 8, 13, 21, 26, 34, 39, 47]);

export const COLOR_HOME_PATHS: Readonly<Record<LudoColor, ReadonlyArray<number>>> = Object.freeze({
  RED: Object.freeze([0, 1, 2, 3, 4, 5]),
  GREEN: Object.freeze([0, 1, 2, 3, 4, 5]),
  YELLOW: Object.freeze([0, 1, 2, 3, 4, 5]),
  BLUE: Object.freeze([0, 1, 2, 3, 4, 5]),
});

export const DEFAULT_LUDO_CONFIG: Readonly<LudoConfig> = Object.freeze({
  players: 4,
  tokensPerPlayer: 4,
  turnTimeLimit: 15,
  extraTurnOnSix: true,
});
