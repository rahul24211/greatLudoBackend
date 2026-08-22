import test from 'node:test';
import assert from 'node:assert/strict';
import { LudoGameEngine } from '../LudoGameEngine';
import { Ludo30MovesScoringService } from '../Ludo30MovesScoringService';
import { LudoWinnerService } from '../LudoWinnerService';
import { LudoGameState } from '../LudoTypes';

test('30-Moves Skill Ludo Mode Engine & Scoring Tests', async (t) => {
  await t.test('1. Tokens start unlocked and ACTIVE on track for MOVES_30 mode', () => {
    const game = LudoGameEngine.createGame({
      mode: 'MOVES_30',
      playerIds: ['player_red', 'player_green'],
      colors: ['RED', 'GREEN'],
    });

    assert.equal(game.mode, 'MOVES_30');
    assert.equal(game.maxMovesPerPlayer, 30);
    assert.equal(game.players.length, 2);

    const redPlayer = game.players[0];
    assert.equal(redPlayer.score, 0);
    assert.equal(redPlayer.movesRemaining, 30);
    assert.equal(redPlayer.movesUsed, 0);
    assert.equal(redPlayer.tokens.length, 4);

    // All Red tokens start ACTIVE at Red start square (position 0)
    assert.ok(redPlayer.tokens.every((tok) => tok.state === 'ACTIVE' && tok.position === 0));

    const greenPlayer = game.players[1];
    assert.equal(greenPlayer.score, 0);
    assert.equal(greenPlayer.movesRemaining, 30);
    // All Green tokens start ACTIVE at Green start square (position 13)
    assert.ok(greenPlayer.tokens.every((tok) => tok.state === 'ACTIVE' && tok.position === 13));
  });

  await t.test('2. Point calculation on token movement (+1 per step)', () => {
    const game = LudoGameEngine.createGame({
      mode: 'MOVES_30',
      playerIds: ['p1', 'p2'],
      colors: ['RED', 'GREEN'],
    });

    const activeGame = LudoGameEngine.startGame(game);
    const currPlayerId = activeGame.currentPlayerId!;
    const currPlayer = activeGame.players.find((p) => p.playerId === currPlayerId)!;
    const tokenToMove = currPlayer.tokens[0].tokenId;

    // Roll a 4
    const rollRes = LudoGameEngine.rollDice(activeGame, currPlayerId, 4);
    assert.ok(rollRes.success);
    assert.equal(rollRes.diceValue, 4);
    assert.ok(rollRes.gameState);

    // Move token using updated state from roll
    const moveRes = LudoGameEngine.moveToken(rollRes.gameState!, currPlayerId, tokenToMove);
    assert.ok(moveRes.success);
    assert.equal(moveRes.isFinished, false);
    assert.equal(moveRes.gameState!.status, 'ACTIVE');
    assert.equal(moveRes.gameState!.winner, null);

    const updatedPlayer = moveRes.gameState!.players.find((p) => p.playerId === currPlayerId)!;
    // Score should be +4 points
    assert.equal(updatedPlayer.score, 4);
    // Moves remaining should decrement from 30 to 29
    assert.equal(updatedPlayer.movesRemaining, 29);
    assert.equal(updatedPlayer.movesUsed, 1);
  });

  await t.test('3. Capture scoring: +20 points for hunter, -20 points for victim', () => {
    const p1 = {
      playerId: 'hunter',
      userId: 'hunter',
      color: 'RED' as const,
      tokens: [
        { tokenId: 'hunter_1', playerId: 'hunter', color: 'RED' as const, state: 'ACTIVE' as const, position: 20 },
      ],
      isConnected: true,
      score: 50,
      movesRemaining: 25,
      movesUsed: 5,
    };

    const p2 = {
      playerId: 'victim',
      userId: 'victim',
      color: 'GREEN' as const,
      tokens: [
        { tokenId: 'victim_1', playerId: 'victim', color: 'GREEN' as const, state: 'ACTIVE' as const, position: 20 },
      ],
      isConnected: true,
      score: 40,
      movesRemaining: 25,
      movesUsed: 5,
    };

    const { updatedHunter, updatedVictim, hunterBonus, victimPenalty } =
      Ludo30MovesScoringService.applyCaptureScore(p1, p2, 1);

    assert.equal(hunterBonus, 20);
    assert.equal(victimPenalty, 20);
    assert.equal(updatedHunter.score, 70); // 50 + 20
    assert.equal(updatedVictim.score, 20); // 40 - 20
  });

  await t.test('4. Home arrival scoring (+56 bonus points)', () => {
    const p1 = {
      playerId: 'p1',
      userId: 'p1',
      color: 'RED' as const,
      tokens: [],
      isConnected: true,
      score: 100,
      movesRemaining: 15,
      movesUsed: 15,
    };

    const { updatedPlayer, pointsGained } = Ludo30MovesScoringService.applyMoveScore(p1, 2, true);

    // 2 steps + 56 bonus = 58 points
    assert.equal(pointsGained, 58);
    assert.equal(updatedPlayer.score, 158);
    assert.equal(updatedPlayer.movesRemaining, 14);
    assert.equal(updatedPlayer.movesUsed, 16);
  });

  await t.test('5. Winner evaluation when 30 moves are exhausted (highest score wins)', () => {
    const gameState: LudoGameState = {
      gameId: 'game_test_moves',
      roomId: 'room_test',
      mode: 'MOVES_30',
      status: 'ACTIVE',
      diceValue: null,
      diceRolled: false,
      moveNumber: 60,
      winner: null,
      currentPlayerId: 'p2',
      maxMovesPerPlayer: 30,
      lastAction: null,
      players: [
        {
          playerId: 'p1',
          userId: 'p1',
          color: 'RED',
          tokens: [],
          isConnected: true,
          score: 185,
          movesRemaining: 0,
          movesUsed: 30,
        },
        {
          playerId: 'p2',
          userId: 'p2',
          color: 'GREEN',
          tokens: [],
          isConnected: true,
          score: 142,
          movesRemaining: 0,
          movesUsed: 30,
        },
      ],
    };

    assert.ok(LudoWinnerService.isGameFinished(gameState));
    const winner = LudoWinnerService.getWinner(gameState);
    assert.ok(winner);
    assert.equal(winner.playerId, 'p1'); // p1 has 185 > p2 has 142
  });
});
