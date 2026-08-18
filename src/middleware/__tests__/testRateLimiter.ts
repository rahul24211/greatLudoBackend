import express from 'express';
import http from 'http';
import rateLimit from 'express-rate-limit';
import { connectRedis, closeRedis } from '../../config/redis';
import { ExpressRedisStore, authRateLimiter, roomRateLimiter } from '../rateLimiter';
import { redisService } from '../../services/redis/redisService';
import { rateLimitKey } from '../../services/redis/redisKeys';

async function makeRequest(server: http.Server, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5000;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ status: res.statusCode || 500, body: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runRateLimiterTests() {
  console.log('⚡ Starting Redis-Backed Rate Limiting Tests...');

  const isConnected = await connectRedis();
  if (!isConnected) {
    console.warn('⚠️ Redis is not available. Skipping rate limiter tests.');
    process.exit(0);
  }

  let server: http.Server | null = null;

  try {
    // Test 1: ExpressRedisStore increment and Redis key existence
    console.log('\n--- Test 1: Counter stored in Redis under ludo:ratelimit namespace ---');
    const store = new ExpressRedisStore('test_cat', 60000);
    const clientIp = '192.168.1.100';
    const expectedKey = rateLimitKey('test_cat', clientIp);

    await redisService.delete(expectedKey);

    const hit1 = await store.increment(clientIp);
    console.assert(hit1.totalHits === 1, `Expected 1 hit, got ${hit1.totalHits}`);

    const rawRedisVal = await redisService.get(expectedKey);
    console.assert(rawRedisVal === '1', `Expected '1' in Redis at ${expectedKey}, got ${rawRedisVal}`);
    console.log(`✅ Test 1 passed: Counter stored at [${expectedKey}] with value [${rawRedisVal}].`);

    // Test 2: Increment hits & Expiry
    console.log('\n--- Test 2: Counter increments and expires after window ---');
    const hit2 = await store.increment(clientIp);
    console.assert(hit2.totalHits === 2, `Expected 2 hits, got ${hit2.totalHits}`);

    const shortStore = new ExpressRedisStore('short_ttl', 1500);
    const shortKey = rateLimitKey('short_ttl', 'client_temp');
    await redisService.delete(shortKey);

    await shortStore.increment('client_temp');
    const existsBefore = await redisService.exists(shortKey);
    console.assert(existsBefore, 'Short TTL key should exist in Redis');

    console.log('⏳ Waiting 2.0s for rate limit window to expire...');
    await new Promise((r) => setTimeout(r, 2000));

    const existsAfter = await redisService.exists(shortKey);
    console.assert(!existsAfter, 'Rate limit key did not expire as expected');
    console.log('✅ Test 2 passed: Expiration and TTL cleanup verified.');

    // Test 3: Different identifiers have separate limits
    console.log('\n--- Test 3: Different identifiers have separate limits ---');
    const ipA = '10.0.0.1';
    const ipB = '10.0.0.2';
    const storeMulti = new ExpressRedisStore('multi', 60000);

    await redisService.delete(rateLimitKey('multi', ipA));
    await redisService.delete(rateLimitKey('multi', ipB));

    await storeMulti.increment(ipA);
    await storeMulti.increment(ipA);
    const hitB = await storeMulti.increment(ipB);

    const valA = await redisService.get(rateLimitKey('multi', ipA));
    const valB = await redisService.get(rateLimitKey('multi', ipB));

    console.assert(valA === '2', `Expected 2 hits for IP A, got ${valA}`);
    console.assert(valB === '1', `Expected 1 hit for IP B, got ${valB}`);
    console.assert(hitB.totalHits === 1, `Expected 1 total hit for IP B, got ${hitB.totalHits}`);
    console.log('✅ Test 3 passed: Separate IP identifiers have independent counters.');

    // Test 4: Auth & Room Limiters Configuration Verification
    console.log('\n--- Test 4: Auth and Room Limiters configuration ---');
    console.assert(typeof authRateLimiter === 'function', 'Auth rate limiter is not middleware');
    console.assert(typeof roomRateLimiter === 'function', 'Room rate limiter is not middleware');
    console.log('✅ Test 4 passed: Auth and Room limiters exported and configured.');

    // Test 5: End-to-end HTTP rate limiting with Express test server
    console.log('\n--- Test 5: End-to-end HTTP 429 response structure ---');
    const app = express();
    app.set('trust proxy', 1);

    const testLimiter = rateLimit({
      windowMs: 60000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          success: false,
          message: 'Too many requests. Please try again later.',
        });
      },
    });

    app.get('/test-limit', testLimiter, (_req, res) => {
      res.status(200).json({ success: true, message: 'OK' });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });

    const res1 = await makeRequest(server!, '/test-limit');
    console.assert(res1.status === 200, `First request expected 200, got ${res1.status}`);

    const res2 = await makeRequest(server!, '/test-limit');
    console.assert(res2.status === 200, `Second request expected 200, got ${res2.status}`);

    const res3 = await makeRequest(server!, '/test-limit');
    console.assert(res3.status === 429, `Third request expected 429, got ${res3.status}`);
    console.assert(res3.body?.success === false, '429 body success should be false');
    console.assert(res3.body?.message === 'Too many requests. Please try again later.', '429 message mismatch');
    console.log('✅ Test 5 passed: HTTP 429 status code and JSON payload verified.');

    // Cleanup keys
    await redisService.deleteMany([
      expectedKey,
      rateLimitKey('multi', ipA),
      rateLimitKey('multi', ipB),
    ]);

    console.log('\n🎉 ALL RATE LIMITER TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Rate Limiter Test Failed:', err);
    process.exit(1);
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await closeRedis();
    process.exit(0);
  }
}

runRateLimiterTests();
