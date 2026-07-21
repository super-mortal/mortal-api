// ============================================================
// Billing export — query + file generation
// ============================================================
import { getDb } from './db';
import { ZipArchive } from 'archiver';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'path';

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
  const archive = new ZipArchive();
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  const archiveEnd = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', (err) => reject(err));
  });

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

// ============================================================
// Excel generator
// ============================================================

export async function generateExcel(
  detail: DetailRow[], daily: DailySummaryRow[], model: ModelSummaryRow[]
): Promise<{ buffer: Buffer; filename: string }> {
  const wb = new ExcelJS.Workbook();

  // Sheet 1: 明细
  const ws1 = wb.addWorksheet('明细');
  ws1.columns = [
    { header: '时间', key: 'created_at', width: 22 },
    { header: '密钥名称', key: 'relay_key_name', width: 20 },
    { header: '模型', key: 'model', width: 24 },
    { header: '渠道', key: 'channel_name', width: 16 },
    { header: '输入Token', key: 'prompt_tokens', width: 14 },
    { header: '缓存输入Token', key: 'cached_input_tokens', width: 16 },
    { header: '输出Token', key: 'completion_tokens', width: 14 },
    { header: '总Token', key: 'total_tokens', width: 12 },
    { header: '费用(元)', key: 'cost', width: 14 },
    { header: '状态', key: 'status', width: 10 },
    { header: 'IP', key: 'ip', width: 16 },
    { header: '日志ID', key: 'id', width: 24 },
  ];
  ws1.addRows(detail);
  const hdr1 = ws1.getRow(1);
  hdr1.font = { bold: true };
  hdr1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  // Sheet 2: 按天汇总
  const ws2 = wb.addWorksheet('按天汇总');
  ws2.columns = [
    { header: '日期', key: 'date', width: 14 },
    { header: '调用次数', key: 'calls', width: 12 },
    { header: '成功', key: 'success', width: 10 },
    { header: '失败', key: 'fail', width: 10 },
    { header: '总Token', key: 'tokens', width: 14 },
    { header: '总费用(元)', key: 'total_cost', width: 16 },
  ];
  ws2.addRows(daily);
  const hdr2 = ws2.getRow(1);
  hdr2.font = { bold: true };
  hdr2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  // Sheet 3: 按模型汇总
  const ws3 = wb.addWorksheet('按模型汇总');
  ws3.columns = [
    { header: '模型ID', key: 'model', width: 24 },
    { header: '模型别名', key: 'model_alias', width: 20 },
    { header: '输入单价', key: 'prompt_price', width: 14 },
    { header: '输出单价', key: 'completion_price', width: 14 },
    { header: '缓存单价', key: 'cached_prompt_price', width: 14 },
    { header: '调用次数', key: 'calls', width: 12 },
    { header: '总Token', key: 'tokens', width: 14 },
    { header: '总费用(元)', key: 'total_cost', width: 16 },
  ];
  ws3.addRows(model);
  const hdr3 = ws3.getRow(1);
  hdr3.font = { bold: true };
  hdr3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  const wbBuffer = await wb.xlsx.writeBuffer();
  return { buffer: wbBuffer as unknown as Buffer, filename: `billing-${Date.now()}.xlsx` };
}

// ============================================================
// PDF generator
// ============================================================

const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'NotoSansSC-Regular.ttf');

