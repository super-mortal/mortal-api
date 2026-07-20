import { getDb } from './db';
import { RelayKey } from './types';
import { nanoid } from 'nanoid';

export function generateRelayKey(): string {
  return 'sk-mortal-' + nanoid(32);
}

export function createRelayKey(name: string, balance: number, expiresAt?: string | null, allowedModels?: string, allowedChannels?: string, isPinned?: number): RelayKey {
  const db = getDb();
  const id = nanoid(16);
  const key = generateRelayKey();
  db.prepare(`
    INSERT INTO relay_keys (id, key, name, balance, expires_at, allowed_models, allowed_channels, is_active, is_pinned, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now', '+8 hours'))
  `).run(id, key, name, balance, expiresAt || null, allowedModels || '', allowedChannels || '', isPinned ?? 0);
  return getRelayKeyById(id)!;
}

export function getRelayKeyById(id: string): RelayKey | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM relay_keys WHERE id = ?').get(id) as RelayKey | undefined;
}

export function getRelayKeyByKey(key: string): RelayKey | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM relay_keys WHERE key = ?').get(key) as RelayKey | undefined;
}

export function listRelayKeys(): RelayKey[] {
  const db = getDb();
  return db.prepare('SELECT * FROM relay_keys ORDER BY is_pinned DESC, created_at DESC').all() as RelayKey[];
}

export function updateRelayKey(
  id: string,
  data: { name?: string; balance?: number; is_active?: number; is_pinned?: number; expires_at?: string | null; allowed_models?: string; allowed_channels?: string }
): boolean {
  const db = getDb();
  const sets: string[] = [];
  const params: any[] = [];
  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
  if (data.balance !== undefined) { sets.push('balance = ?'); params.push(data.balance); }
  if (data.is_active !== undefined) { sets.push('is_active = ?'); params.push(data.is_active); }
  if (data.is_pinned !== undefined) { sets.push('is_pinned = ?'); params.push(data.is_pinned); }
  if (data.expires_at !== undefined) { sets.push('expires_at = ?'); params.push(data.expires_at); }
  if (data.allowed_models !== undefined) { sets.push('allowed_models = ?'); params.push(data.allowed_models); }
  if (data.allowed_channels !== undefined) { sets.push('allowed_channels = ?'); params.push(data.allowed_channels); }
  if (sets.length === 0) return false;
  sets.push("updated_at = datetime('now', '+8 hours')");
  params.push(id);
  const result = db.prepare(`UPDATE relay_keys SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return result.changes > 0;
}

export function refreshRelayKey(id: string): string | null {
  const db = getDb();
  const newKey = generateRelayKey();
  const result = db.prepare("UPDATE relay_keys SET key = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?").run(newKey, id);
  return result.changes > 0 ? newKey : null;
}

export function deleteRelayKey(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM relay_keys WHERE id = ?').run(id);
  return result.changes > 0;
}

export function checkRelayKeyQuota(key: string, estimatedTokens: number): { valid: boolean; reason?: string } {
  const relayKey = getRelayKeyByKey(key);
  if (!relayKey) return { valid: false, reason: 'API key not found' };
  if (!relayKey.is_active) return { valid: false, reason: 'API key is disabled' };
  if (relayKey.expires_at && new Date(relayKey.expires_at) < new Date()) {
    return { valid: false, reason: 'API key has expired' };
  }
  if (relayKey.balance > 0 && relayKey.used_tokens + estimatedTokens > relayKey.balance) {
    return { valid: false, reason: 'Insufficient quota' };
  }
  return { valid: true };
}

export function addUsedTokens(keyId: string, tokens: number) {
  const db = getDb();
  db.prepare("UPDATE relay_keys SET used_tokens = used_tokens + ?, updated_at = datetime('now', '+8 hours') WHERE id = ?")
    .run(tokens, keyId);
}

/** Get allowed channel IDs for a relay key */
export function getAllowedChannelIds(relayKey: RelayKey): string[] {
  if (!relayKey.allowed_channels) return [];
  return relayKey.allowed_channels.split(',').map(c => c.trim()).filter(Boolean);
}
