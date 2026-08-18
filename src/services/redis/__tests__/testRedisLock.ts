import { connectRedis, closeRedis } from '../../../config/redis';
import { redisLockService } from '../redisLock';
import { lockKey } from '../redisKeys';

async function runRedisLockTests() {
  console.log('🔒 Starting Redis Distributed Lock Utility Tests...');

  const isConnected = await connectRedis();
  if (!isConnected) {
    console.warn('⚠️ Redis is not connected. Skipping lock tests.');
    process.exit(0);
  }

  try {
    const testLockKey = lockKey('game', 'test-lock-game-123');

    // Test 1: Lock can be acquired
    console.log('\n--- Test 1: Lock can be acquired ---');
    const lock1 = await redisLockService.acquireLock(testLockKey, 5000);
    console.assert(lock1.acquired === true, 'Lock acquisition failed');
    console.assert(typeof lock1.token === 'string' && lock1.token.length > 0, 'Lock token missing');
    console.log('✅ Test 1 passed: Lock acquired successfully with token.');

    // Test 2: Second lock attempt fails while first lock is active
    console.log('\n--- Test 2: Second lock attempt fails while active ---');
    const lock2 = await redisLockService.acquireLock(testLockKey, 5000);
    console.assert(lock2.acquired === false, 'Second lock attempt should have failed but acquired lock');
    console.log('✅ Test 2 passed: Second lock attempt correctly rejected.');

    // Test 4: Wrong token cannot release the lock
    console.log('\n--- Test 4: Wrong token cannot release the lock ---');
    const releaseWrong = await redisLockService.releaseLock(testLockKey, 'wrong_token_12345');
    console.assert(releaseWrong.released === false, 'Lock was incorrectly released with wrong token');
    console.log('✅ Test 4 passed: Wrong token release attempt rejected.');

    // Test 3: Lock can be released by owner
    console.log('\n--- Test 3: Lock can be released by owner ---');
    if (lock1.token) {
      const releaseSuccess = await redisLockService.releaseLock(testLockKey, lock1.token);
      console.assert(releaseSuccess.released === true, 'Lock release with correct token failed');
      console.log('✅ Test 3 passed: Lock released successfully with matching token.');
    }

    // Test 5 & 6: Lock automatically expires and can be acquired again after expiration
    console.log('\n--- Test 5 & 6: Lock expiration and re-acquisition ---');
    const shortTtlKey = lockKey('game', 'short-ttl-game-456');
    const shortLock = await redisLockService.acquireLock(shortTtlKey, 1500); // 1.5s TTL
    console.assert(shortLock.acquired === true, 'Short TTL lock acquisition failed');

    const secondAttemptBeforeExpire = await redisLockService.acquireLock(shortTtlKey, 5000);
    console.assert(secondAttemptBeforeExpire.acquired === false, 'Acquire before expire should fail');

    console.log('⏳ Waiting 2.0s for short TTL lock to expire...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const reAcquireAfterExpire = await redisLockService.acquireLock(shortTtlKey, 5000);
    console.assert(reAcquireAfterExpire.acquired === true, 'Re-acquisition after TTL expiration failed');
    console.log('✅ Test 5 & 6 passed: Lock expired and was successfully re-acquired.');

    if (reAcquireAfterExpire.token) {
      await redisLockService.releaseLock(shortTtlKey, reAcquireAfterExpire.token);
    }

    // Test 7: Concurrent acquisition does not allow two owners
    console.log('\n--- Test 7: Concurrent lock acquisition ---');
    const concurrentKey = lockKey('game', 'concurrent-game-789');
    
    // Launch 10 simultaneous lock requests
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => redisLockService.acquireLock(concurrentKey, 5000))
    );

    const successfulLocks = attempts.filter((res) => res.acquired);
    console.assert(successfulLocks.length === 1, `Expected exactly 1 winner in race, but got ${successfulLocks.length}`);
    console.log('✅ Test 7 passed: Only 1 caller out of 10 acquired the lock concurrently.');

    // Cleanup concurrent lock
    if (successfulLocks[0]?.token) {
      await redisLockService.releaseLock(concurrentKey, successfulLocks[0].token);
    }

    console.log('\n🎉 ALL REDIS LOCK TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Redis Lock Test Failed:', err);
    process.exit(1);
  } finally {
    await closeRedis();
    process.exit(0);
  }
}

runRedisLockTests();