function drawTable(
  doc: PDFKit.PDFDocument, headers: string[], rows: string[][],
  startY: number, opts: { colWidths: number[]; fontSize?: number; headerBg?: string }
): number {
  const fs = opts.fontSize || 8;
  const colWidths = opts.colWidths;
  const leftMargin = 40;
  let y = startY;
  const rowHeight = fs + 8;
  const headerBg = opts.headerBg || '#F3F4F6';

  // Header row
  doc.font('NotoSansSC').fontSize(fs);
  let x = leftMargin;
  doc.rect(leftMargin, y - 4, colWidths.reduce((a, b) => a + b, 0) + (headers.length - 1) * 1, rowHeight)
     .fill(headerBg).fillColor('#000');
  doc.fillColor('#000');
  headers.forEach((h, i) => {
    doc.text(h, x + 2, y, { width: colWidths[i], align: i === 0 ? 'left' : 'right' });
    x += colWidths[i] + 1;
  });
  y += rowHeight + 2;

  // Data rows
  doc.font('NotoSansSC').fontSize(fs - 0.5);
  for (const row of rows) {
    if (y + rowHeight > doc.page.height - 60) {
      doc.addPage();
      y = 40;
      // Re-draw header on new page
      doc.font('NotoSansSC').fontSize(fs);
      x = leftMargin;
      doc.rect(leftMargin, y - 4, colWidths.reduce((a, b) => a + b, 0) + (headers.length - 1) * 1, rowHeight)
         .fill(headerBg).fillColor('#000');
      doc.fillColor('#000');
      headers.forEach((h, i) => {
        doc.text(h, x + 2, y, { width: colWidths[i], align: i === 0 ? 'left' : 'right' });
        x += colWidths[i] + 1;
      });
      y += rowHeight + 2;
      doc.font('NotoSansSC').fontSize(fs - 0.5);
    }
    x = leftMargin;
    row.forEach((cell, i) => {
      doc.text(cell, x + 2, y, { width: colWidths[i], align: i === 0 ? 'left' : 'right' });
      x += colWidths[i] + 1;
    });
    y += rowHeight;
  }
  return y;
}

export async function generatePdf(
  daily: DailySummaryRow[], model: ModelSummaryRow[],
  keyName: string, startDate: string, endDate: string
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), filename: `billing-${Date.now()}.pdf` }));
    doc.on('error', reject);

    doc.registerFont('NotoSansSC', FONT_PATH);
    doc.font('NotoSansSC');

    // Title
    doc.fontSize(18).text('账单导出报告', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#666');
    doc.text(`密钥: ${keyName || '全部'}`, { align: 'center' });
    doc.text(`时间范围: ${startDate} ~ ${endDate}`, { align: 'center' });
    doc.text(`生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`, { align: 'center' });
    doc.moveDown(0.8);
    doc.fillColor('#000');

    // Daily summary table
    doc.fontSize(12).font('NotoSansSC').text('按天汇总', { underline: true });
    doc.moveDown(0.3);
    const dailyHdrs = ['日期', '调用次数', '成功', '失败', '总Token', '总费用(元)'];
    const dailyRows = daily.map(r => [
      r.date, r.calls.toLocaleString(), r.success.toLocaleString(),
      r.fail.toLocaleString(), r.tokens.toLocaleString(), r.total_cost.toFixed(6)
    ]);
    drawTable(doc, dailyHdrs, dailyRows, doc.y, { colWidths: [80, 80, 70, 70, 100, 95], fontSize: 9 });

    doc.moveDown(1);

    // Model summary table
    doc.fontSize(12).font('NotoSansSC').text('按模型汇总', { underline: true });
    doc.moveDown(0.3);
    const modelHdrs = ['模型', '调用次数', '总Token', '总费用(元)', '输入单价', '输出单价'];
    const modelRows = model.map(r => [
      r.model_alias || r.model, r.calls.toLocaleString(), r.tokens.toLocaleString(),
      r.total_cost.toFixed(6), r.prompt_price.toFixed(2), r.completion_price.toFixed(2),
    ]);
    drawTable(doc, modelHdrs, modelRows, doc.y + 4, { colWidths: [120, 80, 100, 95, 50, 50], fontSize: 9 });

    // Page numbers
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor('#999');
      doc.text(`Mortal API - 账单导出报告 - 第 ${i + 1} / ${totalPages} 页`, 40, doc.page.height - 30, { align: 'center' });
    }

    doc.end();
  });
}
