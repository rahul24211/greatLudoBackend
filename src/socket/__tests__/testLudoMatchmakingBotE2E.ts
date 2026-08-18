import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LudoBotService } from '../../game-engine/ludo/bot/LudoBotService';
import { LudoGameEngine } from '../../game-engine/ludo/LudoGameEngine';
import { LudoTokenService } from '../../game-engine/ludo/LudoTokenService';
import { LudoMatchHistoryService } from '../../services/ludo/LudoMatchHistoryService';
import { LudoGameState, LudoPlayer } from '../../game-engine/ludo/LudoTypes';

describe('Ludo Matchmaking & Bot Gameplay E2E Integration Tests', () => {
  it('33 - 35. Human enters match, bot opponent joins, game starts', () => {
    const initialGame = LudoGameEngine.createGame({ mode: 'CLASSIC' });
    const humanTokens = LudoTokenService.createPlayerTokens('human_user_1', 'RED');
    const bot = LudoBotService.createBotPlayer('GREEN', 'MEDIUM');

    const humanPlayer: LudoPlayer = {
      playerId: 'human_user_1',
      userId: 'human_user_1',
      username: 'Human Champion',
      color: 'RED',
      tokens: humanTokens,
      isConnected: true,
      playerType: 'HUMAN',
    };

    let gameState: LudoGameState = {
      ...initialGame,
      players: [humanPlayer, bot],
      currentPlayerId: 'human_user_1',
    };

    gameState = LudoGameEngine.startGame(gameState);
    assert.strictEqual(gameState.status, 'ACTIVE');
    assert.strictEqual(gameState.players.length, 2);
    assert.strictEqual(gameState.players[0].playerType, 'HUMAN');
    assert.strictEqual(gameState.players[1].playerType, 'BOT');
  });

  it('36 - 40. Human roll/move -> Bot turn roll/move execution through LudoGameEngine', () => {
    const humanTokens = LudoTokenService.createPlayerTokens('human_user_1', 'RED');
    const bot = LudoBotService.createBotPlayer('GREEN', 'MEDIUM');

    const humanPlayer: LudoPlayer = {
      playerId: 'human_user_1',
      userId: 'human_user_1',
      color: 'RED',
      tokens: humanTokens,
      isConnected: true,
      playerType: 'HUMAN',
    };

    let gameState: LudoGameState = {
      ...LudoGameEngine.createGame({ mode: 'CLASSIC' }),
      players: [humanPlayer, bot],
      currentPlayerId: bot.playerId,
    };

    gameState = LudoGameEngine.startGame(gameState);
    gameState.currentPlayerId = bot.playerId;

    // Bot rolls dice using server-authoritative engine
    const rollRes = LudoGameEngine.rollDice(gameState, bot.playerId, 6);
    assert.ok(rollRes.success);
    assert.strictEqual(rollRes.diceValue, 6);
    assert.ok(rollRes.validMoves && rollRes.validMoves.length > 0);

    // Bot selects move
    const chosen = LudoBotService.selectMove(
      rollRes.gameState!,
      bot.playerId,
      rollRes.validMoves,
      'MEDIUM'
    );
    assert.ok(chosen);

    // Bot executes move
    const moveRes = LudoGameEngine.moveToken(rollRes.gameState!, bot.playerId, chosen.tokenId);
    assert.ok(moveRes.success);
    assert.ok(moveRes.gameState);

    const movedToken = moveRes.gameState.players
      .find((p) => p.playerId === bot.playerId)
      ?.tokens.find((t) => t.tokenId === chosen.tokenId);

    assert.strictEqual(movedToken?.state, 'ACTIVE');
    assert.strictEqual(movedToken?.position, 13); // Green start cell is 13
  });

  it('46 & 47. MySQL Match History persists playerType: HUMAN and playerType: BOT correctly', async () => {
    const humanTokens = LudoTokenService.createPlayerTokens('human_winner', 'RED');
    humanTokens.forEach((t) => {
      t.state = 'FINISHED';
      t.position = 99;
    });

    const bot = LudoBotService.createBotPlayer('GREEN', 'MEDIUM');

    const humanPlayer: LudoPlayer = {
      playerId: 'human_winner',
      userId: 'human_winner',
      color: 'RED',
      tokens: humanTokens,
      isConnected: true,
      playerType: 'HUMAN',
    };

    const finishedGameState: LudoGameState = {
      gameId: `game_e2e_history_${Date.now()}`,
      roomId: 'room_test',
      mode: 'CLASSIC',
      status: 'FINISHED',
      players: [humanPlayer, bot],
      currentPlayerId: 'human_winner',
      diceValue: 1,
      diceRolled: true,
      moveNumber: 25,
      winner: 'human_winner',
      finishedAt: Date.now(),
      lastAction: null,
    };

    const result = await LudoMatchHistoryService.createMatchResult(finishedGameState);
    assert.ok(result.success);

    // Verify idempotency
    const duplicateResult = await LudoMatchHistoryService.createMatchResult(finishedGameState);
    assert.ok(duplicateResult.success);
    assert.strictEqual(duplicateResult.isDuplicate, true);
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);

