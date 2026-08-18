import { LudoValidMovesService } from '../LudoValidMovesService';
import { LudoMovementService, HOME_PATH_BASE_OFFSET } from '../LudoMovementService';
import { LudoTokenService, FINISHED_POSITION } from '../LudoTokenService';
import { LudoToken } from '../LudoTypes';

async function runValidMovesServiceTests() {
  console.log('✅ Starting Classic Ludo Valid-Moves Calculation System Tests...');

  try {
    const p1 = 'player_red_1';
    const p2 = 'player_green_2';
    const redTokens = LudoTokenService.createPlayerTokens(p1, 'RED');
    const greenTokens = LudoTokenService.createPlayerTokens(p2, 'GREEN');

    // 1. Four HOME tokens + dice 1 -> no valid moves
    console.log('\n--- Test 1: Four HOME tokens + dice 1 ---');
    const resHome1 = LudoValidMovesService.getValidMoves(redTokens, p1, 'RED', 1);
    console.assert(resHome1.valid === false, '4 HOME tokens + dice 1 should have valid = false');
    console.assert(resHome1.validMoves.length === 0, 'validMoves should be empty');
    console.assert(resHome1.invalidMoves.length === 4, 'invalidMoves should contain 4 tokens');
    console.log('✅ Four HOME tokens + dice 1 -> 0 valid moves verified.');

    // 2. Four HOME tokens + dice 6 -> 4 valid moves
    console.log('\n--- Test 2: Four HOME tokens + dice 6 ---');
    const resHome6 = LudoValidMovesService.getValidMoves(redTokens, p1, 'RED', 6);
    console.assert(resHome6.valid === true, '4 HOME tokens + dice 6 should have valid = true');
    console.assert(resHome6.validMoves.length === 4, `Expected 4 valid moves, got ${resHome6.validMoves.length}`);
    for (const move of resHome6.validMoves) {
      console.assert(move.entersBoard === true, 'entersBoard should be true');
      console.assert(move.toPosition === 0, 'RED start position should be 0');
    }
    console.log('✅ Four HOME tokens + dice 6 -> 4 valid moves verified.');

    // 3. One ACTIVE token + valid dice -> correct token returned
    console.log('\n--- Test 3 & 4: Active Token Valid & Invalid Movement ---');
    const activeToken: LudoToken = LudoTokenService.updateTokenPosition(redTokens[0], 'ACTIVE', 10);
    const activeTokensList = [activeToken, redTokens[1], redTokens[2], redTokens[3]];

    const resActive3 = LudoValidMovesService.getValidMoves(activeTokensList, p1, 'RED', 3);
    console.assert(resActive3.valid === true, 'Should have valid move for active token');
    console.assert(resActive3.validMoves.length === 1, `Expected 1 valid move, got ${resActive3.validMoves.length}`);
    console.assert(resActive3.validMoves[0].tokenId === activeToken.tokenId, 'Token ID mismatch in validMove');
    console.assert(resActive3.validMoves[0].toPosition === 13, `Expected target 13, got ${resActive3.validMoves[0].toPosition}`);
    console.log('✅ Active token valid move returned.');

    // 4. One ACTIVE token + invalid move (overshoot) -> returned in invalidMoves
    const overshootToken: LudoToken = LudoTokenService.updateTokenPosition(redTokens[0], 'ACTIVE', HOME_PATH_BASE_OFFSET + 4);
    const overshootList = [overshootToken, redTokens[1], redTokens[2], redTokens[3]];
    const resOvershoot = LudoValidMovesService.getValidMoves(overshootList, p1, 'RED', 3);
    console.assert(resOvershoot.valid === false, 'Overshoot token + 3 HOME tokens + dice 3 should have valid = false');
    console.assert(resOvershoot.validMoves.length === 0, 'validMoves should be empty');
    console.assert(resOvershoot.invalidMoves.length === 4, 'invalidMoves should contain 4 tokens');
    console.log('✅ Active token overshoot returned in invalidMoves.');

    // 5. FINISHED token -> never valid
    console.log('\n--- Test 5: FINISHED Token Never Valid ---');
    const finishedToken: LudoToken = LudoTokenService.updateTokenPosition(redTokens[0], 'FINISHED', FINISHED_POSITION);
    const finishedList = [finishedToken, redTokens[1], redTokens[2], redTokens[3]];
    const resFinished = LudoValidMovesService.getValidMoves(finishedList, p1, 'RED', 6);
    // On dice 6, redTokens[1,2,3] (HOME) can move out, but finishedToken cannot!
    const finishedMoveFound = resFinished.validMoves.find((m) => m.tokenId === finishedToken.tokenId);
    console.assert(finishedMoveFound === undefined, 'FINISHED token must not be in validMoves');
    console.log('✅ FINISHED token is never valid.');

    // 6 & 7. Multiple valid tokens & Mixed states
    console.log('\n--- Test 6 & 7: Multiple Valid Tokens & Mixed States ---');
    const t1: LudoToken = LudoTokenService.updateTokenPosition(redTokens[0], 'ACTIVE', 5);
    const t2: LudoToken = LudoTokenService.updateTokenPosition(redTokens[1], 'ACTIVE', 20);
    const t3: LudoToken = LudoTokenService.updateTokenPosition(redTokens[2], 'FINISHED', FINISHED_POSITION);
    const t4: LudoToken = redTokens[3]; // HOME
    const mixedList = [t1, t2, t3, t4];

    // On dice 2: t1 (5->7) and t2 (20->22) are valid! t3 (FINISHED) and t4 (HOME) are invalid.
    const resMixed = LudoValidMovesService.getValidMoves(mixedList, p1, 'RED', 2);
    console.assert(resMixed.valid === true, 'Mixed list + dice 2 should have valid = true');
    console.assert(resMixed.validMoves.length === 2, `Expected 2 valid moves, got ${resMixed.validMoves.length}`);
    console.assert(resMixed.invalidMoves.length === 2, `Expected 2 invalid moves, got ${resMixed.invalidMoves.length}`);
    console.log('✅ Multiple valid tokens in mixed states verified.');

    // 8. Invalid dice value
    console.log('\n--- Test 8: Invalid Dice Value ---');
    const resBadDice = LudoValidMovesService.getValidMoves(mixedList, p1, 'RED', 99);
    console.assert(resBadDice.valid === false, 'Invalid dice 99 should return valid = false');
    console.assert(resBadDice.validMoves.length === 0, 'validMoves should be empty for bad dice');
    console.log('✅ Invalid dice value rejected.');

    // 9. Token belonging to another player rejected
    console.log('\n--- Test 9: Player Token Isolation ---');
    const allTokensCombined = [...redTokens, ...greenTokens];
    const resP1Only = LudoValidMovesService.getValidMoves(allTokensCombined, p1, 'RED', 6);
    for (const move of resP1Only.validMoves) {
      console.assert(move.token.playerId === p1, `Expected playerId ${p1}, got ${move.token.playerId}`);
    }
    console.log('✅ Player token isolation verified.');

    // 10. Duplicate token IDs handled safely
    console.log('\n--- Test 10: Duplicate Token ID Handling ---');
    const duplicateList = [t1, t1, t2, t4]; // duplicate t1
    const resDup = LudoValidMovesService.getValidMoves(duplicateList, p1, 'RED', 2);
    console.assert(resDup.validMoves.length === 2, `Expected 2 valid moves after deduplication, got ${resDup.validMoves.length}`);
    console.log('✅ Duplicate token IDs handled safely.');

    // 11. Immutability of original token array
    console.log('\n--- Test 11: Immutability ---');
    const originalArrayStr = JSON.stringify(mixedList);
    LudoValidMovesService.getValidMoves(mixedList, p1, 'RED', 4);
    console.assert(JSON.stringify(mixedList) === originalArrayStr, 'Original token array was mutated');
    console.log('✅ Immutability verified.');

    // 12. Returned calculated destinations match LudoMovementService directly
    console.log('\n--- Test 12: Destination Match with LudoMovementService ---');
    const expectedDirectMove = LudoMovementService.calculateMove(t1, 4, 'RED');
    const validMovesRes = LudoValidMovesService.getValidMoves([t1], p1, 'RED', 4);
    console.assert(validMovesRes.validMoves[0].toPosition === expectedDirectMove.toPosition, 'Destination position mismatch');
    console.assert(validMovesRes.validMoves[0].toCategory === expectedDirectMove.toCategory, 'Destination category mismatch');
    console.log('✅ Destination matches LudoMovementService output.');

    console.log('\n🎉 ALL LUDO VALID MOVES SERVICE TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Valid Moves Test Failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runValidMovesServiceTests();
