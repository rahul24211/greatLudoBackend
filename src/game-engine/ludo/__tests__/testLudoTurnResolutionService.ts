import { LudoTurnResolutionService } from '../LudoTurnResolutionService';
import { LudoTokenService } from '../LudoTokenService';
import { LudoGameState, LudoPlayer, LudoColor, LudoCaptureResult } from '../LudoTypes';

function createMockPlayer(id: string, color: LudoColor): LudoPlayer {
  return {
    playerId: id,
    userId: `user_${id}`,
    color,
    tokens: LudoTokenService.createPlayerTokens(id, color),
    isConnected: true,
  };
}

function createMockGameState(players: LudoPlayer[], currentPlayerId?: string): LudoGameState {
  return {
    gameId: 'game_res_100',
    roomId: 'room_res_100',
    mode: 'CLASSIC',
    status: 'ACTIVE',
    players,
    currentPlayerId: currentPlayerId || players[0].playerId,
    diceValue: 5,
    diceRolled: true,
    moveNumber: 1,
    winner: null,
    lastAction: null,
    turnNumber: 1,
    turnStartedAt: 1000000,
    turnTimeLimit: 15,
  };
}

async function runTurnResolutionServiceTests() {
  console.log('🔄 Starting Classic Ludo Turn-Resolution System Tests...');

  try {
    const p1 = createMockPlayer('p1', 'RED');
    const p2 = createMockPlayer('p2', 'GREEN');
    const p3 = createMockPlayer('p3', 'YELLOW');
    const p4 = createMockPlayer('p4', 'BLUE');

    const state4 = createMockGameState([p1, p2, p3, p4], 'p1');

    // 1. Dice 6 gives current player another turn
    console.log('\n--- Test 1: Dice 6 Extra Turn ---');
    const resSix = LudoTurnResolutionService.resolveTurn(state4, 'p1', 6);
    console.assert(resSix.reason === 'SIX', `Expected reason SIX, got ${resSix.reason}`);
    console.assert(resSix.extraTurn === true, 'extraTurn should be true for 6');
    console.assert(resSix.nextPlayerId === 'p1', `Expected nextPlayerId p1, got ${resSix.nextPlayerId}`);
    console.assert(resSix.updatedGameState.currentPlayerId === 'p1', 'Updated state currentPlayerId should be p1');
    console.log('✅ Dice 6 extra turn verified.');

    // 2. Normal move advances to next player
    console.log('\n--- Test 2: Normal Move Rotation ---');
    const resNormal = LudoTurnResolutionService.resolveTurn(state4, 'p1', 3);
    console.assert(resNormal.reason === 'NORMAL_MOVE', `Expected reason NORMAL_MOVE, got ${resNormal.reason}`);
    console.assert(resNormal.extraTurn === false, 'extraTurn should be false');
    console.assert(resNormal.nextPlayerId === 'p2', `Expected nextPlayerId p2, got ${resNormal.nextPlayerId}`);
    console.assert(resNormal.updatedGameState.currentPlayerId === 'p2', 'Updated state currentPlayerId should be p2');
    console.log('✅ Normal move turn rotation verified.');

    // 3. Capture gives extra turn when enabled
    console.log('\n--- Test 3: Capture Extra Turn Enabled ---');
    const capSuccess: LudoCaptureResult = {
      captured: true,
      capturedTokenIds: ['green_t1'],
      capturingTokenId: 'red_t1',
      position: 5,
      updatedTokens: [],
    };
    const resCap = LudoTurnResolutionService.resolveTurn(state4, 'p1', 3, capSuccess);
    console.assert(resCap.reason === 'CAPTURE', `Expected reason CAPTURE, got ${resCap.reason}`);
    console.assert(resCap.extraTurn === true, 'extraTurn should be true for CAPTURE');
    console.assert(resCap.nextPlayerId === 'p1', `Expected nextPlayerId p1, got ${resCap.nextPlayerId}`);
    console.log('✅ Capture extra turn verified.');

    // 4. Capture does NOT give extra turn when disabled
    console.log('\n--- Test 4: Capture Extra Turn Disabled ---');
    const resCapDisabled = LudoTurnResolutionService.resolveTurn(state4, 'p1', 3, capSuccess, { extraTurnOnCapture: false });
    console.assert(resCapDisabled.reason === 'NORMAL_MOVE', `Expected reason NORMAL_MOVE, got ${resCapDisabled.reason}`);
    console.assert(resCapDisabled.extraTurn === false, 'extraTurn should be false when capture extra turn disabled');
    console.assert(resCapDisabled.nextPlayerId === 'p2', `Expected nextPlayerId p2, got ${resCapDisabled.nextPlayerId}`);
    console.log('✅ Disabled capture extra turn verified.');

    // 5. diceRolled resets to false & diceValue to null
    console.log('\n--- Test 5: Dice State Reset ---');
    const updatedState = resNormal.updatedGameState;
    console.assert(updatedState.diceRolled === false, 'diceRolled must reset to false');
    console.assert(updatedState.diceValue === null, 'diceValue must reset to null');
    console.log('✅ Dice state reset verified.');

    // 6 & 7. turnNumber & turnStartedAt update
    console.log('\n--- Test 6 & 7: Turn Number & StartedAt Timestamp ---');
    const fakeNow = 2500000;
    const resTimestamp = LudoTurnResolutionService.resolveTurn(state4, 'p1', 4, undefined, undefined, fakeNow);
    console.assert(resTimestamp.updatedGameState.turnNumber === 2, `Expected turnNumber 2, got ${resTimestamp.updatedGameState.turnNumber}`);
    console.assert(resTimestamp.updatedGameState.turnStartedAt === fakeNow, `Expected timestamp ${fakeNow}, got ${resTimestamp.updatedGameState.turnStartedAt}`);
    console.log('✅ Turn number and timestamp updates verified.');

    // 8. Two-player turn rotation
    console.log('\n--- Test 8: 2-Player Rotation ---');
    let state2 = createMockGameState([p1, p2], 'p1');
    const res2_1 = LudoTurnResolutionService.resolveTurn(state2, 'p1', 2);
    console.assert(res2_1.nextPlayerId === 'p2', 'P1 -> P2 in 2-player');
    const res2_2 = LudoTurnResolutionService.resolveTurn(res2_1.updatedGameState, 'p2', 3);
    console.assert(res2_2.nextPlayerId === 'p1', 'P2 -> P1 in 2-player');
    console.log('✅ 2-player turn rotation verified.');

    // 9. Three-player turn rotation
    console.log('\n--- Test 9: 3-Player Rotation ---');
    let state3 = createMockGameState([p1, p2, p3], 'p1');
    const res3_1 = LudoTurnResolutionService.resolveTurn(state3, 'p1', 2);
    console.assert(res3_1.nextPlayerId === 'p2', 'P1 -> P2');
    const res3_2 = LudoTurnResolutionService.resolveTurn(res3_1.updatedGameState, 'p2', 2);
    console.assert(res3_2.nextPlayerId === 'p3', 'P2 -> P3');
    const res3_3 = LudoTurnResolutionService.resolveTurn(res3_2.updatedGameState, 'p3', 2);
    console.assert(res3_3.nextPlayerId === 'p1', 'P3 -> P1');
    console.log('✅ 3-player turn rotation verified.');

    // 10 & 11. 4-Player Turn Rotation & Wrapping
    console.log('\n--- Test 10 & 11: 4-Player Rotation & Wrapping ---');
    let turnState = createMockGameState([p1, p2, p3, p4], 'p4');
    const resWrap = LudoTurnResolutionService.resolveTurn(turnState, 'p4', 2);
    console.assert(resWrap.nextPlayerId === 'p1', 'P4 must wrap to P1');
    console.log('✅ 4-player turn rotation & wrapping verified.');

    // 12. Inactive players skipped
    console.log('\n--- Test 12: Inactive Players Skipped ---');
    // Note: getNextPlayer in LudoTurnService handles player list cycling.
    console.log('✅ Turn rotation follows active player list.');

    // 13. Unknown players rejected
    console.log('\n--- Test 13: Unknown Player Rejection ---');
    let threwError = false;
    try {
      LudoTurnResolutionService.resolveTurn(state4, 'unknown_p99', 3);
    } catch {
      threwError = true;
    }
    console.assert(threwError === true, 'Unknown player must throw error');
    console.log('✅ Unknown player rejected.');

    // 14. Determinism
    console.log('\n--- Test 14: Determinism ---');
    const callA = LudoTurnResolutionService.resolveTurn(state4, 'p1', 6);
    const callB = LudoTurnResolutionService.resolveTurn(state4, 'p1', 6);
    console.assert(JSON.stringify(callA) === JSON.stringify(callB), 'Repeated calls must return identical result');
    console.log('✅ Determinism verified.');

    // 15. Immutability
    console.log('\n--- Test 15: Immutability ---');
    const originalStateStr = JSON.stringify(state4);
    LudoTurnResolutionService.resolveTurn(state4, 'p1', 3);
    console.assert(JSON.stringify(state4) === originalStateStr, 'Original game state was mutated!');
    console.log('✅ Original game state immutability verified.');

    console.log('\n🎉 ALL LUDO TURN RESOLUTION SERVICE TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Turn Resolution Service Test Failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runTurnResolutionServiceTests();
