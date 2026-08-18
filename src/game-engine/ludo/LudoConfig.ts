import { LudoConfig } from './LudoTypes';
import { DEFAULT_LUDO_CONFIG } from './LudoConstants';

export function createLudoConfig(customOptions?: Partial<LudoConfig>): LudoConfig {
  return {
    players: customOptions?.players ?? DEFAULT_LUDO_CONFIG.players,
    tokensPerPlayer: customOptions?.tokensPerPlayer ?? DEFAULT_LUDO_CONFIG.tokensPerPlayer,
    turnTimeLimit: customOptions?.turnTimeLimit ?? DEFAULT_LUDO_CONFIG.turnTimeLimit,
    extraTurnOnSix: customOptions?.extraTurnOnSix ?? DEFAULT_LUDO_CONFIG.extraTurnOnSix,
  };
}
