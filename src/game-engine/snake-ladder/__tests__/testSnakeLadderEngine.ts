import test from 'node:test';
import assert from 'node:assert/strict';
import { SnakeLadderEngine } from '../SnakeLadderEngine';

test('Snake & Ladder Engine Unit Tests', async (t) => {
  await t.test('1. Initial Game Setup', () => {
    const game = SnakeLadderEngine.createGame({
      playerIds: ['p1', 'p2'],
      usernames: ['Alice', 'Bob'],
      colors: ['RED', 'GREEN'],
    });

    assert.equal(game.mode, 'SNAKE_LADDER');
    assert.equal(game.status, 'WAITING');
    assert.equal(game.players.length, 2);
    assert.equal(game.players[0].position, 1);
    assert.equal(game.players[1].position, 1);
    assert.equal(game.winner, null);
  });

  await t.test('2. Normal Dice Roll & Token Movement', () => {
    const game = SnakeLadderEngine.startGame(
      SnakeLadderEngine.createGame({ playerIds: ['p1', 'p2'] })
    );

    // Roll a 2
    const rollRes = SnakeLadderEngine.rollDice(game, 'p1', 2);
    assert.ok(rollRes.success);
    assert.equal(rollRes.diceValue, 2);

    // Move token (1 + 2 = 3)
    const moveRes = SnakeLadderEngine.moveToken(rollRes.gameState!, 'p1');
    assert.ok(moveRes.success);
    assert.equal(moveRes.moveResult?.finalPosition, 3);
    assert.equal(moveRes.isFinished, false);
    assert.equal(moveRes.gameState?.currentPlayerId, 'p2'); // Turn passed to p2
  });

  await t.test('3. Ladder Climbing & Bonus Turn', () => {
    const game = SnakeLadderEngine.startGame(
      SnakeLadderEngine.createGame({ playerIds: ['p1', 'p2'] })
    );

    // Roll 3 from position 1 -> lands on 4 (Ladder bottom, goes to 14)
    const rollRes = SnakeLadderEngine.rollDice(game, 'p1', 3);
    const moveRes = SnakeLadderEngine.moveToken(rollRes.gameState!, 'p1');

    assert.ok(moveRes.success);
    assert.equal(moveRes.moveResult?.intermediatePosition, 4);
    assert.equal(moveRes.moveResult?.finalPosition, 14);
    assert.equal(moveRes.moveResult?.specialMove?.type, 'LADDER');
    assert.equal(moveRes.moveResult?.extraTurn, true);
    assert.equal(moveRes.gameState?.currentPlayerId, 'p1'); // p1 gets extra turn!
  });

  await t.test('4. Snake Bite Descent', () => {
    const game = SnakeLadderEngine.startGame(
      SnakeLadderEngine.createGame({ playerIds: ['p1', 'p2'] })
    );

    // Set p1 position to 12
    game.players[0].position = 12;

    // Roll 5 -> lands on 17 (Snake head, slides to 7)
    const rollRes = SnakeLadderEngine.rollDice(game, 'p1', 5);
    const moveRes = SnakeLadderEngine.moveToken(rollRes.gameState!, 'p1');

    assert.ok(moveRes.success);
    assert.equal(moveRes.moveResult?.intermediatePosition, 17);
    assert.equal(moveRes.moveResult?.finalPosition, 7);
    assert.equal(moveRes.moveResult?.specialMove?.type, 'SNAKE');
  });

  await t.test('5. Exact 100 Win Condition & Overshoot Handling', () => {
    const game = SnakeLadderEngine.startGame(
      SnakeLadderEngine.createGame({ playerIds: ['p1', 'p2'] })
    );

    // Set p1 at 97
    game.players[0].position = 97;

    // Roll 5 (97 + 5 = 102 > 100) -> should bounce/remain at 97
    const rollOvershoot = SnakeLadderEngine.rollDice(game, 'p1', 5);
    const moveOvershoot = SnakeLadderEngine.moveToken(rollOvershoot.gameState!, 'p1');
    assert.equal(moveOvershoot.moveResult?.finalPosition, 97);
    assert.equal(moveOvershoot.isFinished, false);

    // Now roll exact 3 (97 + 3 = 100) -> Player wins!
    const activeGameP1 = {
      ...moveOvershoot.gameState!,
      currentPlayerId: 'p1',
      diceRolled: false,
    };
    const rollExact = SnakeLadderEngine.rollDice(activeGameP1, 'p1', 3);
    const moveExact = SnakeLadderEngine.moveToken(rollExact.gameState!, 'p1');

    assert.ok(moveExact.success);
    assert.equal(moveExact.moveResult?.finalPosition, 100);
    assert.equal(moveExact.isFinished, true);
    assert.equal(moveExact.winnerId, 'p1');
    assert.equal(moveExact.gameState?.status, 'FINISHED');
  });
});
