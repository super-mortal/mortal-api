// ============================================================
// API Key Encryption — encrypt keys stored in DB
// ============================================================
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
// Derive a 32-byte key from JWT_SECRET (or a fixed fallback)
function getKey(): Buffer {
  const secret = process.env.JWT_SECRET || 'mortal-api-default-encryption-key-2024';
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptApiKey(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptApiKey(encoded: string): string {
  if (!encoded) return '';
  try {
    const key = getKey();
    const parts = encoded.split(':');
    if (parts.length !== 3) return encoded; // not encrypted
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encoded; // fallback: return as-is
  }
}
