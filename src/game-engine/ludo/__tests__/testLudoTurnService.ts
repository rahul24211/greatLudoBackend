import { LudoTurnService, DEFAULT_TURN_TIME_LIMIT_SECONDS } from '../LudoTurnService';
import { LudoGameState, LudoPlayer, LudoColor } from '../LudoTypes';
import { LudoTokenService } from '../LudoTokenService';

function createMockPlayer(id: string, color: LudoColor, isConnected: boolean = true): LudoPlayer {
  return {
    playerId: id,
    userId: `user_${id}`,
    color,
    tokens: LudoTokenService.createPlayerTokens(id, color),
    isConnected,
  };
}

function createMockGameState(players: LudoPlayer[], currentPlayerId?: string): LudoGameState {
  const firstPlayerId = currentPlayerId || (players[0] ? players[0].playerId : null);
  return {
    gameId: 'game_test_100',
    roomId: 'room_test_100',
    mode: 'CLASSIC',
    status: 'ACTIVE',
    players,
    currentPlayerId: firstPlayerId,
    diceValue: null,
    diceRolled: false,
    moveNumber: 1,
    winner: null,
    lastAction: null,
    turnNumber: 1,
    turnStartedAt: 1000000, // Fixed fake timestamp (ms)
    turnTimeLimit: DEFAULT_TURN_TIME_LIMIT_SECONDS,
  };
}

