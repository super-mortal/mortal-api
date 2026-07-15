// ============================================================
// LLM Proxy - forwards requests to upstream providers
// ============================================================
import { Channel, ChatCompletionRequest, ChatCompletionResponse } from './types';

/** Extract cached_input_tokens from upstream usage response (multi-provider) */
export function extractCachedInputTokens(usage: any): number {
  if (!usage) return 0;
  // DeepSeek: usage.prompt_cache_hit_tokens
  if (typeof usage.prompt_cache_hit_tokens === 'number') return usage.prompt_cache_hit_tokens;
  // OpenAI: usage.prompt_tokens_details?.cached_tokens
  if (usage.prompt_tokens_details?.cached_tokens) return usage.prompt_tokens_details.cached_tokens;
  // Anthropic: usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  const anthropicCache = (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  if (anthropicCache > 0) return anthropicCache;
  return 0;
}

export function getChatUrl(baseUrl: string): string {
  let base = baseUrl.replace(/\/+$/, '');
  // If base_url already contains /chat/completions, use as-is
  if (base.endsWith('/chat/completions')) return base;
  // If base_url ends with /v1, append /chat/completions
  if (base.endsWith('/v1')) return `${base}/chat/completions`;
  // Standard OpenAI-compatible path: append /v1/chat/completions
  return `${base}/v1/chat/completions`;
}

function buildUpstreamBody(relayReq: ChatCompletionRequest): any {
  const body: any = {
    model: relayReq.model,
    messages: relayReq.messages,
    stream: relayReq.stream,
  };
  for (const k of ['temperature', 'top_p', 'max_tokens', 'stop', 'presence_penalty', 'frequency_penalty', 'tools', 'tool_choice', 'response_format', 'seed']) {
    if ((relayReq as any)[k] !== undefined) body[k] = (relayReq as any)[k];
  }
  return body;
}

export async function callUpstream(
  channel: Channel,
  relayReq: ChatCompletionRequest,
  apiKey: string
): Promise<{ response: ChatCompletionResponse; duration: number; cachedInputTokens: number }> {
  const url = getChatUrl(channel.base_url);
  const body = buildUpstreamBody({ ...relayReq, stream: false });

  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const duration = Date.now() - start;
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(text);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  const data = await res.json() as any;
  const usagePrompt = data.usage?.prompt_tokens ?? 0;
  const usageCompletion = data.usage?.completion_tokens ?? 0;
  const cachedInputTokens = extractCachedInputTokens(data.usage);

  return {
    response: {
      id: data.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: data.created || Math.floor(Date.now() / 1000),
      model: relayReq.model,
      choices: (data.choices || []).map((c: any) => ({
        index: c.index || 0,
        message: { role: c.message?.role || 'assistant', content: c.message?.content || null, tool_calls: c.message?.tool_calls },
        finish_reason: c.finish_reason || null,
      })),
      usage: { prompt_tokens: usagePrompt, completion_tokens: usageCompletion, total_tokens: usagePrompt + usageCompletion },
    },
    duration,
    cachedInputTokens,
  };
}

export async function callUpstreamStreaming(
  channel: Channel,
  relayReq: ChatCompletionRequest,
  apiKey: string
): Promise<{ stream: ReadableStream; duration: number }> {
  const url = getChatUrl(channel.base_url);
  const body = buildUpstreamBody({ ...relayReq, stream: true });

  const start = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const duration = Date.now() - start;
  if (!res.ok) {
    const text = await res.text();
    const err: any = new Error(text);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  if (!res.body) throw new Error('No response body');

  return { stream: res.body, duration };
}

export async function healthCheckChannel(channel: Channel): Promise<boolean> {
  try {
    const url = getChatUrl(channel.base_url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${channel.api_key ? 'dummy' : ''}` },
      body: JSON.stringify({ model: 'test', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(10000),
    });
    return true; // If we got any response (even 401), the endpoint is reachable
  } catch {
    return false;
  }
}
