// ============================================================
// POST /api/v1/chat/completions — Main proxy endpoint
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getRelayKeyByKey, addUsedTokens, getAllowedChannelIds } from '@/lib/keys';
import {
  resolveModel,
  getModelsForAuto,
  updateChannelHealth,
  resolveChannelApiKey,
  getChannelById,
} from '@/lib/channels';
import { callUpstream, callUpstreamStreaming, extractCachedInputTokens } from '@/lib/proxy';
import { createCallLog } from '@/lib/logs';
import { ChatCompletionRequest, ChatCompletionChunk } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 1. Authenticate
  const authHeader = request.headers.get('authorization') || '';
  const apiKey = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!apiKey) return NextResponse.json({ error: { message: 'Missing API key', type: 'invalid_request_error' } }, { status: 401 });

  const relayKey = getRelayKeyByKey(apiKey);
  if (!relayKey) return NextResponse.json({ error: { message: 'Invalid API key', type: 'invalid_request_error' } }, { status: 401 });
  if (!relayKey.is_active) return NextResponse.json({ error: { message: 'API key disabled', type: 'invalid_request_error' } }, { status: 403 });
  if (relayKey.expires_at && new Date(relayKey.expires_at) < new Date()) return NextResponse.json({ error: { message: 'API key has expired', type: 'invalid_request_error' } }, { status: 403 });

  // 2. Parse body
  let body: ChatCompletionRequest;
  try { body = await request.json(); } catch { return NextResponse.json({ error: { message: 'Invalid JSON', type: 'invalid_request_error' } }, { status: 400 }); }
  if (!body.messages?.length) return NextResponse.json({ error: { message: 'messages required', type: 'invalid_request_error' } }, { status: 400 });

  // Determine allowed channel IDs and model names
  const keyAllowedChannels = getAllowedChannelIds(relayKey);
  const hasChannelRestriction = keyAllowedChannels.length > 0;
  const keyAllowedModels = relayKey.allowed_models
    ? relayKey.allowed_models.split(',').map(m => m.trim()).filter(Boolean)
    : [];
  const hasModelRestriction = keyAllowedModels.length > 0;

  const isStream = body.stream === true;
  let modelName = body.model || 'auto';
  let upstreamModelId = modelName;

  // 3. Resolve model → channel
  let channel: any = null;

  if (modelName === 'auto') {
    const all = getModelsForAuto();
    if (!all.length) return NextResponse.json({ error: { message: 'No available channels', type: 'server_error' } }, { status: 503 });
    // Filter by allowed channels if needed
    let filtered = hasChannelRestriction ? all.filter(m => keyAllowedChannels.includes(m.channel.id)) : all;
    // Filter by allowed models if needed
    if (hasModelRestriction) {
      filtered = filtered.filter(m => keyAllowedModels.includes(m.modelId));
    }
    if (!filtered.length) return NextResponse.json({ error: { message: 'No available channels for this API key', type: 'server_error' } }, { status: 503 });
    const picked = filtered[Math.floor(Math.random() * filtered.length)];
    channel = picked.channel;
    upstreamModelId = picked.modelId;
  } else {
    const resolved = resolveModel(modelName);
    if (!resolved) return NextResponse.json({ error: { message: `Model "${modelName}" not found`, type: 'invalid_request_error' } }, { status: 404 });

    // Check channel restriction
    if (hasChannelRestriction && !keyAllowedChannels.includes(resolved.channelId)) {
      return NextResponse.json({ error: { message: `Model "${modelName}" not allowed for this API key`, type: 'invalid_request_error' } }, { status: 403 });
    }
    // Check model restriction
    if (hasModelRestriction && !keyAllowedModels.includes(modelName)) {
      return NextResponse.json({ error: { message: `Model "${modelName}" not allowed for this API key`, type: 'invalid_request_error' } }, { status: 403 });
    }

    channel = getChannelById(resolved.channelId);
    upstreamModelId = resolved.upstreamModelId;
  }

  if (!channel || !channel.is_active) return NextResponse.json({ error: { message: 'Channel unavailable', type: 'server_error' } }, { status: 503 });

  const channelApiKey = resolveChannelApiKey(channel);
  if (!channelApiKey) {
    updateChannelHealth(channel.id, 'unhealthy');
    return NextResponse.json({ error: { message: `No API key for ${channel.name}`, type: 'server_error' } }, { status: 502 });
  }

  // 4. Build upstream request body
  const upstreamBody = {
    model: upstreamModelId,
    messages: body.messages,
    stream: isStream,
    temperature: body.temperature,
    top_p: body.top_p,
    max_tokens: body.max_tokens,
    stop: body.stop,
    presence_penalty: body.presence_penalty,
    frequency_penalty: body.frequency_penalty,
    tools: body.tools,
    tool_choice: body.tool_choice,
    response_format: body.response_format,
    seed: body.seed,
  };

  try {
    if (isStream) {
      const result = await callUpstreamStreaming(channel, upstreamBody, channelApiKey);

      const recordingStream = new TransformStream<Uint8Array, Uint8Array>();
      const writer = recordingStream.writable.getWriter();
      const reader = result.stream.getReader();
      let totalCompletionTokens = 0;
      let cachedInputTokens = 0;

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              createCallLog({
                relay_key_id: relayKey.id, relay_key_name: relayKey.name,
                model: modelName, channel_id: channel.id, channel_name: channel.name,
                prompt_tokens: body.messages ? Math.ceil(JSON.stringify(body.messages).length / 2) : 0,
                completion_tokens: totalCompletionTokens,
                cached_input_tokens: cachedInputTokens,
                status: 'success',
                ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
              });
              if (relayKey.balance > 0) addUsedTokens(relayKey.id, totalCompletionTokens);
              updateChannelHealth(channel.id, 'healthy');
              await writer.close();
              return;
            }
            const text = new TextDecoder().decode(value);
            for (const line of text.split('\n').filter((l: string) => l.startsWith('data: '))) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.usage) {
                  if (parsed.usage.completion_tokens) totalCompletionTokens = parsed.usage.completion_tokens;
                  const cacheTokens = extractCachedInputTokens(parsed.usage);
                  if (cacheTokens > 0) cachedInputTokens = cacheTokens;
                } else {
                  for (const choice of parsed.choices || []) { if (choice.delta?.content) totalCompletionTokens += Math.ceil(choice.delta.content.length / 2); }
                }
              } catch {}
            }
            await writer.write(value);
          }
        } catch (err) {
          createCallLog({
            relay_key_id: relayKey.id, relay_key_name: relayKey.name,
            model: modelName, channel_id: channel.id, channel_name: channel.name,
            prompt_tokens: 0, completion_tokens: totalCompletionTokens,
            cached_input_tokens: cachedInputTokens,
            status: 'fail', error_message: err instanceof Error ? err.message : 'Stream error',
            ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          });
          await writer.close();
        }
      })();

      return new Response(recordingStream.readable, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      });
    } else {
      const result = await callUpstream(channel, upstreamBody, channelApiKey);
      const { prompt_tokens, completion_tokens, total_tokens } = result.response.usage;

      createCallLog({
        relay_key_id: relayKey.id, relay_key_name: relayKey.name,
        model: modelName, channel_id: channel.id, channel_name: channel.name,
        prompt_tokens, completion_tokens,
        cached_input_tokens: result.cachedInputTokens,
        status: 'success',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      });
      if (relayKey.balance > 0) addUsedTokens(relayKey.id, prompt_tokens + completion_tokens);
      updateChannelHealth(channel.id, 'healthy');

      result.response.model = body.model || 'auto';
      return NextResponse.json(result.response);
    }
  } catch (err: any) {
    updateChannelHealth(channel.id, 'unhealthy');
    createCallLog({
      relay_key_id: relayKey.id, relay_key_name: relayKey.name,
      model: modelName, channel_id: channel.id, channel_name: channel.name,
      prompt_tokens: 0, completion_tokens: 0,
      status: 'fail', error_message: err.body || (err instanceof Error ? err.message : 'Upstream error'),
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    });

    const status = err.status || 502;
    let errorBody: any;
    try {
      errorBody = JSON.parse(err.body || '{}');
    } catch {
      errorBody = { error: { message: err.body || err.message || 'Upstream error', type: 'server_error' } };
    }
    return NextResponse.json(errorBody, { status });
  }
}
