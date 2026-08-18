import crypto from 'crypto';
import env from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM

function getDerivedKey(): Buffer {
  return crypto.createHash('sha256').update(env.encryptionKey).digest();
}

/**
 * Encrypt sensitive string data using AES-256-GCM authenticated encryption.
 * Output format: "ivHex:authTagHex:encryptedHex"
 */
export function encrypt(text: string): string {
  if (!text) return text;
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt AES-256-GCM encrypted data.
 * Verifies authentication tag. Returns null if data is tampered or invalid.
 */
export function decrypt(encryptedText: string): string | null {
  if (!encryptedText || !encryptedText.includes(':')) return null;

  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getDerivedKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch {
    // Decryption failed or authentication tag mismatch
    return null;
  }
}
