// ============================================================
// Key public access — password + session + rate limit
// ============================================================
import { nanoid } from 'nanoid';
import { getDb } from './db';
import { encryptApiKey, decryptApiKey } from './crypto';

export const DEFAULT_ACCESS_PASSWORD = '@123456789123Pk';
export const SESSION_DAYS = 30;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/;

export function isPasswordStrong(pwd: string): boolean {
  return typeof pwd === 'string' && PWD_RE.test(pwd);
}

export function getRelayKeyByName(name: string) {
  return getDb().prepare('SELECT * FROM relay_keys WHERE name = ?').get(name) as
    | {
        id: string;
        name: string;
        is_active: number;
        access_password_enc: string | null;
        access_password_set_at: string | null;
      }
    | undefined;
}

export function getRelayKeyPasswordStatus(name: string): {
  exists: boolean;
  isActive: boolean;
  hasPassword: boolean;
} | null {
  const k = getRelayKeyByName(name);
  if (!k) return null;
  return {
    exists: true,
    isActive: k.is_active === 1,
    hasPassword: !!k.access_password_enc,
  };
}

export type SetResult =
  | { ok: true; relayKeyId: string }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_SET' | 'WEAK_PASSWORD' };

export function setAccessPassword(name: string, pwd: string): SetResult {
  if (!isPasswordStrong(pwd)) return { ok: false, reason: 'WEAK_PASSWORD' };
  const k = getRelayKeyByName(name);
  if (!k) return { ok: false, reason: 'NOT_FOUND' };
  if (k.access_password_enc) return { ok: false, reason: 'ALREADY_SET' };
  const enc = encryptApiKey(pwd);
  getDb().prepare(`
    UPDATE relay_keys
    SET access_password_enc = ?, access_password_set_at = datetime('now', '+8 hours')
    WHERE id = ?
  `).run(enc, k.id);
  return { ok: true, relayKeyId: k.id };
}

export function verifyAccessPassword(name: string, pwd: string): boolean {
  const k = getRelayKeyByName(name);
  if (!k || !k.access_password_enc) return false;
  try {
    return decryptApiKey(k.access_password_enc) === pwd;
  } catch {
    return false;
  }
}

export function resetAccessPasswordToDefault(keyId: string): boolean {
  const enc = encryptApiKey(DEFAULT_ACCESS_PASSWORD);
  const r = getDb().prepare(`
    UPDATE relay_keys
    SET access_password_enc = ?, access_password_set_at = datetime('now', '+8 hours')
    WHERE id = ?
  `).run(enc, keyId);
  deleteSessionsForKey(keyId);
  return r.changes > 0;
}

export function createSession(relayKeyId: string, ip: string, userAgent: string) {
  const id = nanoid(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\..+$/, '');
  getDb().prepare(`
    INSERT INTO key_access_sessions (id, relay_key_id, ip, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, relayKeyId, ip.slice(0, 64), (userAgent || '').slice(0, 256), expiresAt);
  return { id, expiresAt };
}

export function getSessionById(id: string) {
  return getDb()
    .prepare('SELECT relay_key_id, expires_at FROM key_access_sessions WHERE id = ?')
    .get(id) as { relay_key_id: string; expires_at: string } | undefined;
}

export function deleteSession(id: string) {
  getDb().prepare('DELETE FROM key_access_sessions WHERE id = ?').run(id);
}

export function deleteSessionsForKey(keyId: string) {
  getDb().prepare('DELETE FROM key_access_sessions WHERE relay_key_id = ?').run(keyId);
}

// ---------- 内存限流 ----------
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const b = rateBuckets.get(ip);
  if (!b || now - b.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (b.count >= RATE_LIMIT_MAX) return false;
  b.count++;
  return true;
}

// 周期清理,避免内存泄漏
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 5;
  for (const [k, v] of rateBuckets) {
    if (v.windowStart < cutoff) rateBuckets.delete(k);
  }
}, RATE_LIMIT_WINDOW_MS).unref?.();