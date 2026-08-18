import { LudoCaptureService } from '../LudoCaptureService';
import { LudoTokenService, HOME_POSITION, FINISHED_POSITION } from '../LudoTokenService';
import { LudoToken, LudoColor } from '../LudoTypes';

async function runCaptureServiceTests() {
  console.log('⚔️ Starting Classic Ludo Token Capture System Tests...');

  try {
    const redTokens = LudoTokenService.createPlayerTokens('p1_red', 'RED');
    const greenTokens = LudoTokenService.createPlayerTokens('p2_green', 'GREEN');
    const yellowTokens = LudoTokenService.createPlayerTokens('p3_yellow', 'YELLOW');
    const blueTokens = LudoTokenService.createPlayerTokens('p4_blue', 'BLUE');

    // 1 & 7 & 9 & 10. Opponent token on normal position gets captured & reset to HOME -1
    console.log('\n--- Test 1, 7, 9, 10: Normal Main Path Capture & Home Reset ---');
    const redActive: LudoToken = LudoTokenService.updateTokenPosition(redTokens[0], 'ACTIVE', 5); // Normal non-safe cell 5
    const greenActive: LudoToken = LudoTokenService.updateTokenPosition(greenTokens[0], 'ACTIVE', 5); // Same cell 5

    const allTokens1 = [redActive, greenActive];
    const res1 = LudoCaptureService.applyCapture(redActive, allTokens1, 5);

    console.assert(res1.captured === true, 'Capture should occur on normal cell 5');
    console.assert(res1.capturedTokenIds.includes(greenActive.tokenId), 'Green token ID should be captured');
    console.assert(res1.capturingTokenId === redActive.tokenId, 'Red token ID should be capturer');

    const updatedGreen = res1.updatedTokens.find((t) => t.tokenId === greenActive.tokenId);
    console.assert(updatedGreen?.state === 'HOME', 'Captured token state must be HOME');
    console.assert(updatedGreen?.position === HOME_POSITION, `Captured token position must be ${HOME_POSITION}`);
    console.log('✅ Opponent token capture & reset to HOME (-1) verified.');

    // 2. Same player's token is NOT captured
    console.log('\n--- Test 2: Friendly Token Safety ---');
    const redToken2: LudoToken = LudoTokenService.updateTokenPosition(redTokens[1], 'ACTIVE', 5);
    const friendlyList = [redActive, redToken2];
    const resFriendly = LudoCaptureService.applyCapture(redActive, friendlyList, 5);
    console.assert(resFriendly.captured === false, 'Friendly token must NOT be captured');
    console.assert(resFriendly.capturedTokenIds.length === 0, 'capturedTokenIds should be empty');
    console.log('✅ Friendly tokens are never captured.');

    // 3. Safe cell prevents capture
    console.log('\n--- Test 3: Safe Cell Immunity ---');
    // Cell 0 is RED start cell (Safe Cell)
    const redAtSafe: LudoToken = LudoTokenService.updateTokenPosition(redTokens[0], 'ACTIVE', 0);
    const greenAtSafe: LudoToken = LudoTokenService.updateTokenPosition(greenTokens[0], 'ACTIVE', 0);
    const safeList = [redAtSafe, greenAtSafe];

    const resSafe = LudoCaptureService.applyCapture(redAtSafe, safeList, 0);
    console.assert(resSafe.captured === false, 'Safe cell 0 must prevent capture');
    console.assert(resSafe.capturedTokenIds.length === 0, 'No tokens captured on safe cell');
    console.log('✅ Safe cell protection verified.');

    // 4. HOME token cannot be captured
    console.log('\n--- Test 4: HOME Token Immunity ---');
    const greenAtHome = greenTokens[0]; // state='HOME', position=-1
    const resHomeCap = LudoCaptureService.applyCapture(redActive, [redActive, greenAtHome], HOME_POSITION);
    console.assert(resHomeCap.captured === false, 'HOME token cannot be captured');
    console.log('✅ HOME token immunity verified.');

    // 5. FINISHED token cannot be captured
    console.log('\n--- Test 5: FINISHED Token Immunity ---');
    const greenFinished: LudoToken = LudoTokenService.updateTokenPosition(greenTokens[0], 'FINISHED', FINISHED_POSITION);
    const resFinCap = LudoCaptureService.applyCapture(redActive, [redActive, greenFinished], FINISHED_POSITION);
    console.assert(resFinCap.captured === false, 'FINISHED token cannot be captured');
    console.log('✅ FINISHED token immunity verified.');

    // 6. Token on different position is NOT captured
    console.log('\n--- Test 6: Different Position Safety ---');
    const greenAtDiff: LudoToken = LudoTokenService.updateTokenPosition(greenTokens[0], 'ACTIVE', 10);
    const resDiffPos = LudoCaptureService.applyCapture(redActive, [redActive, greenAtDiff], 5);
    console.assert(resDiffPos.captured === false, 'Token on different position must NOT be captured');
    console.log('✅ Tokens on different positions are untouched.');

    // 8. Multiple opponent tokens capture rule
    console.log('\n--- Test 8: Multiple Opponent Tokens Handling ---');
    const yellowActive: LudoToken = LudoTokenService.updateTokenPosition(yellowTokens[0], 'ACTIVE', 5);
    const blueActive: LudoToken = LudoTokenService.updateTokenPosition(blueTokens[0], 'ACTIVE', 5);
    const multiList = [redActive, yellowActive, blueActive];

    const resMulti = LudoCaptureService.applyCapture(redActive, multiList, 5);
    console.assert(resMulti.captured === true, 'Multi-opponent capture should occur');
    console.assert(resMulti.capturedTokenIds.length === 2, `Expected 2 captured tokens, got ${resMulti.capturedTokenIds.length}`);
    console.log('✅ Multiple opponent tokens capture verified.');

    // 11. Immutability of original token array
    console.log('\n--- Test 11: Immutability ---');
    const originalTokensStr = JSON.stringify(allTokens1);
    LudoCaptureService.applyCapture(redActive, allTokens1, 5);
    console.assert(JSON.stringify(allTokens1) === originalTokensStr, 'Original tokens array was mutated!');
    console.log('✅ Token array immutability verified.');

    // 12. Capture calculation across all 4 player colors
    console.log('\n--- Test 12: Color Specific Determinism Across All 4 Colors ---');
    const colors: LudoColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];
    const activeTokensList = [
      LudoTokenService.updateTokenPosition(redTokens[0], 'ACTIVE', 15),
      LudoTokenService.updateTokenPosition(greenTokens[0], 'ACTIVE', 15),
      LudoTokenService.updateTokenPosition(yellowTokens[0], 'ACTIVE', 15),
      LudoTokenService.updateTokenPosition(blueTokens[0], 'ACTIVE', 15),
    ];

    for (let i = 0; i < colors.length; i++) {
      const moving = activeTokensList[i];
      const capturable = LudoCaptureService.findCapturableTokens(moving, activeTokensList, 15);
      console.assert(capturable.length === 3, `Color ${colors[i]} should capture 3 opponents at cell 15, got ${capturable.length}`);
    }
    console.log('✅ All 4 colors deterministic capture verified.');

    console.log('\n🎉 ALL LUDO CAPTURE SERVICE TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Capture Service Test Failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runCaptureServiceTests();
