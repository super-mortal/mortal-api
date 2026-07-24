import { getDb } from './db';
import { RelayKey } from './types';
import { nanoid } from 'nanoid';

export function generateRelayKey(): string {
  return 'sk-mortal-' + nanoid(32);
}

export function createRelayKey(name: string, spendLimit: number, expiresAt?: string | null, allowedModels?: string, allowedChannels?: string, isPinned?: number): RelayKey {
  const db = getDb();
  const id = nanoid(16);
  const key = generateRelayKey();
  db.prepare(`
    INSERT INTO relay_keys (id, key, name, spend_limit, expires_at, allowed_models, allowed_channels, is_active, is_pinned, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now', '+8 hours'))
  `).run(id, key, name, spendLimit, expiresAt || null, allowedModels || '', allowedChannels || '', isPinned ?? 0);
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
  data: { name?: string; spend_limit?: number; is_active?: number; is_pinned?: number; expires_at?: string | null; allowed_models?: string; allowed_channels?: string }
): boolean {
  const db = getDb();
  const sets: string[] = [];
  const params: any[] = [];
  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
  if (data.spend_limit !== undefined) { sets.push('spend_limit = ?'); params.push(data.spend_limit); }
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

export function checkRelayKeyQuota(key: string, estimatedTokens: number, estimatedCost?: number): { valid: boolean; reason?: string } {
  const relayKey = getRelayKeyByKey(key);
  if (!relayKey) return { valid: false, reason: 'API key not found' };
  if (!relayKey.is_active) return { valid: false, reason: 'API key is disabled' };
  if (relayKey.expires_at && new Date(relayKey.expires_at) < new Date()) {
    return { valid: false, reason: 'API key has expired' };
  }
  if (relayKey.spend_limit > 0 && (relayKey.total_spent + (estimatedCost || 0)) > relayKey.spend_limit) {
    return { valid: false, reason: 'Insufficient quota' };
  }
  return { valid: true };
}

export function recordAndCheckSpending(keyId: string, cost: number): void {
  const db = getDb();
  db.transaction(() => {
    // 累加消费
    db.prepare("UPDATE relay_keys SET total_spent = total_spent + ?, updated_at = datetime('now', '+8 hours') WHERE id = ?")
      .run(cost, keyId);
    // 金额超限自动禁用
    db.prepare(`
      UPDATE relay_keys SET is_active = 0, updated_at = datetime('now', '+8 hours')
      WHERE id = ? AND spend_limit > 0 AND total_spent >= spend_limit AND is_active = 1
    `).run(keyId);
    // 到期自动禁用
    db.prepare(`
      UPDATE relay_keys SET is_active = 0, updated_at = datetime('now', '+8 hours')
      WHERE id = ? AND expires_at IS NOT NULL AND expires_at <= datetime('now', '+8 hours') AND is_active = 1
    `).run(keyId);
  })();
}

/** Get allowed channel IDs for a relay key */
export function getAllowedChannelIds(relayKey: RelayKey): string[] {
  if (!relayKey.allowed_channels) return [];
  return relayKey.allowed_channels.split(',').map(c => c.trim()).filter(Boolean);
}

export function resetAccessPasswordToDefaultById(id: string): boolean {
  return (require('@/lib/key-access') as typeof import('@/lib/key-access'))
    .resetAccessPasswordToDefault(id);
}
