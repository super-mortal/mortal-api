// ============================================================
// Types for Mortal API
// ============================================================

export interface RelayKey {
  id: string;
  key: string; // sk-mortal-xxx
  name: string;
  spend_limit: number;
  total_spent: number;
  is_active: number;
  is_pinned: number;
  expires_at: string | null;
  allowed_models: string;
  allowed_channels: string;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: string;
  name: string;           // 显示名称（如 "DeepSeek 官方"）
  base_url: string;       // API 端点
  api_key: string;        // AES 加密后的 key
  priority: number;       // 路由优先级
  notes: string;          // 备注（可写提供商名称等信息）
  is_active: number;
  health_status: string;
  cooldown_until: string | null;
  fail_count: number;
  last_health_check: string | null;
  created_at: string;
}

export interface ChannelModel {
  id: string;
  channel_id: string;
  model_id: string;       // 上游模型 ID（如 deepseek-v4-pro）
  is_active: number;
  created_at: string;
  channel_name?: string;  // joined
}

export interface ModelAlias {
  id: string;
  alias_name: string;
  channel_model_id: string; // FK → channel_models.id
  is_active: number;
  created_at: string;
  channel_name?: string;
  model_id?: string;      // joined
}

export interface ModelPricing {
  model_id: string;
  prompt_price: number;
  completion_price: number;
  cached_prompt_price: number;
  updated_at: string;
}

export interface CallLog {
  id: string;
  relay_key_id: string;
  relay_key_name: string;
  model: string;
  channel_id: string;
  channel_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_input_tokens: number;
  total_tokens: number;
  cost?: number;
  status: string;
  error_message: string | null;
  ip: string;
  created_at: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  tools?: any[];
  tool_choice?: any;
  response_format?: { type: string };
  seed?: number;
  [key: string]: unknown;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: string; content: string | null; tool_calls?: any[] };
    finish_reason: string | null;
  }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: { role?: string; content?: string | null; tool_calls?: any[] };
    finish_reason: string | null;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
