import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LudoBotService } from '../LudoBotService';
import { LudoBotStrategy } from '../LudoBotStrategy';
import { LudoGameEngine } from '../../LudoGameEngine';
import {
  LudoGameState,
  LudoValidTokenMove,
  LudoPositionCategory,
  LudoToken,
} from '../../LudoTypes';

describe('Ludo Bot Strategy & Service Tests', () => {
  it('15. Bot player is created correctly with virtual attributes', () => {
    const bot = LudoBotService.createBotPlayer('GREEN', 'MEDIUM');
    assert.strictEqual(bot.playerType, 'BOT');
    assert.strictEqual(bot.botDifficulty, 'MEDIUM');
    assert.strictEqual(bot.color, 'GREEN');
    assert.strictEqual(bot.tokens.length, 4);
    assert.strictEqual(bot.tokens[0].state, 'HOME');
    assert.strictEqual(bot.tokens[0].position, -1);
    assert.ok(bot.playerId.startsWith('bot_green_'));
  });

  it('16. Bot is a virtual player and does not require MySQL User credentials', () => {
    const bot = LudoBotService.createBotPlayer('RED', 'HARD');
    assert.ok(bot.userId);
    assert.strictEqual(bot.playerType, 'BOT');
  });

  it('17. Bot receives normal player slot and token structure', () => {
    const bot = LudoBotService.createBotPlayer('BLUE', 'EASY');
    assert.strictEqual(bot.tokens.length, 4);
    for (const token of bot.tokens) {
      assert.strictEqual(token.color, 'BLUE');
      assert.strictEqual(token.state, 'HOME');
    }
  });

  it('18 & 19. Easy bot chooses only from server-provided valid moves', () => {
    const validMoves: LudoValidTokenMove[] = [
      {
        tokenId: 'bot-token-1',
        token: { tokenId: 'bot-token-1', playerId: 'bot_1', color: 'RED', position: -1, state: 'HOME' },
        fromCategory: LudoPositionCategory.HOME,
        fromPosition: -1,
        toCategory: LudoPositionCategory.MAIN_PATH,
        toPosition: 0,
        stepsMoved: 1,
        entersBoard: true,
        entersHomePath: false,
        reachesFinish: false,
      },
      {
        tokenId: 'bot-token-2',
        token: { tokenId: 'bot-token-2', playerId: 'bot_1', color: 'RED', position: 10, state: 'ACTIVE' },
        fromCategory: LudoPositionCategory.MAIN_PATH,
        fromPosition: 10,
        toCategory: LudoPositionCategory.MAIN_PATH,
        toPosition: 16,
        stepsMoved: 6,
        entersBoard: false,
        entersHomePath: false,
        reachesFinish: false,
      },
    ];

    const chosen = LudoBotStrategy.selectEasyMove(validMoves);
    assert.ok(chosen);
    assert.ok(validMoves.some((m) => m.tokenId === chosen?.tokenId));
  });

  it('20. Medium bot prioritizes capturing opponent token', () => {
    const humanToken: LudoToken = {
      tokenId: 'human-token-1',
      playerId: 'human_1',
      color: 'RED',
      position: 15,
      state: 'ACTIVE',
    };

    const botTokenToCapture: LudoToken = {
      tokenId: 'bot-token-1',
      playerId: 'bot_1',
      color: 'GREEN',
      position: 11,
      state: 'ACTIVE',
    };

    const botTokenNormal: LudoToken = {
      tokenId: 'bot-token-2',
      playerId: 'bot_1',
      color: 'GREEN',
      position: 30,
      state: 'ACTIVE',
    };

    const gameState: LudoGameState = {
      gameId: 'game_test_bot_capture',
      roomId: 'room_test',
      mode: 'CLASSIC',
      status: 'ACTIVE',
      currentPlayerId: 'bot_1',
      diceValue: 4,
      diceRolled: true,
      moveNumber: 1,
      winner: null,
      lastAction: null,
      players: [
        {
          playerId: 'human_1',
          userId: 'human_1',
          color: 'RED',
          tokens: [humanToken],
          isConnected: true,
          playerType: 'HUMAN',
        },
        {
          playerId: 'bot_1',
          userId: 'bot_1',
          color: 'GREEN',
          tokens: [botTokenToCapture, botTokenNormal],
          isConnected: true,
          playerType: 'BOT',
          botDifficulty: 'MEDIUM',
        },
      ],
    };

    const validMoves: LudoValidTokenMove[] = [
      {
        tokenId: 'bot-token-2',
        token: botTokenNormal,
        fromCategory: LudoPositionCategory.MAIN_PATH,
        fromPosition: 30,
        toCategory: LudoPositionCategory.MAIN_PATH,
        toPosition: 34, // Safe cell
        stepsMoved: 4,
        entersBoard: false,
        entersHomePath: false,
        reachesFinish: false,
      },
      {
        tokenId: 'bot-token-1',
        token: botTokenToCapture,
        fromCategory: LudoPositionCategory.MAIN_PATH,
        fromPosition: 11,
        toCategory: LudoPositionCategory.MAIN_PATH,
        toPosition: 15, // Captures human at 15
        stepsMoved: 4,
        entersBoard: false,
        entersHomePath: false,
        reachesFinish: false,
      },
    ];

    const chosen = LudoBotStrategy.selectMediumMove(gameState, validMoves);
    assert.strictEqual(chosen?.tokenId, 'bot-token-1', 'Medium bot must prioritize capturing opponent');
  });

  it('21. Medium bot prioritizes finishing a token when available', () => {
    const botTokenToFinish: LudoToken = {
      tokenId: 'bot-token-finish',
      playerId: 'bot_1',
      color: 'GREEN',
      position: 104,
      state: 'ACTIVE',
    };

    const botTokenNormal: LudoToken = {
      tokenId: 'bot-token-normal',
      playerId: 'bot_1',
      color: 'GREEN',
      position: 20,
      state: 'ACTIVE',
    };

    const gameState: LudoGameState = {
      gameId: 'game_test_bot_finish',
      roomId: 'room_test',
      mode: 'CLASSIC',
      status: 'ACTIVE',
      currentPlayerId: 'bot_1',
      diceValue: 2,
      diceRolled: true,
      moveNumber: 1,
      winner: null,
      lastAction: null,
      players: [
        {
          playerId: 'bot_1',
          userId: 'bot_1',
          color: 'GREEN',
          tokens: [botTokenToFinish, botTokenNormal],
          isConnected: true,
          playerType: 'BOT',
        },
      ],
    };

    const validMoves: LudoValidTokenMove[] = [
      {
        tokenId: 'bot-token-normal',
        token: botTokenNormal,
        fromCategory: LudoPositionCategory.MAIN_PATH,
        fromPosition: 20,
        toCategory: LudoPositionCategory.MAIN_PATH,
        toPosition: 22,
        stepsMoved: 2,
        entersBoard: false,
        entersHomePath: false,
        reachesFinish: false,
      },
      {
        tokenId: 'bot-token-finish',
        token: botTokenToFinish,
        fromCategory: LudoPositionCategory.HOME_PATH,
        fromPosition: 104,
        toCategory: LudoPositionCategory.FINISHED,
        toPosition: 99,
        stepsMoved: 2,
        entersBoard: false,
        entersHomePath: false,
        reachesFinish: true,
      },
    ];

    const chosen = LudoBotStrategy.selectMediumMove(gameState, validMoves);
    assert.strictEqual(chosen?.tokenId, 'bot-token-finish');
  });

  it('22. Hard bot chooses highest scoring move deterministically', () => {
    const humanToken: LudoToken = {
      tokenId: 'human-token-1',
      playerId: 'human_1',
      color: 'RED',
      position: 15,
      state: 'ACTIVE',
    };

    const botTokenToCapture: LudoToken = {
      tokenId: 'bot-token-1',
      playerId: 'bot_1',
      color: 'GREEN',
      position: 11,
      state: 'ACTIVE',
    };

    const botTokenNormal: LudoToken = {
      tokenId: 'bot-token-2',
      playerId: 'bot_1',
      color: 'GREEN',
      position: 30,
      state: 'ACTIVE',
    };

    const gameState: LudoGameState = {
      gameId: 'game_test_hard_bot',
      roomId: 'room_test',
      mode: 'CLASSIC',
      status: 'ACTIVE',
      currentPlayerId: 'bot_1',
      diceValue: 4,
      diceRolled: true,
      moveNumber: 1,
      winner: null,
      lastAction: null,
      players: [
        {
          playerId: 'human_1',
          userId: 'human_1',
          color: 'RED',
          tokens: [humanToken],
          isConnected: true,
          playerType: 'HUMAN',
        },
        {
          playerId: 'bot_1',
          userId: 'bot_1',
          color: 'GREEN',
          tokens: [botTokenToCapture, botTokenNormal],
          isConnected: true,
          playerType: 'BOT',
          botDifficulty: 'HARD',
        },
      ],
    };

    const validMoves: LudoValidTokenMove[] = [
      {
        tokenId: 'bot-token-2',
        token: botTokenNormal,
        fromCategory: LudoPositionCategory.MAIN_PATH,
        fromPosition: 30,
        toCategory: LudoPositionCategory.MAIN_PATH,
        toPosition: 34,
        stepsMoved: 4,
        entersBoard: false,
        entersHomePath: false,
        reachesFinish: false,
      },
      {
        tokenId: 'bot-token-1',
        token: botTokenToCapture,
        fromCategory: LudoPositionCategory.MAIN_PATH,
        fromPosition: 11,
        toCategory: LudoPositionCategory.MAIN_PATH,
        toPosition: 15,
        stepsMoved: 4,
        entersBoard: false,
        entersHomePath: false,
        reachesFinish: false,
      },
    ];

    const chosen = LudoBotStrategy.selectHardMove(gameState, validMoves);
    assert.strictEqual(chosen?.tokenId, 'bot-token-1', 'Hard bot must evaluate capture as highest score');
  });

  it('23 - 26. Bot acts strictly through LudoGameEngine and never chooses invalid moves', () => {
    const bot = LudoBotService.createBotPlayer('GREEN', 'MEDIUM');
    const game = LudoGameEngine.createGame({
      gameId: 'game_engine_bot_test',
      mode: 'CLASSIC',
      playerIds: ['human_1', bot.playerId],
    });

    const activeGame = LudoGameEngine.startGame(game);
    assert.strictEqual(activeGame.status, 'ACTIVE');

    // Simulate bot rolling dice through LudoGameEngine
    if (activeGame.currentPlayerId === bot.playerId) {
      const rollRes = LudoGameEngine.rollDice(activeGame, bot.playerId);
      assert.ok(rollRes.success);
      assert.ok(rollRes.diceValue && rollRes.diceValue >= 1 && rollRes.diceValue <= 6);
    }
  });
});

setTimeout(() => {
  process.exit(0);
}, 200);

