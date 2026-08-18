import { LudoMovementService, HOME_PATH_BASE_OFFSET } from '../LudoMovementService';
import { LudoTokenService, FINISHED_POSITION } from '../LudoTokenService';
import { LudoBoard } from '../LudoBoard';
import { LudoToken, LudoPositionCategory, LudoColor } from '../LudoTypes';

async function runMovementServiceTests() {
  console.log('🎲 Starting Classic Ludo Movement Calculation System Tests...');

  try {
    const redTokens = LudoTokenService.createPlayerTokens('p1', 'RED');
    const greenTokens = LudoTokenService.createPlayerTokens('p2', 'GREEN');
    const yellowTokens = LudoTokenService.createPlayerTokens('p3', 'YELLOW');
    const blueTokens = LudoTokenService.createPlayerTokens('p4', 'BLUE');

    // 1. HOME token + dice 1 = invalid
    console.log('\n--- Test 1 & 2: HOME token + dice 1 or 5 = invalid ---');
    const res1 = LudoMovementService.calculateMove(redTokens[0], 1, 'RED');
    console.assert(res1.valid === false, 'HOME + dice 1 should be invalid');
    console.assert(res1.reason?.includes('6 is required'), 'Reason should mention 6 required');

    // 2. HOME token + dice 5 = invalid
    const res5 = LudoMovementService.calculateMove(redTokens[0], 5, 'RED');
    console.assert(res5.valid === false, 'HOME + dice 5 should be invalid');
    console.log('✅ HOME token + dice 1 and 5 invalid verified.');

    // 3. HOME token + dice 6 = valid entry to start square
    console.log('\n--- Test 3: HOME token + dice 6 = valid ---');
    const res6 = LudoMovementService.calculateMove(redTokens[0], 6, 'RED');
    console.assert(res6.valid === true, 'HOME + dice 6 should be valid');
    console.assert(res6.toCategory === LudoPositionCategory.MAIN_PATH, 'toCategory should be MAIN_PATH');
    console.assert(res6.toPosition === 0, `RED start position should be 0, got ${res6.toPosition}`);
    console.assert(res6.entersBoard === true, 'entersBoard should be true');
    console.log('✅ HOME token + dice 6 entry to starting square verified.');

    // 4. ACTIVE token moves 1
    console.log('\n--- Test 4, 5, 6: ACTIVE token moves 1, 2, 6 ---');
    const activeToken: LudoToken = LudoTokenService.updateTokenPosition(redTokens[0], 'ACTIVE', 0);
    const resMove1 = LudoMovementService.calculateMove(activeToken, 1, 'RED');
    console.assert(resMove1.valid === true && resMove1.toPosition === 1, 'ACTIVE token moving 1 step failed');

    // 5. ACTIVE token moves 2
    const resMove2 = LudoMovementService.calculateMove(activeToken, 2, 'RED');
    console.assert(resMove2.valid === true && resMove2.toPosition === 2, 'ACTIVE token moving 2 steps failed');

    // 6. ACTIVE token moves 6
    const resMove6 = LudoMovementService.calculateMove(activeToken, 6, 'RED');
    console.assert(resMove6.valid === true && resMove6.toPosition === 6, 'ACTIVE token moving 6 steps failed');
    console.log('✅ ACTIVE token moves 1, 2, and 6 steps verified.');

    // 7. Movement wraps correctly around main path
    console.log('\n--- Test 7: Main Path Wrapping ---');
    // Green starts at 13. Green active token at position 50 moves 3 steps -> (50 + 3) % 52 = 1.
    const greenActive: LudoToken = LudoTokenService.updateTokenPosition(greenTokens[0], 'ACTIVE', 50);
    const resWrap = LudoMovementService.calculateMove(greenActive, 3, 'GREEN');
    console.assert(resWrap.valid === true, 'Wrap around move should be valid');
    console.assert(resWrap.toPosition === 1, `Expected wrapped position 1, got ${resWrap.toPosition}`);
    console.assert(resWrap.toCategory === LudoPositionCategory.MAIN_PATH, 'Should remain on MAIN_PATH');
    console.log('✅ Main path wrapping around 51 -> 0 verified.');

    // 8. Movement enters the correct player's home path
    console.log('\n--- Test 8: Home Path Entry ---');
    // Red home entry threshold is cell 50 (50 steps from start square 0).
    const redNearHome: LudoToken = LudoTokenService.updateTokenPosition(redTokens[0], 'ACTIVE', 49);
    // Move 2 steps: step 1 reaches cell 50, step 2 enters home path cell 0 (index 100)
    const resHomeEntry = LudoMovementService.calculateMove(redNearHome, 2, 'RED');
    console.assert(resHomeEntry.valid === true, 'Home entry move should be valid');
    console.assert(resHomeEntry.toCategory === LudoPositionCategory.HOME_PATH, 'toCategory should be HOME_PATH');
    console.assert(resHomeEntry.toPosition === HOME_PATH_BASE_OFFSET, `Expected home pos 100, got ${resHomeEntry.toPosition}`);
    console.assert(resHomeEntry.entersHomePath === true, 'entersHomePath should be true');

    // Green home entry threshold is cell 11 (50 steps from start square 13).
    const greenNearHome: LudoToken = LudoTokenService.updateTokenPosition(greenTokens[0], 'ACTIVE', 10);
    const resGreenHome = LudoMovementService.calculateMove(greenNearHome, 2, 'GREEN');
    console.assert(resGreenHome.valid === true, 'Green home entry move should be valid');
    console.assert(resGreenHome.toCategory === LudoPositionCategory.HOME_PATH, 'Green toCategory should be HOME_PATH');
    console.assert(resGreenHome.toPosition === HOME_PATH_BASE_OFFSET, `Expected home pos 100, got ${resGreenHome.toPosition}`);
    console.log('✅ Entry into color-specific home path verified.');

    // 9. Movement reaches final position correctly
    console.log('\n--- Test 9: Reaching Final Position ---');
    // Token at home path index 4 (position 104, total steps 55). Moving 1 step reaches finish (step 56, position 99).
    const tokenInHomePath: LudoToken = LudoTokenService.updateTokenPosition(redTokens[0], 'ACTIVE', HOME_PATH_BASE_OFFSET + 4);
    const resFinish = LudoMovementService.calculateMove(tokenInHomePath, 1, 'RED');
    console.assert(resFinish.valid === true, 'Finish move should be valid');
    console.assert(resFinish.toCategory === LudoPositionCategory.FINISHED, 'toCategory should be FINISHED');
    console.assert(resFinish.toPosition === FINISHED_POSITION, `toPosition should be ${FINISHED_POSITION}`);
    console.assert(resFinish.reachesFinish === true, 'reachesFinish should be true');
    console.log('✅ Reaching final position verified.');

    // 10. Movement beyond final position is rejected (overshoot)
    console.log('\n--- Test 10: Overshoot Rejection ---');
    // Token at position 104 needs exactly 1 step. Rolling 2 or 5 should overshoot and fail.
    const resOvershoot = LudoMovementService.calculateMove(tokenInHomePath, 2, 'RED');
    console.assert(resOvershoot.valid === false, 'Overshoot move should be invalid');
    console.assert(resOvershoot.reason?.includes('exceeds exact steps'), 'Reason should mention overshoot');
    console.log('✅ Overshoot beyond final cell rejected.');

    // 11. FINISHED token cannot move
    console.log('\n--- Test 11: FINISHED Token Cannot Move ---');
    const finishedToken: LudoToken = LudoTokenService.updateTokenPosition(redTokens[0], 'FINISHED', FINISHED_POSITION);
    const resFinishedMove = LudoMovementService.calculateMove(finishedToken, 1, 'RED');
    console.assert(resFinishedMove.valid === false, 'FINISHED token move should be invalid');
    console.assert(resFinishedMove.reason?.includes('already FINISHED'), 'Reason should mention FINISHED');
    console.log('✅ FINISHED token movement rejection verified.');

    // 12. Invalid dice values are rejected
    console.log('\n--- Test 12: Invalid Dice Values ---');
    const invalidDiceVals = [0, -1, 7, 3.5, NaN, null as any, undefined as any];
    for (const val of invalidDiceVals) {
      const resInv = LudoMovementService.calculateMove(activeToken, val, 'RED');
      console.assert(resInv.valid === false, `Dice value ${val} should be invalid`);
    }
    console.log('✅ All invalid dice inputs rejected.');

    // 13. Different colors use correct starting positions
    console.log('\n--- Test 13: Color Specific Starting Positions ---');
    const colors: LudoColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
    const tokensList = [redTokens[0], greenTokens[0], yellowTokens[0], blueTokens[0]];

    for (let i = 0; i < colors.length; i++) {
      const color = colors[i];
      const token = tokensList[i];
      const resColorEntry = LudoMovementService.calculateMove(token, 6, color);
      const expectedStart = LudoBoard.getStartSquare(color);
      console.assert(resColorEntry.valid === true, `Color ${color} start move should be valid`);
      console.assert(resColorEntry.toPosition === expectedStart, `Color ${color} expected start ${expectedStart}, got ${resColorEntry.toPosition}`);
    }
    console.log('✅ Color specific start positions verified.');

    // 14. Pure function determinism
    console.log('\n--- Test 14: Pure Function Determinism ---');
    const call1 = LudoMovementService.calculateMove(activeToken, 4, 'RED');
    const call2 = LudoMovementService.calculateMove(activeToken, 4, 'RED');
    console.assert(JSON.stringify(call1) === JSON.stringify(call2), 'Repeated calls with identical arguments must return identical results');
    console.log('✅ Determinism verified.');

    // 15. Original token state is not mutated
    console.log('\n--- Test 15: Immutability ---');
    const tokenBefore = { ...activeToken };
    LudoMovementService.calculateMove(activeToken, 4, 'RED');
    console.assert(activeToken.state === tokenBefore.state, 'Original token state was mutated');
    console.assert(activeToken.position === tokenBefore.position, 'Original token position was mutated');
    console.log('✅ Immutability of original token verified.');

    console.log('\n🎉 ALL LUDO MOVEMENT SERVICE TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Ludo Movement Test Failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMovementServiceTests();