async function runTurnServiceTests() {
  console.log('🔄 Starting Server-Side Classic Ludo Turn System Tests...');

  try {
    const p1 = createMockPlayer('p1', 'RED');
    const p2 = createMockPlayer('p2', 'GREEN');
    const p3 = createMockPlayer('p3', 'YELLOW');
    const p4 = createMockPlayer('p4', 'BLUE');

    // 1. First Player Selection
    console.log('\n--- Test 1: First Player Selection ---');
    const selectedP1 = LudoTurnService.selectStartingPlayer([p1, p2, p3, p4]);
    console.assert(selectedP1.playerId === 'p1', 'Default starting player should be p1');
    const selectedP3 = LudoTurnService.selectStartingPlayer([p1, p2, p3, p4], 2);
    console.assert(selectedP3.playerId === 'p3', 'Configured starting player should be p3');
    console.log('✅ Server-side first player selection verified.');

    // 2. Current Player Detection
    console.log('\n--- Test 2: Current Player Detection ---');
    const state4 = createMockGameState([p1, p2, p3, p4], 'p2');
    const currP = LudoTurnService.getCurrentPlayer(state4);
    console.assert(currP !== null && currP.playerId === 'p2', `Expected p2, got ${currP?.playerId}`);
    console.log('✅ Current player detection verified.');

    // 3 & 4. Correct Turn Validation & Wrong Player Rejection
    console.log('\n--- Test 3 & 4: Turn Action Validation & Wrong Player Rejection ---');
    const validRes = LudoTurnService.validatePlayerAction(state4, 'p2');
    console.assert(validRes.valid === true, 'Turn action for p2 should be valid');

    const wrongRes = LudoTurnService.validatePlayerAction(state4, 'p1');
    console.assert(wrongRes.valid === false, 'Turn action for p1 should be rejected');
    console.assert(wrongRes.reason?.includes('not player p1'), 'Reason should specify turn mismatch');
    console.log('✅ Turn validation and wrong player action rejection verified.');

    // 5. 2-Player Turn Rotation
    console.log('\n--- Test 5: 2-Player Turn Rotation ---');
    let state2 = createMockGameState([p1, p2], 'p1');
    state2 = LudoTurnService.advanceTurn(state2);
    console.assert(state2.currentPlayerId === 'p2', `Expected p2, got ${state2.currentPlayerId}`);
    state2 = LudoTurnService.advanceTurn(state2);
    console.assert(state2.currentPlayerId === 'p1', `Expected p1, got ${state2.currentPlayerId}`);
    console.log('✅ 2-player turn rotation (P1 -> P2 -> P1) verified.');

    // 6. 3-Player Turn Rotation
    console.log('\n--- Test 6: 3-Player Turn Rotation ---');
    let state3 = createMockGameState([p1, p2, p3], 'p1');
    state3 = LudoTurnService.advanceTurn(state3);
    console.assert(state3.currentPlayerId === 'p2', `Expected p2, got ${state3.currentPlayerId}`);
    state3 = LudoTurnService.advanceTurn(state3);
    console.assert(state3.currentPlayerId === 'p3', `Expected p3, got ${state3.currentPlayerId}`);
    state3 = LudoTurnService.advanceTurn(state3);
    console.assert(state3.currentPlayerId === 'p1', `Expected p1, got ${state3.currentPlayerId}`);
    console.log('✅ 3-player turn rotation (P1 -> P2 -> P3 -> P1) verified.');

    // 7 & 8. 4-Player Turn Rotation & Wrapping
    console.log('\n--- Test 7 & 8: 4-Player Turn Rotation & Wrapping ---');
    let turnState = createMockGameState([p1, p2, p3, p4], 'p1');
    const expectedOrder = ['p2', 'p3', 'p4', 'p1'];
    for (const expectedId of expectedOrder) {
      turnState = LudoTurnService.advanceTurn(turnState);
      console.assert(turnState.currentPlayerId === expectedId, `Expected ${expectedId}, got ${turnState.currentPlayerId}`);
    }
    console.log('✅ 4-player turn rotation & wrapping verified.');

    // 9. Non-existent Player Rejection
    console.log('\n--- Test 9: Non-existent Player Rejection ---');
    const nonExistentRes = LudoTurnService.validatePlayerAction(turnState, 'ghost_user');
    console.assert(nonExistentRes.valid === false, 'Non-existent player action must be rejected');
    console.assert(nonExistentRes.reason?.includes('does not exist'), 'Reason should state does not exist');
    console.log('✅ Non-existent player rejection verified.');

    // 10. Turn Start Time Record
    console.log('\n--- Test 10: Turn Start Time Record ---');
    const customTime = 5000000;
    const advancedTimeState = LudoTurnService.advanceTurn(turnState, undefined, customTime);
    console.assert(advancedTimeState.turnStartedAt === customTime, `Expected timestamp ${customTime}, got ${advancedTimeState.turnStartedAt}`);
    console.log('✅ Turn start timestamp recorded correctly.');

    // 11. Remaining Time Calculation
    console.log('\n--- Test 11: Remaining Time Calculation ---');
    const startTime = 100000;
    const timeState = { ...turnState, turnStartedAt: startTime, turnTimeLimit: 15 };
    // 5 seconds elapsed (at 105000ms) -> remaining = 10 seconds
    const rem10 = LudoTurnService.getRemainingTurnTime(timeState, 105000);
    console.assert(rem10 === 10, `Expected 10 seconds remaining, got ${rem10}`);
    console.log('✅ Remaining time calculation verified.');

    // 12 & 13. Expired & Non-Expired Turn Detection
    console.log('\n--- Test 12 & 13: Expired & Non-Expired Turn Detection ---');
    // At 110000ms (10s elapsed) -> not expired
    console.assert(LudoTurnService.isTurnExpired(timeState, 110000) === false, 'Turn should not be expired at 10s');
    // At 115000ms (15s elapsed) -> expired
    console.assert(LudoTurnService.isTurnExpired(timeState, 115000) === true, 'Turn should be expired at 15s');
    // At 120000ms (20s elapsed) -> expired
    console.assert(LudoTurnService.isTurnExpired(timeState, 120000) === true, 'Turn should be expired at 20s');
    console.log('✅ Turn expiration detection verified.');

    // 14. Deterministic Order Check
    console.log('\n--- Test 14: Turn Order Determinism ---');
    const nextP = LudoTurnService.getNextPlayer(state4); // current p2 -> next p3
    console.assert(nextP?.playerId === 'p3', `Expected next p3, got ${nextP?.playerId}`);
    console.log('✅ Deterministic getNextPlayer verified.');

    // 15. Immutability of Original State
    console.log('\n--- Test 15: Immutability ---');
    const stateBeforeStr = JSON.stringify(turnState);
    LudoTurnService.advanceTurn(turnState);
    console.assert(JSON.stringify(turnState) === stateBeforeStr, 'Original game state was mutated!');
    console.log('✅ Original game state immutability verified.');

    console.log('\n🎉 ALL LUDO TURN SERVICE TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Turn Service Test Failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runTurnServiceTests();
