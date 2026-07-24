// ============================================================
// 按 relay_key_id 聚合的使用统计(供公开页面使用)
// ============================================================
import { getDb } from './db';

export interface KeySummary {
  totalCalls: number;
  promptTokens: number;
  completionTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  totalCost: number;
  firstCallAt: string | null;
  lastCallAt: string | null;
}

export function getKeySummary(relayKeyId: string): KeySummary {
  const row = getDb().prepare(`
    SELECT
      COUNT(*) AS totalCalls,
      COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
      COALESCE(SUM(completion_tokens), 0) AS completionTokens,
      COALESCE(SUM(COALESCE(cached_input_tokens, 0)), 0) AS cachedInputTokens,
      COALESCE(SUM(total_tokens), 0) AS totalTokens,
      COALESCE(SUM(COALESCE(cost, 0)), 0) AS totalCost,
      MIN(created_at) AS firstCallAt,
      MAX(created_at) AS lastCallAt
    FROM call_logs
    WHERE relay_key_id = ?
  `).get(relayKeyId) as KeySummary;
  return row;
}

export interface DailyBucket {
  date: string;   // YYYY-MM-DD
  calls: number;
  tokens: number;
  cost: number;
}

export function getKeyDailyTrend(relayKeyId: string, days: number): DailyBucket[] {
  // created_at 已经是北京时间,无需再 +8 小时
  const rows = getDb().prepare(`
    SELECT
      date(created_at) AS date,
      COUNT(*) AS calls,
      COALESCE(SUM(total_tokens), 0) AS tokens,
      COALESCE(SUM(COALESCE(cost, 0)), 0) AS cost
    FROM call_logs
    WHERE relay_key_id = ?
      AND created_at >= datetime('now', '+8 hours', ?)
    GROUP BY date
    ORDER BY date ASC
  `).all(relayKeyId, `-${days} days`) as DailyBucket[];

  // 补齐缺失日期(0 值),使用北京时区的今日日期
  const map = new Map(rows.map(r => [r.date, r]));
  const out: DailyBucket[] = [];
  const nowBeijing = new Date(Date.now() + 8 * 3600 * 1000);
  const todayBeijingISO = nowBeijing.toISOString().slice(0, 10);
  // 把 YYYY-MM-DD 字符串当作 UTC 午夜来减天数,避免本地时区再次偏移
  for (let i = days - 1; i >= 0; i--) {
    const base = new Date(todayBeijingISO + 'T00:00:00Z');
    base.setUTCDate(base.getUTCDate() - i);
    const ds = base.toISOString().slice(0, 10);
    out.push(map.get(ds) || { date: ds, calls: 0, tokens: 0, cost: 0 });
  }
  return out;
}

export interface RecentLog {
  id: string;
  created_at: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  status: string;
}

export function getKeyRecentLogs(relayKeyId: string, limit = 50): RecentLog[] {
  return getDb().prepare(`
    SELECT id, created_at, model, prompt_tokens, completion_tokens,
           total_tokens, COALESCE(cost, 0) AS cost, status
    FROM call_logs
    WHERE relay_key_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(relayKeyId, limit) as RecentLog[];
}
