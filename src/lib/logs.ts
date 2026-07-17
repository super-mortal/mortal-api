// ============================================================
// Call log recording
// ============================================================
import { getDb } from './db';
import { CallLog } from './types';
import { nanoid } from 'nanoid';

export function createCallLog(data: {
  relay_key_id: string;
  relay_key_name: string;
  model: string;
  channel_id: string;
  channel_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached_input_tokens?: number;
  cost?: number;
  status: string;
  error_message?: string | null;
  ip?: string;
}): CallLog {
  const db = getDb();
  const id = nanoid(16);
  const total = data.prompt_tokens + data.completion_tokens;
  const cachedInput = data.cached_input_tokens || 0;
  db.prepare(`
    INSERT INTO call_logs (id, relay_key_id, relay_key_name, model, channel_id, channel_name,
      prompt_tokens, completion_tokens, cached_input_tokens, total_tokens, cost, status, error_message, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
  `).run(
    id,
    data.relay_key_id,
    data.relay_key_name,
    data.model,
    data.channel_id,
    data.channel_name,
    data.prompt_tokens,
    data.completion_tokens,
    cachedInput,
    total,
    data.cost,
    data.status,
    data.error_message || null,
    data.ip || null
  );
  return getCallLogById(id)!;
}

export function getCallLogById(id: string): CallLog | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM call_logs WHERE id = ?').get(id) as CallLog | undefined;
}

export function listCallLogs(options: {
  limit?: number;
  offset?: number;
  relay_key_id?: string;
  model?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
}): { logs: CallLog[]; total: number } {
  const db = getDb();
  const where: string[] = [];
  const params: any[] = [];

  if (options.relay_key_id) { where.push('relay_key_id = ?'); params.push(options.relay_key_id); }
  if (options.model) { where.push('model = ?'); params.push(options.model); }
  if (options.status) { where.push('status = ?'); params.push(options.status); }
  if (options.start_date) { where.push("created_at >= ?"); params.push(options.start_date); }
  if (options.end_date) { where.push("created_at <= ?"); params.push(options.end_date); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const total = (db.prepare(`SELECT COUNT(*) as c FROM call_logs ${whereClause}`).get(...params) as { c: number }).c;
  const logs = db.prepare(
    `SELECT * FROM call_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as CallLog[];

  return { logs, total };
}

export function deleteCallLog(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM call_logs WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteCallLogsByDate(startDate: string, endDate?: string): number {
  const db = getDb();
  let count: number;
  if (endDate) {
    count = (db.prepare("SELECT COUNT(*) as c FROM call_logs WHERE created_at >= ? AND created_at <= ?").get(startDate, endDate) as { c: number }).c;
    db.prepare("DELETE FROM call_logs WHERE created_at >= ? AND created_at <= ?").run(startDate, endDate);
  } else {
    count = (db.prepare("SELECT COUNT(*) as c FROM call_logs WHERE created_at >= ?").get(startDate) as { c: number }).c;
    db.prepare("DELETE FROM call_logs WHERE created_at >= ?").run(startDate);
  }
  return count;
}

export function getStats(days: number = 7) {
  const db = getDb();
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_calls,
      COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) as success_calls,
      COALESCE(SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END), 0) as fail_calls,
      COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(cost), 0) as total_cost
    FROM call_logs
    WHERE created_at >= datetime('now', '+8 hours', ?)
  `).get(`-${days} days`) as any;

  const dailyStats = db.prepare(`
    SELECT
      date(created_at) as date,
      COUNT(*) as calls,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(cost), 0) as cost
    FROM call_logs
    WHERE created_at >= datetime('now', '+8 hours', ?)
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(`-${days} days`);

  const modelStats = db.prepare(`
    SELECT
      model,
      COUNT(*) as calls,
      COALESCE(SUM(total_tokens), 0) as tokens
    FROM call_logs
    WHERE created_at >= datetime('now', '+8 hours', ?)
    GROUP BY model
    ORDER BY calls DESC
  `).all(`-${days} days`);

  // Hourly stats for today
  let hourlyStats: any[] = [];
  if (days <= 1) {
    hourlyStats = db.prepare(`
      SELECT
        strftime('%H', created_at) as hour,
        COUNT(*) as calls,
        COALESCE(SUM(total_tokens), 0) as tokens
      FROM call_logs
      WHERE created_at >= datetime('now', '+8 hours', '-1 day')
      GROUP BY hour
      ORDER BY hour ASC
    `).all() as any[];
  } else {
    hourlyStats = [];
  }

  return { stats, dailyStats, modelStats, hourlyStats };
}
