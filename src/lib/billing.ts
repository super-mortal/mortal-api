// ============================================================
// Billing export — query + file generation
// ============================================================
import { getDb } from './db';
import archiver from 'archiver';

export interface DetailRow {
  created_at: string;
  relay_key_name: string;
  model: string;
  channel_name: string;
  prompt_tokens: number;
  cached_input_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number | null;
  status: string;
  ip: string | null;
  id: string;
}

export interface DailySummaryRow {
  date: string;
  calls: number;
  success: number;
  fail: number;
  tokens: number;
  total_cost: number;
}

export interface ModelSummaryRow {
  model: string;
  model_alias: string;
  prompt_price: number;
  completion_price: number;
  cached_prompt_price: number;
  calls: number;
  tokens: number;
  total_cost: number;
}

export interface ExportQuery {
  relay_key_id: string;
  start_date: string;
  end_date: string;
}

export function getRelayKeyName(id: string): string {
  const db = getDb();
  const row = db.prepare('SELECT name FROM relay_keys WHERE id = ?').get(id) as { name: string } | undefined;
  return row?.name || '';
}

export function queryDetail(q: ExportQuery): DetailRow[] {
  const db = getDb();
  const params: any[] = [];
  const wheres: string[] = [];
  if (q.relay_key_id) { wheres.push('relay_key_id = ?'); params.push(q.relay_key_id); }
  wheres.push('created_at >= ?'); params.push(q.start_date);
  wheres.push('created_at <= ?'); params.push(q.end_date);
  return db.prepare(`
    SELECT created_at, relay_key_name, model, channel_name,
           prompt_tokens, cached_input_tokens, completion_tokens, total_tokens,
           cost, status, ip, id
    FROM call_logs WHERE ${wheres.join(' AND ')}
    ORDER BY created_at ASC
  `).all(...params) as DetailRow[];
}

export function queryDailySummary(q: ExportQuery): DailySummaryRow[] {
  const db = getDb();
  const params: any[] = [];
  const wheres: string[] = [];
  if (q.relay_key_id) { wheres.push('relay_key_id = ?'); params.push(q.relay_key_id); }
  wheres.push('created_at >= ?'); params.push(q.start_date);
  wheres.push('created_at <= ?'); params.push(q.end_date);
  return db.prepare(`
    SELECT substr(created_at, 1, 10) as date,
           COUNT(*) as calls,
           SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success,
           SUM(CASE WHEN status='fail' THEN 1 ELSE 0 END) as fail,
           COALESCE(SUM(total_tokens), 0) as tokens,
           COALESCE(SUM(cost), 0) as total_cost
    FROM call_logs WHERE ${wheres.join(' AND ')}
    GROUP BY substr(created_at, 1, 10)
    ORDER BY date ASC
  `).all(...params) as DailySummaryRow[];
}

export function queryModelSummary(q: ExportQuery): ModelSummaryRow[] {
  const db = getDb();
  const params: any[] = [];
  const wheres: string[] = [];
  if (q.relay_key_id) { wheres.push('relay_key_id = ?'); params.push(q.relay_key_id); }
  wheres.push('created_at >= ?'); params.push(q.start_date);
  wheres.push('created_at <= ?'); params.push(q.end_date);

  const rows = db.prepare(`
    SELECT model, COUNT(*) as calls, COALESCE(SUM(total_tokens), 0) as tokens,
           COALESCE(SUM(cost), 0) as total_cost
    FROM call_logs WHERE ${wheres.join(' AND ')}
    GROUP BY model ORDER BY total_cost DESC
  `).all(...params) as { model: string; calls: number; tokens: number; total_cost: number }[];

  const result: ModelSummaryRow[] = [];
  for (const row of rows) {
    const pricing = db.prepare('SELECT * FROM model_pricing WHERE model_id = ?').get(row.model) as
      { prompt_price: number; completion_price: number; cached_prompt_price: number } | undefined;
    const alias = db.prepare(`
      SELECT ma.alias_name, cm.model_id FROM model_aliases ma
      JOIN channel_models cm ON cm.id = ma.channel_model_id
      WHERE ma.alias_name = ? OR cm.model_id = ? LIMIT 1
    `).get(row.model, row.model) as { alias_name: string; model_id: string } | undefined;

    result.push({
      model: row.model,
      model_alias: alias?.alias_name === row.model ? '' : (alias?.alias_name || ''),
      prompt_price: pricing?.prompt_price || 0,
      completion_price: pricing?.completion_price || 0,
      cached_prompt_price: pricing?.cached_prompt_price || 0,
      calls: row.calls,
      tokens: row.tokens,
      total_cost: row.total_cost,
    });
  }
  return result;
}

// ---- CSV / Zip ----

function csvEscape(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function rowsToCsv(rows: Record<string, any>[], columns: { key: string; label: string }[]): string {
  const bom = '﻿';
  const header = columns.map(c => csvEscape(c.label)).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      const v = row[c.key];
      if (v === null || v === undefined) return '';
      return csvEscape(String(v));
    }).join(',')
  ).join('\n');
  return bom + header + '\n' + body;
}

export async function generateCsvZip(
  detail: DetailRow[], daily: DailySummaryRow[], model: ModelSummaryRow[]
): Promise<{ buffer: Buffer; filename: string }> {
  const archive = archiver('zip', { zlib: { level: 6 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  const archiveEnd = new Promise<void>(resolve => archive.on('end', () => resolve()));

  archive.append(rowsToCsv(detail, [
    { key: 'created_at', label: '时间' },
    { key: 'relay_key_name', label: '密钥名称' },
    { key: 'model', label: '模型' },
    { key: 'channel_name', label: '渠道' },
    { key: 'prompt_tokens', label: '输入Token' },
    { key: 'cached_input_tokens', label: '缓存输入Token' },
    { key: 'completion_tokens', label: '输出Token' },
    { key: 'total_tokens', label: '总Token' },
    { key: 'cost', label: '费用(元)' },
    { key: 'status', label: '状态' },
    { key: 'ip', label: 'IP' },
    { key: 'id', label: '日志ID' },
  ]), { name: 'detail.csv' });

  archive.append(rowsToCsv(daily, [
    { key: 'date', label: '日期' },
    { key: 'calls', label: '调用次数' },
    { key: 'success', label: '成功' },
    { key: 'fail', label: '失败' },
    { key: 'tokens', label: '总Token' },
    { key: 'total_cost', label: '总费用(元)' },
  ]), { name: 'daily_summary.csv' });

  archive.append(rowsToCsv(model, [
    { key: 'model', label: '模型ID' },
    { key: 'model_alias', label: '模型别名' },
    { key: 'prompt_price', label: '输入单价(元/百万Token)' },
    { key: 'completion_price', label: '输出单价(元/百万Token)' },
    { key: 'cached_prompt_price', label: '缓存单价(元/百万Token)' },
    { key: 'calls', label: '调用次数' },
    { key: 'tokens', label: '总Token' },
    { key: 'total_cost', label: '总费用(元)' },
  ]), { name: 'model_summary.csv' });

  archive.finalize();
  await archiveEnd;
  return { buffer: Buffer.concat(chunks), filename: `billing-${Date.now()}.zip` };
}
