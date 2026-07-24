// ============================================================
// Channel + Model + Alias management (new simplified schema)
// Routing: resolveRoute() returns { publicName, channelId, upstreamModelId }
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

export function recordChannelSuccess(channelId: string) {
  const db = getDb();
  const ch = getChannelById(channelId);
  if (!ch) return;
  db.prepare(`
    UPDATE channels SET
      health_status = 'healthy',
      fail_count = 0,
      cooldown_until = NULL,
      last_health_check = datetime('now', '+8 hours')
    WHERE id = ?
  `).run(channelId);
}

export function recordChannelFailure(channelId: string, kind: 'quota' | 'failure') {
  const db = getDb();
  const ch = getChannelById(channelId);
  if (!ch) return;

  if (kind === 'quota') {
    // 额度上限 → 固定 6 小时冷却
    db.prepare(`
      UPDATE channels SET
        health_status = 'cooling_down',
        cooldown_until = datetime('now', '+8 hours', '+6 hours'),
        last_health_check = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(channelId);
  } else {
    // 真故障 → 指数退避（1→5→15→30 分钟封顶）
    const seq = [1, 5, 15, 30];
    const nextCount = (ch.fail_count || 0) + 1;
    const backoffMinutes = seq[Math.min(nextCount - 1, seq.length - 1)];
    db.prepare(`
      UPDATE channels SET
        health_status = 'unhealthy',
        fail_count = ?,
        cooldown_until = datetime('now', '+8 hours', '+' || ? || ' minutes'),
        last_health_check = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(nextCount, backoffMinutes, channelId);
  }
}

export function isChannelAvailable(ch: { is_active: number; cooldown_until: string | null; health_status: string }): boolean {
  if (!ch.is_active) return false;
  if (ch.cooldown_until && ch.cooldown_until > new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)) {
    return false;
  }
  return true;
}

export const AVAILABLE_CHANNEL_SQL = `(
  c.is_active = 1
  AND (
    c.cooldown_until IS NULL
    OR c.cooldown_until <= datetime('now', '+8 hours')
  )
)`;

