// ============================================================
// Admin Channels API — channels + models + aliases
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import {
  listChannels, createChannel, updateChannel, deleteChannel,
  getChannelById, updateChannelHealth, resolveChannelApiKey,
  listChannelModels, createChannelModel, deleteChannelModel,
  listModelAliases, createModelAlias, deleteModelAlias,
  pullModelsFromEndpoint,
} from '@/lib/channels';
import { healthCheckChannel, getChatUrl } from '@/lib/proxy';

export async function GET(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope');

  if (scope === 'models') {
    const channels = listChannels().map(c => ({ ...c, api_key: '' }));
    const channelModels = listChannelModels();
    const aliases = listModelAliases();
    return NextResponse.json({ channels, channelModels, aliases });
  }

  const channels = listChannels().map(c => ({ ...c, api_key: c.api_key ? '[ENCRYPTED]' : '' }));
  return NextResponse.json({ channels });
}

export async function POST(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const body = await request.json();

    // Create model alias
    if (body._type === 'alias') {
      const alias = createModelAlias(body.alias_name, body.channel_model_id);
      if (!alias) return NextResponse.json({ error: 'Alias already exists' }, { status: 409 });
      return NextResponse.json({ alias }, { status: 201 });
    }

    // Create channel model
    if (body._type === 'channel-model') {
      const model = createChannelModel(body.channel_id, body.model_id);
      if (!model) return NextResponse.json({ error: 'Model already exists on this channel' }, { status: 409 });
      return NextResponse.json({ model }, { status: 201 });
    }

    // Create channel
    const channel = createChannel(body);
    return NextResponse.json({ channel: { ...channel, api_key: '' } }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const body = await request.json();
    const updated = updateChannel(body.id, body);
    return NextResponse.json({ success: updated });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    if (type === 'alias') return NextResponse.json({ success: deleteModelAlias(id) });
    if (type === 'channel-model') return NextResponse.json({ success: deleteChannelModel(id) });

    return NextResponse.json({ success: deleteChannel(id) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const body = await request.json();
    const channel = getChannelById(body.id);
    if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (body._action === 'pull-models') {
      const apiKey = resolveChannelApiKey(channel);
      if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 400 });
      const models = await pullModelsFromEndpoint(channel.base_url, apiKey);
      return NextResponse.json({ models });
    }

    if (body._action === 'check-model' && body.model_id) {
      const apiKey = resolveChannelApiKey(channel);
      if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 400 });
      try {
        const url = getChatUrl(channel.base_url);
        var start = Date.now();
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: body.model_id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
          signal: AbortSignal.timeout(10000),
        });
        var latency = Date.now() - start;

        // ✅ 检测成功 → 恢复健康
        if (res.ok) {
          updateChannelHealth(channel.id, 'healthy');
          return NextResponse.json({ healthy: true, status: res.status, latency: latency + 'ms' });
        }

        // ❌ 失败 → 读取上游真实错误 body
        const rawText = await res.text().catch(() => '');
        let upstreamError = rawText;
        try {
          const parsed = JSON.parse(rawText);
          if (parsed?.error?.message) upstreamError = parsed.error.message;
          else if (typeof parsed?.error === 'string') upstreamError = parsed.error;
          else if (parsed?.message) upstreamError = parsed.message;
        } catch {
          // 非 JSON（如 HTML 错误页）→ 用原文
        }
        upstreamError = (upstreamError || `HTTP ${res.status}`).slice(0, 500);

        return NextResponse.json({ healthy: false, status: res.status, latency: latency + 'ms', error: upstreamError });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ healthy: false, latency: '超时', error: msg.slice(0, 500) }, { status: 200 });
      }
    }

    const healthy = await healthCheckChannel(channel);
    updateChannelHealth(channel.id, healthy ? 'healthy' : 'unhealthy');
    return NextResponse.json({ healthy });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
