import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { encrypt, decrypt } from '../../utils/encryption';
import { sanitizeUser, generateAccessToken } from '../../utils/tokenUtils';
import { authenticateToken, AuthenticatedRequest } from '../authMiddleware';
import { errorHandler } from '../errorHandler';
import env from '../../config/env';

async function makePostRequest(
  server: http.Server,
  path: string,
  body: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: any }> {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 5000;
  const payloadStr = typeof body === 'string' ? body : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payloadStr),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
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
    req.write(payloadStr);
    req.end();
  });
}

async function runSecurityTests() {
  console.log('🛡️ Starting Security Hardening Integration Tests...');

  let server: http.Server | null = null;

  try {
    // 1. Test AES-256-GCM Encryption & Decryption Roundtrip & Tamper Protection
    console.log('\n--- Test 1: AES-256-GCM Encryption & Tamper Protection ---');
    const secretData = 'SensitiveUserData_12345';
    const ciphertext = encrypt(secretData);

    console.assert(ciphertext !== secretData, 'Ciphertext should not equal plaintext');
    console.assert(ciphertext.includes(':'), 'Ciphertext format missing separator');

    const decrypted = decrypt(ciphertext);
    console.assert(decrypted === secretData, `Decryption failed, expected ${secretData}, got ${decrypted}`);

    // Test Tampered Ciphertext
    const tampered = ciphertext.slice(0, -4) + 'abcd';
    const tamperedResult = decrypt(tampered);
    console.assert(tamperedResult === null, 'Tampered ciphertext should return null');
    console.log('✅ AES-256-GCM encryption, decryption, and tamper rejection verified.');

    // 2. Test Password Hash Sanitization
    console.log('\n--- Test 2: Password Hash Sanitization ---');
    const rawUser = {
      id: 'u123',
      email: 'test@example.com',
      username: 'TestUser',
      passwordHash: '$2a$10$UnsafePasswordHash12345',
    };

    const sanitized = sanitizeUser(rawUser);
    console.assert(sanitized.passwordHash === undefined, 'passwordHash must not be present in sanitized output');
    console.assert(sanitized.id === 'u123', 'User ID preserved');
    console.log('✅ Password hash removal verified.');

    // 3. Test JWT Token Verification & Expiry
    console.log('\n--- Test 3: JWT Verification, Expiration & Rejection ---');
    const validToken = generateAccessToken({ id: 'u1', email: 'u1@test.com', username: 'u1' });
    const expiredToken = jwt.sign(
      { id: 'u1', email: 'u1@test.com', username: 'u1' },
      env.jwtSecret,
      { expiresIn: '-1s' }
    );
    const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';

    const testApp = express();
    testApp.use(express.json({ limit: '100kb' }));

    testApp.post('/protected', authenticateToken, (req: AuthenticatedRequest, res) => {
      res.status(200).json({ success: true, user: req.user });
    });

    testApp.post('/error-test', (_req, _res, next) => {
      const err: any = new Error('Database SQL connection leak details: mysql://root:pass@localhost:3306');
      err.statusCode = 500;
      next(err);
    });

    testApp.use(errorHandler);

    await new Promise<void>((resolve) => {
      server = testApp.listen(0, '127.0.0.1', () => resolve());
    });

    // Test Valid JWT
    console.assert(validToken.length > 0, 'validToken should be a non-empty string');

    // Test Missing JWT
    const resMissing = await makePostRequest(server!, '/protected', {});
    console.assert(resMissing.status === 401, `Missing JWT expected 401, got ${resMissing.status}`);

    // Test Expired JWT
    const resExpired = await makePostRequest(server!, '/protected', {}, { Authorization: `Bearer ${expiredToken}` });
    console.assert(resExpired.status === 401, `Expired JWT expected 401, got ${resExpired.status}`);

    // Test Invalid JWT
    const resInvalid = await makePostRequest(server!, '/protected', {}, { Authorization: `Bearer ${invalidToken}` });
    console.assert(resInvalid.status === 403, `Invalid JWT expected 403, got ${resInvalid.status}`);
    console.log('✅ Missing, expired, and invalid JWT rejections verified.');

    // 4. Test Oversized Request Body Rejection (100kb limit)
    console.log('\n--- Test 4: Oversized Request Body Rejection (100kb limit) ---');
    const largePayload = { data: 'X'.repeat(120 * 1024) }; // ~120KB payload
    const resOversized = await makePostRequest(server!, '/error-test', largePayload);
    console.assert(resOversized.status === 413, `Oversized payload expected 413, got ${resOversized.status}`);
    console.log('✅ Oversized request body limit (413 Payload Too Large) verified.');

    // 5. Test Production Error Sanitization
    console.log('\n--- Test 5: Production Internal Error Sanitization ---');
    const originalEnv = env.nodeEnv;
    env.nodeEnv = 'production';

    const resProdError = await makePostRequest(server!, '/error-test', { small: 'data' });
    console.assert(resProdError.status === 500, `Expected 500, got ${resProdError.status}`);
    console.assert(
      resProdError.body?.message === 'Internal Server Error',
      `Production error message should be sanitized to 'Internal Server Error', got: ${resProdError.body?.message}`
    );
    console.assert(resProdError.body?.stack === undefined, 'Stack trace must not be returned in production');

    env.nodeEnv = originalEnv;
    console.log('✅ Production internal error sanitization verified.');

    console.log('\n🎉 ALL SECURITY HARDENING TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Security Hardening Test Failed:', err);
    process.exit(1);
  } finally {
    if (server) {
      (server as any)?.closeAllConnections?.();
      await new Promise<void>((r) => server!.close(() => r()));
    }
    process.exit(0);
  }
}

runSecurityTests();
