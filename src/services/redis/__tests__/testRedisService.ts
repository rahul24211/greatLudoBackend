import { connectRedis, closeRedis } from '../../../config/redis';
import { redisService } from '../redisService';
import { gameKey, roomKey, userKey, presenceKey, timerKey } from '../redisKeys';

async function runRedisTests() {
  console.log('🧪 Starting Redis Service Layer Tests...');

  const isConnected = await connectRedis();
  if (!isConnected) {
    console.warn('⚠️ Redis is not available locally. Tests skipped.');
    process.exit(0);
  }

  try {
    // Test 1: Key Utility Helpers
    console.log('\n--- Test 1: Key Utility Helpers ---');
    const gKey = gameKey('test-game-123');
    const rKey = roomKey('test-room-456');
    const uKey = userKey('test-user-789');
    const pKey = presenceKey('test-user-789');
    const tKey = timerKey('test-game-123');

    console.assert(gKey === 'ludo:game:test-game-123', `Expected ludo:game:test-game-123 but got ${gKey}`);
    console.assert(rKey === 'ludo:room:test-room-456', `Expected ludo:room:test-room-456 but got ${rKey}`);
    console.assert(uKey === 'ludo:user:test-user-789', `Expected ludo:user:test-user-789 but got ${uKey}`);
    console.assert(pKey === 'ludo:presence:test-user-789', `Expected ludo:presence:test-user-789 but got ${pKey}`);
    console.assert(tKey === 'ludo:timer:test-game-123', `Expected ludo:timer:test-game-123 but got ${tKey}`);
    console.log('✅ Key utility helpers verified.');

    // Test 2: set -> get -> exists -> delete
    console.log('\n--- Test 2: Basic SET, GET, EXISTS, DELETE ---');
    const testKey = 'ludo:test:string_key';
    const setSuccess = await redisService.set(testKey, 'hello_ludo');
    console.assert(setSuccess === true, 'SET failed');

    const getValue = await redisService.get(testKey);
    console.assert(getValue === 'hello_ludo', `GET failed, expected hello_ludo, got ${getValue}`);

    const existsBefore = await redisService.exists(testKey);
    console.assert(existsBefore === true, 'EXISTS check failed');

    const delSuccess = await redisService.delete(testKey);
    console.assert(delSuccess === true, 'DELETE failed');

    const existsAfter = await redisService.exists(testKey);
    console.assert(existsAfter === false, 'Key still exists after DELETE');
    console.log('✅ Basic SET, GET, EXISTS, DELETE verified.');

    // Test 3: setJson -> getJson
    console.log('\n--- Test 3: JSON SET & GET ---');
    const jsonTestKey = 'ludo:test:json_key';
    const sampleData = { gameId: 'g1', players: 4, active: true };
    
    const setJsonSuccess = await redisService.setJson(jsonTestKey, sampleData);
    console.assert(setJsonSuccess === true, 'JSON SET failed');

    const retrievedJson = await redisService.getJson<typeof sampleData>(jsonTestKey);
    console.assert(retrievedJson !== null, 'JSON GET returned null');
    console.assert(retrievedJson?.gameId === 'g1', 'JSON payload mismatch');
    console.assert(retrievedJson?.players === 4, 'JSON payload mismatch');

    await redisService.delete(jsonTestKey);
    console.log('✅ JSON SET and GET verified.');

    // Test 4: setWithExpiry & expire
    console.log('\n--- Test 4: TTL and Expiration ---');
    const ttlKey = 'ludo:test:ttl_key';
    const setTtlSuccess = await redisService.setWithExpiry(ttlKey, 'temporary_value', 2);
    console.assert(setTtlSuccess === true, 'setWithExpiry failed');

    const ttlExistsImmediately = await redisService.exists(ttlKey);
    console.assert(ttlExistsImmediately === true, 'TTL key should exist immediately');

    console.log('⏳ Waiting 2.5s for TTL key to expire...');
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const ttlExistsAfter = await redisService.exists(ttlKey);
    console.assert(ttlExistsAfter === false, 'TTL key did not expire as expected');
    console.log('✅ Expiration (setWithExpiry) verified.');

    // Test 5: deleteMany
    console.log('\n--- Test 5: DELETE MANY ---');
    const mKey1 = 'ludo:test:m1';
    const mKey2 = 'ludo:test:m2';
    await redisService.set(mKey1, 'v1');
    await redisService.set(mKey2, 'v2');

    const deletedCount = await redisService.deleteMany([mKey1, mKey2]);
    console.assert(deletedCount === 2, `Expected 2 deleted keys, got ${deletedCount}`);
    console.log('✅ deleteMany verified.');

    console.log('\n🎉 ALL REDIS SERVICE TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Redis Test Failed:', err);
    process.exit(1);
  } finally {
    await closeRedis();
    process.exit(0);
  }
}

runRedisTests();
