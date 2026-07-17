// ============================================================
// Channel + Model + Alias management (new simplified schema)
// ============================================================
import { getDb } from './db';
import { Channel, ChannelModel, ModelAlias } from './types';
import { nanoid } from 'nanoid';
import { encryptApiKey, decryptApiKey } from './crypto';

// ── Channels ──

export function listChannels(): Channel[] {
  const db = getDb();
  return db.prepare('SELECT * FROM channels ORDER BY priority ASC, created_at ASC').all() as Channel[];
}

export function getChannelById(id: string): Channel | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
}

export function createChannel(data: { name: string; base_url: string; api_key?: string; priority?: number; notes?: string }): Channel {
  const db = getDb();
  const id = nanoid(16);
  const encryptedKey = data.api_key ? encryptApiKey(data.api_key) : '';
  db.prepare(`INSERT INTO channels (id, name, base_url, api_key, priority, notes, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now', '+8 hours'))`)
    .run(id, data.name, data.base_url, encryptedKey, data.priority || 0, data.notes || '');
  return getChannelById(id)!;
}

export function updateChannel(id: string, data: Partial<{ name: string; base_url: string; api_key: string; priority: number; notes: string; is_active: number }>): boolean {
  const db = getDb();
  const sets: string[] = [];
  const params: any[] = [];
  for (const f of ['name', 'base_url', 'priority', 'notes', 'is_active'] as const) {
    if ((data as any)[f] !== undefined) { sets.push(`${f} = ?`); params.push((data as any)[f]); }
  }
  if (data.api_key !== undefined) { sets.push('api_key = ?'); params.push(data.api_key ? encryptApiKey(data.api_key) : ''); }
  if (sets.length === 0) return false;
  params.push(id);
  return db.prepare(`UPDATE channels SET ${sets.join(', ')} WHERE id = ?`).run(...params).changes > 0;
}

export function deleteChannel(id: string): boolean {
  return getDb().prepare('DELETE FROM channels WHERE id = ?').run(id).changes > 0;
}

export function updateChannelHealth(id: string, status: string) {
  getDb().prepare("UPDATE channels SET health_status = ?, last_health_check = datetime('now', '+8 hours') WHERE id = ?").run(status, id);
}

export function resolveChannelApiKey(channel: Channel): string {
  if (channel.api_key) return decryptApiKey(channel.api_key);
  return '';
}

// ── Channel Models ──

export function listChannelModels(channelId?: string): ChannelModel[] {
  const db = getDb();
  if (channelId) return db.prepare('SELECT * FROM channel_models WHERE channel_id = ? ORDER BY created_at ASC').all(channelId) as ChannelModel[];
  return db.prepare(`
    SELECT cm.*, c.name as channel_name FROM channel_models cm
    LEFT JOIN channels c ON c.id = cm.channel_id ORDER BY cm.created_at DESC
  `).all() as ChannelModel[];
}

export function createChannelModel(channelId: string, modelId: string): ChannelModel | null {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM channel_models WHERE channel_id = ? AND model_id = ?').get(channelId, modelId);
  if (existing) return null;
  const id = nanoid(16);
  db.prepare(`INSERT INTO channel_models (id, channel_id, model_id, is_active, created_at) VALUES (?, ?, ?, 1, datetime('now', '+8 hours'))`).run(id, channelId, modelId);
  return db.prepare('SELECT * FROM channel_models WHERE id = ?').get(id) as ChannelModel;
}

export function deleteChannelModel(id: string): boolean {
  return getDb().prepare('DELETE FROM channel_models WHERE id = ?').run(id).changes > 0;
}

// ── Model Aliases ──

export function listModelAliases(): ModelAlias[] {
  const db = getDb();
  return db.prepare(`
    SELECT ma.*, cm.model_id, c.name as channel_name FROM model_aliases ma
    LEFT JOIN channel_models cm ON cm.id = ma.channel_model_id
    LEFT JOIN channels c ON c.id = cm.channel_id
    ORDER BY ma.created_at DESC
  `).all() as ModelAlias[];
}

export function createModelAlias(aliasName: string, channelModelId: string): ModelAlias | null {
  const db = getDb();
  const id = nanoid(16);
  db.prepare(`INSERT INTO model_aliases (id, alias_name, channel_model_id, is_active, created_at) VALUES (?, ?, ?, 1, datetime('now', '+8 hours'))`).run(id, aliasName, channelModelId);
  return db.prepare('SELECT * FROM model_aliases WHERE id = ?').get(id) as ModelAlias;
}

export function deleteModelAlias(id: string): boolean {
  return getDb().prepare('DELETE FROM model_aliases WHERE id = ?').run(id).changes > 0;
}

// ── Routing ──

