// ============================================================
// Channel health monitor — periodic probing + history recording
// ============================================================
import { getDb } from './db';
import { listChannels, recordChannelSuccess, recordChannelFailure, resolveChannelApiKey } from './channels';
import { getChatUrl } from './proxy';
import { nanoid } from 'nanoid';

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const PROBE_TIMEOUT_MS = 10000;

const GLOBAL_KEY = '__healthMonitor';

export function startHealthMonitor(): void {
  if ((globalThis as any)[GLOBAL_KEY]?.started) return;
  (globalThis as any)[GLOBAL_KEY] = { started: true, timer: null };

  // Run one round immediately on startup
  runHealthCheck().catch(() => {});

  // Schedule recurring rounds
  (globalThis as any)[GLOBAL_KEY].timer = setInterval(() => {
    runHealthCheck().catch(() => {});
  }, INTERVAL_MS);
}

export async function runHealthCheck(): Promise<void> {
  const channels = listChannels().filter(c => c.is_active);
  for (const ch of channels) {
    try {
      await probeChannel(ch);
    } catch {
      // Individual channel probe failure shouldn't stop others
    }
  }
}

export async function probeChannel(ch: {
  id: string; name: string; base_url: string; api_key: string;
}): Promise<{ ok: boolean; kind: string | null; latency_ms: number; error: string | null }> {
  const db = getDb();
  const start = Date.now();

  try {
    // Find first active model for this channel
    const modelRow = db.prepare(`
      SELECT model_id FROM channel_models WHERE channel_id = ? AND is_active = 1 LIMIT 1
    `).get(ch.id) as { model_id: string } | undefined;

    const url = getChatUrl(ch.base_url);
    const body = modelRow
      ? { model: modelRow.model_id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }
      : undefined;

    const decryptedKey = resolveChannelApiKey(ch as any);

    // If no model, fall back to GET /models endpoint
    if (!body) {
      const modelsUrl = url.replace(/\/chat\/completions$/, '/models');
      const res = await fetch(modelsUrl, {
        headers: { Authorization: `Bearer ${decryptedKey}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        recordChannelSuccess(ch.id);
        insertHealthCheck(ch.id, 1, null, latency, null);
        return { ok: true, kind: null, latency_ms: latency, error: null };
      }
      const kind = res.status === 429 ? 'quota' : 'failure';
      recordChannelFailure(ch.id, kind);
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      insertHealthCheck(ch.id, 0, kind, latency, errText.slice(0, 300));
      return { ok: false, kind, latency_ms: latency, error: errText.slice(0, 300) };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${decryptedKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const latency = Date.now() - start;

    if (res.ok) {
      recordChannelSuccess(ch.id);
      insertHealthCheck(ch.id, 1, null, latency, null);
      return { ok: true, kind: null, latency_ms: latency, error: null };
    }

    const kind = res.status === 429 ? 'quota' : 'failure';
    recordChannelFailure(ch.id, kind);
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    insertHealthCheck(ch.id, 0, kind, latency, errText.slice(0, 300));
    return { ok: false, kind, latency_ms: latency, error: errText.slice(0, 300) };
  } catch (e: any) {
    const latency = Date.now() - start;
    const error = e?.message || e?.code || 'Probe failed';
    recordChannelFailure(ch.id, 'failure');
    insertHealthCheck(ch.id, 0, 'failure', latency, error.slice(0, 300));
    return { ok: false, kind: 'failure', latency_ms: latency, error: error.slice(0, 300) };
  }
}

function insertHealthCheck(channelId: string, ok: number, kind: string | null, latencyMs: number, error: string | null) {
  const db = getDb();
  db.prepare(`
    INSERT INTO channel_health_checks (id, channel_id, checked_at, ok, kind, latency_ms, error)
    VALUES (?, ?, datetime('now', '+8 hours'), ?, ?, ?, ?)
  `).run(nanoid(16), channelId, ok, kind, latencyMs, error);
}
