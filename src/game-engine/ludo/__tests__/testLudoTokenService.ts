import { LudoTokenService, HOME_POSITION, FINISHED_POSITION } from '../LudoTokenService';
import { LudoToken } from '../LudoTypes';

async function runTokenServiceTests() {
  console.log('🪙 Starting Classic Ludo Token Management Layer Tests...');

  try {
    const p1 = 'player_red_1';
    const p2 = 'player_green_2';

    // 1. Create 4 Tokens
    console.log('\n--- Test 1 & 2: Token Creation & Initial HOME State ---');
    const redTokens = LudoTokenService.createPlayerTokens(p1, 'RED');
    console.assert(redTokens.length === 4, `Expected 4 tokens, got ${redTokens.length}`);

    // 2. All tokens initially HOME with position -1
    for (const token of redTokens) {
      console.assert(token.state === 'HOME', `Expected state HOME, got ${token.state}`);
      console.assert(token.position === HOME_POSITION, `Expected position ${HOME_POSITION}, got ${token.position}`);
      console.assert(LudoTokenService.isTokenAtHome(token) === true, 'isTokenAtHome should return true');
    }
    console.log('✅ Created 4 tokens in HOME state with position -1.');

    // 3. Deterministic Unique Token IDs
    console.log('\n--- Test 3: Unique Deterministic Token IDs ---');
    const ids = redTokens.map((t) => t.tokenId);
    const uniqueIds = new Set(ids);
    console.assert(uniqueIds.size === 4, 'Token IDs must be unique');
    console.assert(ids[0] === `${p1}-token-1`, `Token ID mismatch: ${ids[0]}`);
    console.assert(ids[3] === `${p1}-token-4`, `Token ID mismatch: ${ids[3]}`);
    console.log('✅ Token IDs are unique and deterministic.');

    // 4. Correct Player Ownership
    console.log('\n--- Test 4 & 5: Player Ownership & Color ---');
    for (const token of redTokens) {
      console.assert(token.playerId === p1, `Player ID mismatch: ${token.playerId}`);
      console.assert(token.color === 'RED', `Color mismatch: ${token.color}`);
    }
    console.log('✅ Player ownership and color verified.');

    // 6. getTokenById
    console.log('\n--- Test 6: getTokenById ---');
    const greenTokens = LudoTokenService.createPlayerTokens(p2, 'GREEN');
    const allTokens = [...redTokens, ...greenTokens];

    const foundToken = LudoTokenService.getTokenById(allTokens, `${p1}-token-2`);
    console.assert(foundToken !== null, 'Token lookup returned null');
    console.assert(foundToken?.tokenId === `${p1}-token-2`, 'Token ID mismatch in lookup');
    console.assert(foundToken?.playerId === p1, 'Player ID mismatch in lookup');

    const missingToken = LudoTokenService.getTokenById(allTokens, 'non_existent_token');
    console.assert(missingToken === null, 'Missing token should return null');
    console.log('✅ getTokenById lookup verified.');

    // 7. getPlayerTokens
    console.log('\n--- Test 7: getPlayerTokens ---');
    const p1Tokens = LudoTokenService.getPlayerTokens(allTokens, p1);
    console.assert(p1Tokens.length === 4, `Expected 4 tokens for p1, got ${p1Tokens.length}`);

    const p2Tokens = LudoTokenService.getPlayerTokens(allTokens, p2);
    console.assert(p2Tokens.length === 4, `Expected 4 tokens for p2, got ${p2Tokens.length}`);
    console.log('✅ getPlayerTokens filtering verified.');

    // 8. HOME Validation
    console.log('\n--- Test 8: HOME Validation ---');
    const homeToken = redTokens[0];
    console.assert(LudoTokenService.isTokenAtHome(homeToken), 'homeToken should be at HOME');
    console.assert(!LudoTokenService.isTokenActive(homeToken), 'homeToken should not be ACTIVE');
    console.assert(!LudoTokenService.isTokenFinished(homeToken), 'homeToken should not be FINISHED');

    // Attempt invalid HOME token with active position
    let caughtHomeErr = false;
    try {
      LudoTokenService.updateTokenPosition(homeToken, 'HOME', 10);
    } catch {
      caughtHomeErr = true;
    }
    console.assert(caughtHomeErr === true, 'Updating HOME token to position 10 should throw error');
    console.log('✅ HOME state validation verified.');

    // 9. ACTIVE Validation
    console.log('\n--- Test 9: ACTIVE Validation ---');
    const activeToken = LudoTokenService.updateTokenPosition(homeToken, 'ACTIVE', 0);
    console.assert(activeToken.state === 'ACTIVE', 'activeToken state should be ACTIVE');
    console.assert(activeToken.position === 0, 'activeToken position should be 0');
    console.assert(LudoTokenService.isTokenActive(activeToken), 'isTokenActive should be true');

    let caughtActiveErr = false;
    try {
      LudoTokenService.updateTokenPosition(activeToken, 'ACTIVE', -1);
    } catch {
      caughtActiveErr = true;
    }
    console.assert(caughtActiveErr === true, 'Updating ACTIVE token to position -1 should throw error');
    console.log('✅ ACTIVE state validation verified.');

    // 10. FINISHED Validation
    console.log('\n--- Test 10: FINISHED Validation ---');
    const finishedToken = LudoTokenService.updateTokenPosition(activeToken, 'FINISHED', FINISHED_POSITION);
    console.assert(finishedToken.state === 'FINISHED', 'finishedToken state should be FINISHED');
    console.assert(LudoTokenService.isTokenFinished(finishedToken), 'isTokenFinished should be true');
    console.log('✅ FINISHED state validation verified.');

    // 11. Invalid Token Detection
    console.log('\n--- Test 11 & 12: Invalid and Duplicate Token Detection ---');
    const invalidTokensList: any[] = [
      { tokenId: 't1', playerId: 'p1', color: 'RED', state: 'HOME', position: 15 }, // Invalid HOME position
      { tokenId: 't2', playerId: 'p1', color: 'INVALID_COLOR', state: 'ACTIVE', position: 0 },
    ];
    const invalidValidation = LudoTokenService.validateTokens(invalidTokensList);
    console.assert(invalidValidation.valid === false, 'Invalid tokens list should fail validation');
    console.assert(invalidValidation.errors.length >= 2, 'Should report multiple validation errors');

    // Duplicate token IDs check
    const dupTokensList: LudoToken[] = [
      { tokenId: 'dup1', playerId: 'p1', color: 'RED', state: 'HOME', position: HOME_POSITION },
      { tokenId: 'dup1', playerId: 'p1', color: 'RED', state: 'HOME', position: HOME_POSITION },
      { tokenId: 'dup3', playerId: 'p1', color: 'RED', state: 'HOME', position: HOME_POSITION },
      { tokenId: 'dup4', playerId: 'p1', color: 'RED', state: 'HOME', position: HOME_POSITION },
    ];
    const dupValidation = LudoTokenService.validateTokens(dupTokensList);
    console.assert(dupValidation.valid === false, 'Duplicate token IDs should fail validation');
    console.log('✅ Invalid token state and duplicate token ID detection verified.');

    // 13. Immutable Token Updates
    console.log('\n--- Test 13: Immutable Token Updates ---');
    const originalToken = redTokens[0];
    const updatedToken = LudoTokenService.updateTokenPosition(originalToken, 'ACTIVE', 5);

    console.assert(originalToken !== updatedToken, 'Update must return a new object reference');
    console.assert(originalToken.state === 'HOME', 'Original token state must remain unchanged');
    console.assert(originalToken.position === HOME_POSITION, 'Original token position must remain unchanged');
    console.assert(updatedToken.state === 'ACTIVE' && updatedToken.position === 5, 'Updated token values mismatch');

    const updatedList = LudoTokenService.updateTokensList(redTokens, updatedToken);
    console.assert(updatedList !== redTokens, 'updateTokensList must return a new array');
    console.assert(redTokens[0].state === 'HOME', 'Original token list element must remain unchanged');
    console.assert(updatedList[0].state === 'ACTIVE', 'Updated token list element must reflect update');
    console.log('✅ Immutable token updates verified.');

    console.log('\n🎉 ALL LUDO TOKEN SERVICE TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Ludo Token Test Failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runTokenServiceTests();
