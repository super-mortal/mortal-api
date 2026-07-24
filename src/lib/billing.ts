// ============================================================
// Billing export — query + Excel generation
// ============================================================
import { getDb } from './db';
import ExcelJS from 'exceljs';

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
  latency_ms: number;
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

export interface BillingSummary {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  avgLatency: number;
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
           cost, latency_ms, status, ip, id
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

export function queryBillingSummary(q: ExportQuery): BillingSummary {
  const db = getDb();
  const params: string[] = [];
  const wheres: string[] = [];
  if (q.relay_key_id) { wheres.push('relay_key_id = ?'); params.push(q.relay_key_id); }
  wheres.push('created_at >= ?'); params.push(q.start_date);
  wheres.push('created_at <= ?'); params.push(q.end_date);

  const row = db.prepare(`
    SELECT COUNT(*) as totalRequests,
           COALESCE(SUM(total_tokens), 0) as totalTokens,
           COALESCE(SUM(cost), 0) as totalCost,
           COALESCE(ROUND(AVG(latency_ms)), 0) as avgLatency
    FROM call_logs WHERE ${wheres.join(' AND ')}
  `).get(...params) as BillingSummary;

  return row;
}

// ============================================================
// Excel generator
// ============================================================

function computeSummary(detail: DetailRow[]) {
  const totalInput = detail.reduce((s, r) => s + (r.prompt_tokens || 0), 0);
  const totalCached = detail.reduce((s, r) => s + (r.cached_input_tokens || 0), 0);
  const totalOutput = detail.reduce((s, r) => s + (r.completion_tokens || 0), 0);
  const totalCost = detail.reduce((s, r) => s + (r.cost || 0), 0);
  const succ = detail.filter(r => r.status === 'success').length;
  const total = detail.length;
  const rate = total > 0 ? ((succ / total) * 100).toFixed(1) : '0.0';
  return { totalInput, totalCached, totalOutput, totalCost, succ, fail: total - succ, total, rate };
}

/** Columns that should be center-aligned */
const CENTER_COLS = new Set([
  'relay_key_name', 'prompt_tokens', 'cached_input_tokens',
  'completion_tokens', 'total_tokens', 'cost', 'latency_ms',
]);

/** Number columns that should be center-aligned in summary sheets */
const CENTER_NUM_COLS = new Set([
  'calls', 'success', 'fail', 'tokens', 'total_cost',
  'prompt_price', 'completion_price', 'cached_prompt_price',
]);

function applyCenter(ws: ExcelJS.Worksheet, colKeys: string[], startRow: number, endRow: number) {
  for (let r = startRow; r <= endRow; r++) {
    const row = ws.getRow(r);
    colKeys.forEach(key => {
      const idx = (ws.columns as any[]).findIndex((c: any) => c.key === key);
      if (idx >= 0) row.getCell(idx + 1).alignment = { horizontal: 'center', vertical: 'middle' };
    });
  }
}

function applyHeaderStyle(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
}

export async function generateExcel(
  detail: DetailRow[],
  daily: DailySummaryRow[],
  model: ModelSummaryRow[],
  options?: { includeLatency?: boolean },
): Promise<{ buffer: Buffer; filename: string }> {
  const wb = new ExcelJS.Workbook();
  const includeLatency = options?.includeLatency ?? true;

  // ===== Sheet 1: 明细 =====
  const ws1 = wb.addWorksheet('明细');
  const colDef1 = [
    { header: '时间', key: 'created_at', width: 22 },
    { header: '密钥名称', key: 'relay_key_name', width: 20 },
    { header: '模型', key: 'model', width: 24 },
    { header: '输入Token', key: 'prompt_tokens', width: 14 },
    { header: '缓存输入Token', key: 'cached_input_tokens', width: 16 },
    { header: '输出Token', key: 'completion_tokens', width: 14 },
    { header: '总Token', key: 'total_tokens', width: 12 },
    { header: '费用(元)', key: 'cost', width: 14 },
    ...(includeLatency ? [{ header: '延迟 (ms)', key: 'latency_ms', width: 12 }] : []),
    { header: '状态', key: 'status', width: 10 },
    { header: 'IP', key: 'ip', width: 16 },
    { header: '日志ID', key: 'id', width: 24 },
  ];
  ws1.columns = colDef1;
  const C = colDef1.length;
  const lastCol = String.fromCharCode(64 + C);

  // Summary block
  const s = computeSummary(detail);

  ws1.mergeCells(`A1:${lastCol}1`);
  ws1.getRow(1).height = 28;
  const t = ws1.getCell('A1');
  t.value = '汇总统计';
  t.font = { bold: true, size: 13 };
  t.alignment = { horizontal: 'center', vertical: 'middle' };

  ws1.mergeCells(`A2:${lastCol}2`);
  const s1 = ws1.getCell('A2');
  s1.value = `总输入Token: ${s.totalInput.toLocaleString()}  |  总缓存输入Token: ${s.totalCached.toLocaleString()}  |  总输出Token: ${s.totalOutput.toLocaleString()}  |  总费用: ¥${s.totalCost.toFixed(4)}`;
  s1.font = { size: 10, color: { argb: 'FF6B7280' } };
  s1.alignment = { horizontal: 'center', vertical: 'middle' };

  ws1.mergeCells(`A3:${lastCol}3`);
  const s2 = ws1.getCell('A3');
  s2.value = `总调用次数: ${s.total.toLocaleString()}  |  成功: ${s.succ.toLocaleString()}  |  失败: ${s.fail.toLocaleString()}  |  成功率: ${s.rate}%`;
  s2.font = { size: 10, color: { argb: 'FF6B7280' } };
  s2.alignment = { horizontal: 'center', vertical: 'middle' };

  ws1.getRow(4).height = 6; // gap

  // Header at row 5
  colDef1.forEach((col, i) => {
    const cell = ws1.getRow(5).getCell(i + 1);
    cell.value = col.header;
  });
  applyHeaderStyle(ws1.getRow(5));

  // Data rows
  detail.forEach((row, i) => {
    const r = ws1.getRow(6 + i);
    colDef1.forEach((col, j) => {
      const cell = r.getCell(j + 1);
      const v = (row as any)[col.key];
      cell.value = v !== null && v !== undefined ? v : '';
    });
  });
  applyCenter(ws1, [...CENTER_COLS], 5, detail.length + 5);

  // ===== Sheet 2: 按天汇总 =====
  const ws2 = wb.addWorksheet('按天汇总');
  const colDef2 = [
    { header: '日期', key: 'date', width: 14 },
    { header: '调用次数', key: 'calls', width: 12 },
    { header: '成功', key: 'success', width: 10 },
    { header: '失败', key: 'fail', width: 10 },
    { header: '总Token', key: 'tokens', width: 14 },
    { header: '总费用(元)', key: 'total_cost', width: 16 },
  ];
  ws2.columns = colDef2;
  colDef2.forEach((col, i) => {
    const cell = ws2.getRow(1).getCell(i + 1);
    cell.value = col.header;
  });
  applyHeaderStyle(ws2.getRow(1));
  daily.forEach((row, i) => {
    const r = ws2.getRow(2 + i);
    colDef2.forEach((col, j) => {
      const cell = r.getCell(j + 1);
      const v = (row as any)[col.key];
      cell.value = v !== null && v !== undefined ? v : '';
    });
  });
  applyCenter(ws2, [...CENTER_NUM_COLS], 1, daily.length + 1);

  // ===== Sheet 3: 按模型汇总 =====
  const ws3 = wb.addWorksheet('按模型汇总');
  const colDef3 = [
    { header: '模型ID', key: 'display_id', width: 24 },
    { header: '调用次数', key: 'calls', width: 12 },
    { header: '总 Tokens', key: 'tokens', width: 14 },
    { header: '总费用', key: 'total_cost', width: 16 },
  ];
  ws3.columns = colDef3;
  colDef3.forEach((col, i) => {
    const cell = ws3.getRow(1).getCell(i + 1);
    cell.value = col.header;
  });
  applyHeaderStyle(ws3.getRow(1));

  // Smart model-id display: show alias when set, otherwise the raw model id
  const modelData = model.map(m => ({
    display_id: m.model_alias || m.model,
    calls: m.calls,
    tokens: m.tokens.toLocaleString(),
    total_cost: `¥ ${m.total_cost.toFixed(4)}`,
  }));

  modelData.forEach((row, i) => {
    const r = ws3.getRow(2 + i);
    colDef3.forEach((col, j) => {
      const cell = r.getCell(j + 1);
      const v = (row as any)[col.key];
      cell.value = v !== null && v !== undefined ? v : '';
    });
  });
  // Center every cell in this sheet (header + all data columns)
  applyCenter(ws3, colDef3.map(c => c.key), 1, model.length + 1);

  const wbBuffer = await wb.xlsx.writeBuffer();
  return { buffer: wbBuffer as unknown as Buffer, filename: `billing-${Date.now()}.xlsx` };
}
