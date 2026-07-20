// ============================================================
// POST /v1/chat/completions — Main proxy endpoint
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { getRelayKeyByKey, addUsedTokens, getAllowedChannelIds } from '@/lib/keys';
import {
  resolveModel,
  getModelsForAuto,
  resolveChannelApiKey,
  getChannelById,
  recordChannelSuccess,
  recordChannelFailure,
} from '@/lib/channels';
import { callUpstream, callUpstreamStreaming, extractCachedInputTokens } from '@/lib/proxy';
import { createCallLog } from '@/lib/logs';
import { calculateCost } from '@/lib/model-pricing';
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
    const autoChannel = picked.channel;
    upstreamModelId = picked.modelId;

    if (!autoChannel || !autoChannel.is_active) return NextResponse.json({ error: { message: 'Channel unavailable', type: 'server_error' } }, { status: 503 });

    const autoChannelApiKey = resolveChannelApiKey(autoChannel);
    if (!autoChannelApiKey) {
      recordChannelFailure(autoChannel.id, 'failure');
      return NextResponse.json({ error: { message: `No API key for ${autoChannel.name}`, type: 'server_error' } }, { status: 502 });
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
        const result = await callUpstreamStreaming(autoChannel, upstreamBody, autoChannelApiKey);

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
                const prompt_tokens = body.messages ? Math.ceil(JSON.stringify(body.messages).length / 2) : 0;
                const cost = calculateCost(modelName, prompt_tokens, totalCompletionTokens, cachedInputTokens);
                createCallLog({
                  relay_key_id: relayKey.id, relay_key_name: relayKey.name,
                  model: modelName, channel_id: autoChannel.id, channel_name: autoChannel.name,
                  prompt_tokens,
                  completion_tokens: totalCompletionTokens,
                  cached_input_tokens: cachedInputTokens,
                  cost,
                  status: 'success',
                  ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
                });
                if (relayKey.balance > 0) addUsedTokens(relayKey.id, totalCompletionTokens);
                recordChannelSuccess(autoChannel.id);
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
              model: modelName, channel_id: autoChannel.id, channel_name: autoChannel.name,
              prompt_tokens: 0, completion_tokens: totalCompletionTokens,
              cached_input_tokens: cachedInputTokens,
              cost: 0,
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
        const result = await callUpstream(autoChannel, upstreamBody, autoChannelApiKey);
        const { prompt_tokens, completion_tokens, total_tokens } = result.response.usage;
        const cost = calculateCost(modelName, prompt_tokens, completion_tokens, result.cachedInputTokens || 0);

        createCallLog({
          relay_key_id: relayKey.id, relay_key_name: relayKey.name,
          model: modelName, channel_id: autoChannel.id, channel_name: autoChannel.name,
          prompt_tokens, completion_tokens,
          cached_input_tokens: result.cachedInputTokens,
          cost,
          status: 'success',
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        });
        if (relayKey.balance > 0) addUsedTokens(relayKey.id, prompt_tokens + completion_tokens);
        recordChannelSuccess(autoChannel.id);

        result.response.model = body.model || 'auto';
        return NextResponse.json(result.response);
      }
    } catch (err: any) {
      const isRateLimit = err.status === 429;
      if (isRateLimit) {
        recordChannelFailure(autoChannel.id, 'quota');
      } else {
        recordChannelFailure(autoChannel.id, 'failure');
      }
      createCallLog({
        relay_key_id: relayKey.id, relay_key_name: relayKey.name,
        model: modelName, channel_id: autoChannel.id, channel_name: autoChannel.name,
        prompt_tokens: 0, completion_tokens: 0,
        cost: 0,
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

  // ── Specific model with retry + failover ──
  // Try same channel up to 3 times, then failover to next available channel.
  // Failed channels are marked cooling_down (auto-recover after 6h) and excluded.
  let excludedChannelIds: string[] = [];
  let channel: any = null;
  let channelApiKey: string = '';
  let lastError: any = null;
  let retriesOnCurrentChannel = 0;
  const maxRetries = 3;

  for (let attempt = 0; attempt < 9; attempt++) {
    // ── Select next available channel (first time or after failover) ──
    if (channel === null) {
      const resolved = resolveModel(
        modelName,
        keyAllowedChannels.length > 0 ? keyAllowedChannels : undefined,
        excludedChannelIds.length > 0 ? excludedChannelIds : undefined,
      );
      if (!resolved) break;

      // Check channel restriction
      if (hasChannelRestriction && !keyAllowedChannels.includes(resolved.channelId)) break;
      // Check model restriction
      if (hasModelRestriction && !keyAllowedModels.includes(modelName)) break;

      channel = getChannelById(resolved.channelId);
      if (!channel || !channel.is_active) {
        excludedChannelIds.push(resolved.channelId);
        channel = null;
        continue;
      }

      channelApiKey = resolveChannelApiKey(channel);
      if (!channelApiKey) {
        recordChannelFailure(channel.id, 'failure');
        excludedChannelIds.push(channel.id);
        channel = null;
        continue;
      }

      upstreamModelId = resolved.upstreamModelId;
      retriesOnCurrentChannel = 0;
    }

    // ── Build upstream request body ──
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
                const prompt_tokens = body.messages ? Math.ceil(JSON.stringify(body.messages).length / 2) : 0;
                const cost = calculateCost(modelName, prompt_tokens, totalCompletionTokens, cachedInputTokens);
                createCallLog({
                  relay_key_id: relayKey.id, relay_key_name: relayKey.name,
                  model: modelName, channel_id: channel.id, channel_name: channel.name,
                  prompt_tokens,
                  completion_tokens: totalCompletionTokens,
                  cached_input_tokens: cachedInputTokens,
                  cost,
                  status: 'success',
                  ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
                });
                if (relayKey.balance > 0) addUsedTokens(relayKey.id, totalCompletionTokens);
                recordChannelSuccess(channel.id);
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
              cost: 0,
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
        const cost = calculateCost(modelName, prompt_tokens, completion_tokens, result.cachedInputTokens || 0);

        createCallLog({
          relay_key_id: relayKey.id, relay_key_name: relayKey.name,
          model: modelName, channel_id: channel.id, channel_name: channel.name,
          prompt_tokens, completion_tokens,
          cached_input_tokens: result.cachedInputTokens,
          cost,
          status: 'success',
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        });
        if (relayKey.balance > 0) addUsedTokens(relayKey.id, prompt_tokens + completion_tokens);
        recordChannelSuccess(channel.id);

        result.response.model = body.model || 'auto';
        return NextResponse.json(result.response);
      }
    } catch (err: any) {
      lastError = err;
      retriesOnCurrentChannel++;

      if (retriesOnCurrentChannel >= maxRetries) {
        // Exhausted retries on this channel → mark cooling_down (auto-recover 6h)
        recordChannelFailure(channel.id, 'quota');
        excludedChannelIds.push(channel.id);
        channel = null; // trigger failover to next channel
      }
    }
  }

  // ── All attempts exhausted ──
  if (channel && lastError) {
    recordChannelFailure(channel.id, lastError?.status === 429 ? 'quota' : 'failure');
  }
  createCallLog({
    relay_key_id: relayKey.id, relay_key_name: relayKey.name,
    model: modelName, channel_id: channel?.id || '', channel_name: channel?.name || 'unknown',
    prompt_tokens: 0, completion_tokens: 0,
    cost: 0,
    status: 'fail', error_message: lastError?.body || (lastError instanceof Error ? lastError.message : 'Upstream error'),
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
  });

  const status = lastError?.status || 502;
  let errorBody: any;
  try {
    errorBody = JSON.parse(lastError?.body || '{}');
  } catch {
    errorBody = { error: { message: lastError?.body || lastError?.message || 'Upstream error', type: 'server_error' } };
  }
  return NextResponse.json(errorBody, { status });
}
