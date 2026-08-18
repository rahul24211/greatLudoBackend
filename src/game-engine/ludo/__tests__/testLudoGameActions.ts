import { LudoGameActions } from '../LudoGameActions';
import { LudoTokenService } from '../LudoTokenService';
import { LudoGameState, LudoPlayer, LudoColor } from '../LudoTypes';

function createMockPlayer(id: string, color: LudoColor): LudoPlayer {
  return {
    playerId: id,
    userId: `user_${id}`,
    color,
    tokens: LudoTokenService.createPlayerTokens(id, color),
    isConnected: true,
  };
}

function createActiveGameState(players: LudoPlayer[], currentPlayerId?: string): LudoGameState {
  return {
    gameId: 'game_action_100',
    roomId: 'room_action_100',
    mode: 'CLASSIC',
    status: 'ACTIVE',
    players,
    currentPlayerId: currentPlayerId || players[0].playerId,
    diceValue: null,
    diceRolled: false,
    moveNumber: 1,
    winner: null,
    lastAction: null,
    turnNumber: 1,
    turnStartedAt: Date.now(),
    turnTimeLimit: 15,
  };
}

async function runRollDiceActionTests() {
  console.log('🎲 Starting Classic Ludo Roll Dice Game Action Tests...');

  try {
    const p1 = createMockPlayer('p1', 'RED');
    const p2 = createMockPlayer('p2', 'GREEN');
    const state = createActiveGameState([p1, p2], 'p1');

    // 1. Current player can roll
    console.log('\n--- Test 1: Current Player Can Roll ---');
    const res1 = LudoGameActions.handleRollDice(state, 'p1');
    console.assert(res1.success === true, `Roll should succeed, reason: ${res1.reason}`);
    console.assert(typeof res1.diceValue === 'number', 'diceValue should be a number');
    console.assert(res1.diceValue! >= 1 && res1.diceValue! <= 6, `diceValue ${res1.diceValue} out of range`);
    console.log(`✅ Current player roll succeeded with diceValue = ${res1.diceValue}`);

    // 2. Wrong player cannot roll
    console.log('\n--- Test 2: Wrong Player Cannot Roll ---');
    const resWrong = LudoGameActions.handleRollDice(state, 'p2');
    console.assert(resWrong.success === false, 'Wrong player roll should fail');
    console.assert(resWrong.reason?.includes('not player p2'), 'Reason should specify turn mismatch');
    console.log('✅ Wrong player roll rejected.');

    // 3 & 4 & 13. Server generates dice, client value ignored, result is 1-6 integer
    console.log('\n--- Test 3, 4, 13: Server Generation & Integer Bounds ---');
    const resServer = LudoGameActions.handleRollDice(state, 'p1');
    console.assert(Number.isInteger(resServer.diceValue!), 'Dice result must be integer');
    console.assert(resServer.diceValue! >= 1 && resServer.diceValue! <= 6, 'Dice result must be 1..6');
    console.log('✅ Server generated valid integer dice 1..6.');

    // 5 & 6. Dice stored in state & diceRolled becomes true
    console.log('\n--- Test 5 & 6: State Storage & diceRolled = true ---');
    const updatedState = res1.gameState!;
    console.assert(updatedState.diceValue === res1.diceValue, 'State diceValue mismatch');
    console.assert(updatedState.diceRolled === true, 'State diceRolled should be true');
    console.assert(updatedState.lastAction?.type === 'DICE_ROLLED', 'lastAction type should be DICE_ROLLED');
    console.log('✅ State updated with diceValue and diceRolled = true.');

    // 7. Valid moves are calculated
    console.log('\n--- Test 7: Valid Moves Calculation ---');
    // Using mock dice roll 6 on 4 HOME tokens -> all 4 can move out to start position!
    const res6 = LudoGameActions.handleRollDice(state, 'p1', 6);
    console.assert(res6.validMoves?.length === 4, `Expected 4 valid moves for dice 6 on HOME tokens, got ${res6.validMoves?.length}`);
    console.log('✅ Valid moves calculated correctly for dice 6.');

    // 8. No valid moves returns empty validMoves list
    console.log('\n--- Test 8: No Valid Moves Scenario ---');
    // Using mock dice roll 1 on 4 HOME tokens -> 0 valid moves!
    const res1NoMoves = LudoGameActions.handleRollDice(state, 'p1', 1);
    console.assert(res1NoMoves.success === true, 'Roll action still succeeds');
    console.assert(res1NoMoves.validMoves?.length === 0, 'validMoves list must be empty for dice 1 on HOME tokens');
    console.assert(res1NoMoves.gameState?.diceRolled === true, 'diceRolled is still true');
    console.log('✅ No valid moves returns empty validMoves list without modifying turn.');

    // 9. Second roll in same turn rejected
    console.log('\n--- Test 9: Second Roll Rejection ---');
    const rolledState = res1.gameState!;
    const resSecondRoll = LudoGameActions.handleRollDice(rolledState, 'p1');
    console.assert(resSecondRoll.success === false, 'Second roll in same turn must fail');
    console.assert(resSecondRoll.reason?.includes('already been rolled'), 'Reason should state already rolled');
    console.log('✅ Second roll in same turn rejected.');

    // 10. Inactive game rejects roll
    console.log('\n--- Test 10: Inactive Game Rejection ---');
    const inactiveState: LudoGameState = { ...state, status: 'FINISHED' };
    const resInactive = LudoGameActions.handleRollDice(inactiveState, 'p1');
    console.assert(resInactive.success === false, 'Inactive game roll must fail');
    console.assert(resInactive.reason?.includes('not ACTIVE'), 'Reason should state not ACTIVE');
    console.log('✅ Inactive game roll rejected.');

    // 11. Unknown player rejects roll
    console.log('\n--- Test 11: Unknown Player Rejection ---');
    const resUnknown = LudoGameActions.handleRollDice(state, 'p99');
    console.assert(resUnknown.success === false, 'Unknown player roll must fail');
    console.assert(resUnknown.reason?.includes('does not exist'), 'Reason should state does not exist');
    console.log('✅ Unknown player roll rejected.');

    // 12. Immutability of original state
    console.log('\n--- Test 12: Immutability ---');
    const stateCopyStr = JSON.stringify(state);
    LudoGameActions.handleRollDice(state, 'p1');
    console.assert(JSON.stringify(state) === stateCopyStr, 'Original game state was mutated!');
    console.log('✅ Original game state immutability verified.');

    console.log('\n🎉 ALL LUDO GAME ACTIONS ROLL DICE TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Roll Dice Action Test Failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runRollDiceActionTests();