export function getChannelHealthSummary(channelIds: string[]): Record<string, { recent_checks: any[]; uptime_pct: number; avg_latency_ms: number }> {
  if (channelIds.length === 0) return {};
  const db = getDb();

  const results: Record<string, { recent_checks: any[]; uptime_pct: number; avg_latency_ms: number }> = {};

  for (const chId of channelIds) {
    const checks = db.prepare(`
      SELECT checked_at, ok, kind, latency_ms, error FROM channel_health_checks
      WHERE channel_id = ?
      ORDER BY checked_at DESC LIMIT 30
    `).all(chId) as any[];

    const recent = checks.reverse(); // chrono order for UI
    const successCount = checks.filter((c: any) => c.ok === 1).length;
    const totalLatency = checks.reduce((s: number, c: any) => s + (c.latency_ms || 0), 0);

    results[chId] = {
      recent_checks: recent,
      uptime_pct: checks.length > 0 ? Math.round((successCount / checks.length) * 100) : 100,
      avg_latency_ms: checks.length > 0 ? Math.round(totalLatency / checks.length) : 0,
    };
  }

  return results;
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

export interface ResolvedRoute {
  publicName: string;       // 对外名：别名（设了）或原 ID（没设）
  channelId: string;
  upstreamModelId: string;  // 转发给上游用的真实 model_id
}

/**
 * Resolve a model name (as user provided it) to a concrete route.
 * Returns null if no available channel can serve it.
 *
 * - If user input has an alias → public_name = alias, routes to that alias's channel
 * - If user input has no alias but matches a channel_model.model_id → public_name = that id
 * - excludes/excludedChannels applied at channel level
 */
export function resolveRoute(
  modelName: string,
  allowedChannelIds?: string[],
  excludedChannelIds?: string[],
): ResolvedRoute | null {
  const db = getDb();

  // Build exclude clause (applied to both branches)
  let excludeClause = '';
  let excludeParams: string[] = [];
  if (excludedChannelIds && excludedChannelIds.length > 0) {
    const placeholders = excludedChannelIds.map(() => '?').join(',');
    excludeClause = ` AND c.id NOT IN (${placeholders})`;
    excludeParams = excludedChannelIds;
  }

  // Build allowed clause
  let allowedClause = '';
  let allowedParams: string[] = [];
  if (allowedChannelIds && allowedChannelIds.length > 0) {
    const placeholders = allowedChannelIds.map(() => '?').join(',');
    allowedClause = ` AND cm.channel_id IN (${placeholders})`;
    allowedParams = allowedChannelIds;
  }

  // Single SQL: alias match + direct model_id match in one go (UNION)
  // Prioritize: alias matches first (they shadow the raw model_id)
  const sql = `
    SELECT * FROM (
      SELECT
        ma.alias_name AS public_name,
        cm.model_id AS upstream_model_id,
        cm.channel_id AS channel_id,
        c.health_status AS health_status,
        1 AS source_priority
      FROM model_aliases ma
      JOIN channel_models cm ON cm.id = ma.channel_model_id
      JOIN channels c ON c.id = cm.channel_id
      WHERE ma.alias_name = ? AND ma.is_active = 1
        AND cm.is_active = 1 AND ${AVAILABLE_CHANNEL_SQL}${allowedClause}${excludeClause}

      UNION ALL

      SELECT
        cm.model_id AS public_name,
        cm.model_id AS upstream_model_id,
        cm.channel_id AS channel_id,
        c.health_status AS health_status,
        2 AS source_priority
      FROM channel_models cm
      JOIN channels c ON c.id = cm.channel_id
      WHERE cm.model_id = ? AND cm.is_active = 1 AND ${AVAILABLE_CHANNEL_SQL}${allowedClause}${excludeClause}
        AND NOT EXISTS (
          SELECT 1 FROM model_aliases ma
          WHERE ma.channel_model_id = cm.id AND ma.is_active = 1
        )
    )
    ORDER BY source_priority ASC,
      CASE health_status
        WHEN 'healthy' THEN 1
        WHEN 'unknown' THEN 2
        WHEN 'cooling_down' THEN 3
        ELSE 4
      END ASC
    LIMIT 1
  `;

  const row = db.prepare(sql).get(modelName, ...allowedParams, ...excludeParams, modelName, ...allowedParams, ...excludeParams) as any;
  if (!row) return null;
  return {
    publicName: row.public_name,
    channelId: row.channel_id,
    upstreamModelId: row.upstream_model_id,
  };
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

// ── Pricing Sync ──

export function findChannelsWithSamePricingKey(channelModelId: string): {
  channels: Array<{ channel_id: string; channel_name: string }>;
  count: number;
} {
  const db = getDb();

  // 1. 获取当前 channel_model
  const cm = db.prepare('SELECT * FROM channel_models WHERE id = ?').get(channelModelId) as ChannelModel | undefined;
  if (!cm) return { channels: [], count: 0 };

  // 2. 获取当前 channel_model 的别名
  const alias = db.prepare('SELECT * FROM model_aliases WHERE channel_model_id = ? AND is_active = 1').get(channelModelId) as ModelAlias | undefined;
  const aliasName = alias?.alias_name || null;

  // 3. 查找其他 channel 中相同 model_id 的行
  const sameModelRows = db.prepare(`
    SELECT cm.id, cm.channel_id FROM channel_models cm
    WHERE cm.model_id = ? AND cm.id != ?
  `).all(cm.model_id, channelModelId) as Array<{ id: string; channel_id: string }>;

  // 4. 逐一检查别名是否匹配
  const matchedChannels: Array<{ channel_id: string; channel_name: string }> = [];
  for (const row of sameModelRows) {
    const otherAlias = db.prepare('SELECT * FROM model_aliases WHERE channel_model_id = ? AND is_active = 1').get(row.id) as ModelAlias | undefined;
    const otherAliasName = otherAlias?.alias_name || null;

    // 别名一致（同为 null 或相同字符串）才算匹配
    if ((aliasName === null && otherAliasName === null) || (aliasName !== null && otherAliasName === aliasName)) {
      const ch = db.prepare('SELECT name FROM channels WHERE id = ?').get(row.channel_id) as { name: string } | undefined;
      if (ch) matchedChannels.push({ channel_id: row.channel_id, channel_name: ch.name });
    }
  }

  return { channels: matchedChannels, count: matchedChannels.length };
}
