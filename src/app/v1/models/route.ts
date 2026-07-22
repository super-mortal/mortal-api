// ============================================================
// GET /v1/models — OpenAI-compatible models list
// Respects key-level channel and model restrictions
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getRelayKeyByKey } from '@/lib/keys';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!apiKey) return NextResponse.json({ error: { message: 'Missing API key', type: 'invalid_request_error' } }, { status: 401 });

  const relayKey = getRelayKeyByKey(apiKey);
  if (!relayKey) return NextResponse.json({ error: { message: 'Invalid API key', type: 'invalid_request_error' } }, { status: 401 });
  if (!relayKey.is_active) return NextResponse.json({ error: { message: 'API key disabled', type: 'invalid_request_error' } }, { status: 403 });
  if (relayKey.expires_at && new Date(relayKey.expires_at) < new Date()) return NextResponse.json({ error: { message: 'API key has expired', type: 'invalid_request_error' } }, { status: 403 });

  const db = getDb();

  // Determine allowed channel IDs
  const keyAllowedChannels = relayKey.allowed_channels ? relayKey.allowed_channels.split(',').map((c: string) => c.trim()).filter(Boolean) : [];
  const hasChannelRestriction = keyAllowedChannels.length > 0;

  // Build the WHERE clause for channel filtering
  let channelWhere = 'cm.is_active = 1 AND c.is_active = 1';
  let channelModelsParams: any[] = [];
  let aliasesParams: any[] = [];

  if (hasChannelRestriction) {
    const placeholders = keyAllowedChannels.map(() => '?').join(',');
    channelWhere += ` AND cm.channel_id IN (${placeholders})`;
    channelModelsParams = keyAllowedChannels;
    aliasesParams = keyAllowedChannels;
  }

  const channelModels = db.prepare(`
    SELECT DISTINCT cm.model_id
    FROM channel_models cm
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE ${channelWhere}
  `).all(...channelModelsParams) as any[];

  const aliases = db.prepare(`
    SELECT ma.alias_name, cm.model_id
    FROM model_aliases ma
    LEFT JOIN channel_models cm ON cm.id = ma.channel_model_id
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE ma.is_active = 1 AND ${channelWhere}
  `).all(...aliasesParams) as any[];

  // Check if this key has additional model restrictions
  const allowedModels = relayKey.allowed_models ? relayKey.allowed_models.split(',').map((m: string) => m.trim()).filter(Boolean) : [];

  const aliasedModelIds = new Set(aliases.map((a: any) => a.model_id));

  const allModels: { id: string; object: string; created: number; owned_by: string }[] = [];
  const seen = new Set<string>();

  for (const a of aliases) {
    if (allowedModels.length > 0 && !allowedModels.includes(a.alias_name) && !allowedModels.includes(a.model_id)) continue;
    if (seen.has(a.alias_name)) continue;
    allModels.push({ id: a.alias_name, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'mortal' });
    seen.add(a.alias_name);
  }

  for (const m of channelModels) {
    if (aliasedModelIds.has(m.model_id)) continue;
    if (allowedModels.length > 0 && !allowedModels.includes(m.model_id)) continue;
    if (seen.has(m.model_id)) continue;
    allModels.push({ id: m.model_id, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'mortal' });
    seen.add(m.model_id);
  }

  return NextResponse.json({
    object: 'list',
    data: allModels,
  });
}
