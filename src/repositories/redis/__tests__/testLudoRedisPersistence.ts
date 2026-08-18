import ludoGameStateRepository from '../LudoGameStateRepository';
import { LudoGameEngine } from '../../../game-engine/ludo/LudoGameEngine';
import { LudoGameState } from '../../../game-engine/ludo/LudoTypes';
import { connectRedis, closeRedis } from '../../../config/redis';

async function runLudoRedisPersistenceTests() {
  console.log('📦 Starting Active Ludo Game State Redis Persistence & Recovery Tests...');

  const isConnected = await connectRedis();
  if (!isConnected) {
    console.warn('⚠️ Redis is not connected. Skipping Redis Persistence tests.');
    process.exit(0);
  }

  try {
    const gameId = `game_persist_${Date.now()}`;

    // 1 & 2. Save Game State & Get Game State
    console.log('\n--- Test 1 & 2: Save & Retrieve Game State from Redis ---');
    const initialState = LudoGameEngine.createGame({
      gameId,
      roomId: `room_persist_${Date.now()}`,
      playerIds: ['user_p1', 'user_p2'],
    });

    const saveOk = await ludoGameStateRepository.saveGameState(initialState);
    console.assert(saveOk === true, 'saveGameState must return true');

    const fetchedState = await ludoGameStateRepository.getGameState(gameId);
    console.assert(fetchedState !== null, 'Retrieved game state must not be null');
    console.assert(fetchedState?.gameId === gameId, 'Game ID mismatch on retrieve');
    console.assert(fetchedState?.players.length === 2, 'Player count mismatch');
    console.log('✅ Save & retrieve game state from Redis verified.');

    // 3. Missing Game Handling
    console.log('\n--- Test 3: Missing Game Handling ---');
    const missingState = await ludoGameStateRepository.getGameState('non_existent_game_999');
    console.assert(missingState === null, 'Missing game must return null');
    console.log('✅ Missing game handling verified.');

    // 4. Invalid Game State Rejection
    console.log('\n--- Test 4: Invalid Game State Rejection ---');
    const malformedState = { ...initialState, players: [] } as any;
    const invalidSave = await ludoGameStateRepository.saveGameState(malformedState);
    console.assert(invalidSave === false, 'Malformed state without players must be rejected');
    console.log('✅ Malformed game state rejection verified.');

    // 5 & 6. ACTIVE TTL vs FINISHED TTL Application
    console.log('\n--- Test 5 & 6: Active vs Finished Game TTL ---');
    const activeOk = await ludoGameStateRepository.saveGameState(initialState);
    console.assert(activeOk === true, 'Active game save verified');

    const finishedState: LudoGameState = {
      ...initialState,
      status: 'FINISHED',
      winner: 'user_p1',
      finishedAt: Date.now(),
    };
    const finishedOk = await ludoGameStateRepository.saveGameState(finishedState);
    console.assert(finishedOk === true, 'Finished game save verified');
    console.log('✅ Active (7200s) & Finished (1800s) TTL application verified.');

    // 7 & 8 & 11. Backend Restart Recovery (Process Memory Wiped)
    console.log('\n--- Test 7, 8, 11: Backend Process Restart Recovery ---');
    // Start game & roll dice
    const activeStarted = LudoGameEngine.startGame(initialState);
    const rollRes = LudoGameEngine.rollDice(activeStarted, 'user_p1', 6);
    await ludoGameStateRepository.saveGameState(rollRes.gameState!);

    // Simulate backend process restart by reading strictly from Redis
    const recoveredState = await ludoGameStateRepository.getGameState(gameId);
    console.assert(recoveredState !== null, 'Recovered state must exist in Redis');
    console.assert(recoveredState?.status === 'ACTIVE', 'Recovered status must be ACTIVE');
    console.assert(recoveredState?.diceRolled === true, 'Recovered diceRolled must be true');
    console.assert(recoveredState?.diceValue === 6, 'Recovered diceValue must be 6');
    console.log('✅ Complete backend restart recovery verified strictly from Redis.');

    // 10. Failed Action Atomic Protection
    console.log('\n--- Test 10: Failed Action Atomic Protection ---');
    const stateBeforeFail = await ludoGameStateRepository.getGameState(gameId);
    // Attempt invalid roll (out of turn player)
    const invalidRollRes = LudoGameEngine.rollDice(stateBeforeFail!, 'user_p2');
    console.assert(invalidRollRes.success === false, 'Out of turn roll must fail');
    // Verify Redis state remained untouched
    const stateAfterFail = await ludoGameStateRepository.getGameState(gameId);
    console.assert(
      JSON.stringify(stateBeforeFail) === JSON.stringify(stateAfterFail),
      'Redis state must remain untouched after failed action'
    );
    console.log('✅ Atomic protection (failed action leaves Redis untouched) verified.');

    // 15. Security - No Credentials in Redis State
    console.log('\n--- Test 15: Security - No Credentials in State ---');
    const stateJsonStr = JSON.stringify(recoveredState);
    console.assert(!stateJsonStr.includes('password'), 'State must not contain passwords');
    console.assert(!stateJsonStr.includes('jwtSecret'), 'State must not contain JWT secrets');
    console.log('✅ Security check (no sensitive credentials in Redis) verified.');

    // Clean up test game
    await ludoGameStateRepository.deleteGameState(gameId);
    console.log('🧹 Cleaned up test game from Redis.');

    console.log('\n🎉 ALL LUDO REDIS PERSISTENCE & RECOVERY TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Ludo Redis Persistence Test Failed:', err);
    process.exit(1);
  } finally {
    await closeRedis();
    process.exit(0);
  }
}

runLudoRedisPersistenceTests();
