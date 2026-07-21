// ============================================================
// GET/POST /api/admin/backup — backup & restore
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { getDb } from '@/lib/db';
import { encryptApiKey } from '@/lib/crypto';

export async function GET() {
  const db = getDb();
  const backup = {
    version: 2,
    created_at: new Date().toISOString(),
    relay_keys: db.prepare('SELECT * FROM relay_keys').all(),
    channels: db.prepare('SELECT * FROM channels').all(),
    channel_models: db.prepare('SELECT * FROM channel_models').all(),
    model_aliases: db.prepare('SELECT * FROM model_aliases').all(),
    model_pricing: db.prepare('SELECT * FROM model_pricing').all(),
    call_logs: db.prepare('SELECT * FROM call_logs').all(),
  };
  return NextResponse.json(backup);
}

export async function POST(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;

  try {
    const data = await request.json();
    const db = getDb();

    if (!data.version || !data.relay_keys || !data.channels) {
      return NextResponse.json({ error: 'Invalid backup format' }, { status: 400 });
    }

    const tx = db.transaction(() => {
      // Clear all tables (order matters for FK constraints)
      db.prepare('DELETE FROM model_aliases').run();
      db.prepare('DELETE FROM channel_models').run();
      db.prepare('DELETE FROM call_logs').run();
      db.prepare('DELETE FROM channels').run();
      db.prepare('DELETE FROM relay_keys').run();

      // Restore relay_keys
      const insertKey = db.prepare('INSERT INTO relay_keys (id, key, name, balance, used_tokens, spend_limit, total_spent, is_active, is_pinned, expires_at, allowed_models, allowed_channels, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const k of data.relay_keys) {
        insertKey.run(k.id, k.key, k.name, k.balance || 0, k.used_tokens || 0, k.spend_limit ?? 0, k.total_spent ?? 0, k.is_active, k.is_pinned ?? 0, k.expires_at || null, k.allowed_models || '', k.allowed_channels || '', k.created_at, k.updated_at);
      }

      // Restore channels (re-encrypt api_key, support both old & new schema)
      const insertCh = db.prepare('INSERT INTO channels (id, name, base_url, api_key, priority, notes, is_active, health_status, cooldown_until, fail_count, last_health_check, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const c of data.channels) {
        const reEncrypted = c.api_key ? encryptApiKey(c.api_key) : '';
        const notes = c.notes || c.provider || ''; // old schema had provider field
        const baseUrl = c.base_url || '';
        insertCh.run(c.id, c.name, baseUrl, reEncrypted, c.priority || 0, notes, c.is_active, c.health_status || 'unknown', c.cooldown_until || null, c.fail_count || 0, c.last_health_check || null, c.created_at);
      }

      // Restore channel_models (new schema)
      if (data.channel_models && data.channel_models.length > 0) {
        const insertCm = db.prepare('INSERT INTO channel_models (id, channel_id, model_id, is_active, created_at) VALUES (?, ?, ?, ?, ?)');
        for (const cm of data.channel_models) {
          insertCm.run(cm.id, cm.channel_id, cm.model_id, cm.is_active, cm.created_at);
        }
      }

      // Restore model_aliases (new schema)
      if (data.model_aliases && data.model_aliases.length > 0) {
        const insertAlias = db.prepare('INSERT INTO model_aliases (id, alias_name, channel_model_id, is_active, created_at) VALUES (?, ?, ?, ?, ?)');
        for (const a of data.model_aliases) {
          insertAlias.run(a.id, a.alias_name, a.channel_model_id, a.is_active || 1, a.created_at);
        }
      }

      // Restore call_logs
      const insertLog = db.prepare(`INSERT INTO call_logs (
        id, relay_key_id, relay_key_name, model, channel_id, channel_name,
        prompt_tokens, completion_tokens, cached_input_tokens, total_tokens,
        cost, status, error_message, ip, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const l of data.call_logs || []) {
        insertLog.run(
          l.id, l.relay_key_id, l.relay_key_name, l.model,
          l.channel_id, l.channel_name,
          l.prompt_tokens, l.completion_tokens,
          l.cached_input_tokens || 0, l.total_tokens,
          l.cost || 0, l.status, l.error_message, l.ip, l.created_at
        );
      }

      // Restore model_pricing
      if (data.model_pricing && data.model_pricing.length > 0) {
        const insertPrice = db.prepare('INSERT OR REPLACE INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at) VALUES (?, ?, ?, ?, ?)');
        for (const p of data.model_pricing) {
          insertPrice.run(p.model_id, p.prompt_price || 0, p.completion_price || 0, p.cached_prompt_price || 0, p.updated_at);
        }
      }
    });

    tx();
    return NextResponse.json({ success: true, message: '恢复完成' });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
