// ============================================================
// GET /api/admin/stats — with datetime range, key filter support
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { getDb } from '@/lib/db';

function normalizeDate(s: string): string {
  // Convert datetime-local format (YYYY-MM-DDTHH:MM) to SQLite-compatible (YYYY-MM-DD HH:MM:SS)
  if (!s) return s;
  return s.replace('T', ' ');
}

export async function GET(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '0');
  const startDate = searchParams.get('start_date') || '';
  const endDate = searchParams.get('end_date') || '';
  const relayKeyId = searchParams.get('relay_key_id') || '';

  const db = getDb();

  const where: string[] = [];
  const params: any[] = [];

  if (startDate) {
    where.push('created_at >= ?');
    params.push(normalizeDate(startDate));
  } else if (days > 0) {
    where.push("created_at >= datetime('now', '+8 hours', ?)");
    params.push(`-${days} days`);
  }

  if (endDate) {
    where.push('created_at <= ?');
    params.push(normalizeDate(endDate));
  }

  if (relayKeyId) {
    where.push('relay_key_id = ?');
    params.push(relayKeyId);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_calls,
      COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) as success_calls,
      COALESCE(SUM(CASE WHEN status = 'fail' THEN 1 ELSE 0 END), 0) as fail_calls,
      COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) as total_completion_tokens,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(cached_input_tokens), 0) as total_cached_input_tokens,
      COALESCE(SUM(prompt_tokens - cached_input_tokens), 0) as total_uncached_input_tokens,
      COALESCE(SUM(cost), 0) as total_cost
    FROM call_logs ${whereClause}
  `).get(...params) as any;

  const dailyStats = db.prepare(`
    SELECT
      date(created_at) as date,
      COUNT(*) as calls,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens,
      COALESCE(SUM(cached_input_tokens), 0) as cached_tokens,
      COALESCE(SUM(prompt_tokens - cached_input_tokens), 0) as uncached_tokens,
      COALESCE(SUM(cost), 0) as cost
    FROM call_logs ${whereClause}
    GROUP BY date(created_at)
    ORDER BY date ASC
  `).all(...params);

  const modelStats = db.prepare(`
    SELECT
      model,
      COUNT(*) as calls,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(completion_tokens), 0) as completion_tokens,
      COALESCE(SUM(cached_input_tokens), 0) as cached_tokens,
      COALESCE(SUM(prompt_tokens - cached_input_tokens), 0) as uncached_tokens,
      COALESCE(SUM(cost), 0) as total_cost,
      COALESCE(SUM(cost) * 1.0 / NULLIF(COUNT(*), 0), 0) as avg_cost
    FROM call_logs ${whereClause}
    GROUP BY model
    ORDER BY calls DESC
  `).all(...params);

  let hourlyStats: any[] = [];
  if (days > 0 && days <= 1) {
    hourlyStats = db.prepare(`
      SELECT
        strftime('%H', created_at) as hour,
        COUNT(*) as calls,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(cached_input_tokens), 0) as cached_tokens,
        COALESCE(SUM(prompt_tokens - cached_input_tokens), 0) as uncached_tokens
      FROM call_logs ${whereClause}
      GROUP BY hour
      ORDER BY hour ASC
    `).all(...params) as any[];
  }

  return NextResponse.json({ stats, dailyStats, modelStats, hourlyStats });
}