export function resolveModel(modelName: string, allowedChannelIds?: string[]): { channelId: string; upstreamModelId: string } | null {
  const db = getDb();

  // 1. Check aliases — prioritized by allowed channels if provided
  if (allowedChannelIds && allowedChannelIds.length > 0) {
    const placeholders = allowedChannelIds.map(() => '?').join(',');
    const alias = db.prepare(`
      SELECT ma.*, cm.model_id, cm.channel_id FROM model_aliases ma
      LEFT JOIN channel_models cm ON cm.id = ma.channel_model_id
      LEFT JOIN channels c ON c.id = cm.channel_id
      WHERE ma.alias_name = ? AND ma.is_active = 1 AND c.is_active = 1
        AND cm.channel_id IN (${placeholders})
      ORDER BY
        CASE c.health_status
          WHEN 'healthy' THEN 1
          WHEN 'unknown' THEN 2
          WHEN 'cooling_down' THEN 3
          ELSE 4
        END ASC
    `).get(modelName, ...allowedChannelIds) as any;
    if (alias) return { channelId: alias.channel_id, upstreamModelId: alias.model_id };
  }

  // 2. Check aliases — fallback to any channel
  const alias = db.prepare(`
    SELECT ma.*, cm.model_id, cm.channel_id FROM model_aliases ma
    LEFT JOIN channel_models cm ON cm.id = ma.channel_model_id
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE ma.alias_name = ? AND ma.is_active = 1 AND c.is_active = 1
      ORDER BY
        CASE c.health_status
          WHEN 'healthy' THEN 1
          WHEN 'unknown' THEN 2
          WHEN 'cooling_down' THEN 3
          ELSE 4
        END ASC
    `).get(modelName) as any;
  if (alias) return { channelId: alias.channel_id, upstreamModelId: alias.model_id };

  // 3. Check direct model_id match (only if channel is active, NO alias exists)
  const model = db.prepare(`
    SELECT cm.*, c.is_active as ch_active FROM channel_models cm
    LEFT JOIN channels c ON c.id = cm.channel_id
    LEFT JOIN model_aliases ma ON ma.channel_model_id = cm.id AND ma.is_active = 1
    WHERE cm.model_id = ? AND cm.is_active = 1 AND c.is_active = 1
      AND ma.id IS NULL
  `).get(modelName) as any;
  if (model) return { channelId: model.channel_id, upstreamModelId: model.model_id };

  return null;
}

export function getModelsForAuto(): { modelId: string; channel: Channel }[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT cm.model_id, c.* FROM channel_models cm
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE cm.is_active = 1 AND c.is_active = 1
      AND c.health_status != 'unhealthy'
      AND (
        c.health_status != 'cooling_down'
        OR c.last_health_check IS NULL
        OR c.last_health_check < datetime('now', '+8 hours', '-6 hours')
      )
  `).all() as any[];
  return rows.map(r => ({ modelId: r.model_id, channel: r as Channel }));
}

// ── Pull models from endpoint ──

export async function pullModelsFromEndpoint(baseUrl: string, apiKey: string): Promise<string[]> {
  // Construct the /models URL from the channel's base_url
  function buildModelsUrl(base: string): string {
    try {
      const url = new URL(base.replace(/\/+$/, ''));
      let path = url.pathname.replace(/\/+$/, '') || '/';

      if (path.endsWith('/chat/completions')) {
        // e.g. base_url ends with /chat/completions → replace with /models
        path = path.replace(/\/chat\/completions$/, '/models');
      } else if (path.endsWith('/v1')) {
        // e.g. /v1 → /v1/models
        path += '/models';
      } else {
        // Default: append /v1/models
        path = path.replace(/\/?$/, '/v1/models');
      }

      url.pathname = path;
      return url.toString();
    } catch {
      // Fallback for malformed URLs
      let b = base.replace(/\/+$/, '');
      if (b.endsWith('/chat/completions')) b = b.replace(/\/chat\/completions$/, '');
      if (!b.endsWith('/v1')) b += '/v1';
      return b + '/models';
    }
  }

  const primaryUrl = buildModelsUrl(baseUrl);
  let errMsg = '';

  const res = await fetch(primaryUrl, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) });
  if (res.ok) {
    const data = await res.json() as any;
    return extractModels(data);
  }
  errMsg = `Primary URL (${primaryUrl}): HTTP ${res.status}`;

  // Fallback: try /models without /v1 prefix
  const fallbackBase = baseUrl.replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
  const fallbackUrl = `${fallbackBase}/models`;
  try {
    const fallbackRes = await fetch(fallbackUrl, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10000) });
    if (fallbackRes.ok) {
      const data = await fallbackRes.json() as any;
      return extractModels(data);
    }
    errMsg += `; Fallback (${fallbackUrl}): HTTP ${fallbackRes.status}`;
  } catch (e) {
    errMsg += `; Fallback error: ${e instanceof Error ? e.message : e}`;
  }

  throw new Error(errMsg);
}

function extractModels(data: any): string[] {
  // OpenAI format: { data: [{ id: '...', ... }] }
  if (data?.data && Array.isArray(data.data)) {
    return data.data.map((m: any) => m.id || m.name).filter(Boolean);
  }
  // Some providers return flat array
  if (Array.isArray(data)) {
    return data.map((m: any) => m.id || m.model || m.name || String(m)).filter(Boolean);
  }
  // Object with model keys
  if (data?.models && Array.isArray(data.models)) {
    return data.models.map((m: any) => m.id || m.name).filter(Boolean);
  }
  return [];
}
