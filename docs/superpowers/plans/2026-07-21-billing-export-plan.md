# Billing Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a billing export feature to the Mortal API admin dashboard, supporting CSV/Excel/PDF export of usage detail and summaries filtered by key and date range.

**Architecture:** Backend generates files synchronously in the API route handler and buffers the output before returning it as a Response. PDF requires a Chinese font file (Noto Sans SC). Navigation gets a new "账单导出" entry.

**Tech Stack:** exceljs (Excel), pdfkit (PDF), archiver (CSV zip), Noto Sans SC Regular (PDF Chinese font)

**Design Spec:** `docs/superpowers/specs/2026-07-21-billing-export-design.md`

## Global Constraints

- All icons must use Lucide Icons from `public/icons/` (local SVG), **no CDN**
- Admin routes must use `requireAdmin` from `@/lib/admin-middleware`
- Prices in model_pricing are per 1,000,000 tokens (divide by 1,000,000)
- Date/time is always Beijing time (UTC+8) throughout
- All new files follow existing patterns: naming (kebab-case files, PascalCase components, camelCase functions)
- CSV output must include UTF-8 BOM (`﻿`) for Excel compatibility
- Export date range limited to 1 year max
- download and receipt icons needed — add to scripts/download-lucide-icons.js

---
### Task 1: Install dependencies & download assets

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `scripts/download-lucide-icons.js` (add receipt + download icons)
- New: `public/fonts/NotoSansSC-Regular.ttf` (downloaded)

- [ ] **Step 1: Install npm packages**

```bash
npm install exceljs pdfkit archiver
npm install -D @types/exceljs 2>/dev/null; true
```

Expected: Packages added to `package.json` dependencies.

- [ ] **Step 2: Download receipt + download icons**

Add `'receipt'` and `'download'` to the `neededIcons` array in `scripts/download-lucide-icons.js`, then run:

```bash
node scripts/download-lucide-icons.js
```

Expected: `public/icons/receipt.svg` and `public/icons/download.svg` exist.

- [ ] **Step 3: Download Noto Sans SC font for PDF**

```bash
mkdir -p public/fonts
curl -L -o public/fonts/NotoSansSC-Regular.ttf \
  "https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansSC-Regular.otf"
```

Expected: `public/fonts/NotoSansSC-Regular.ttf` exists (~6MB OTF).

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/download-lucide-icons.js public/icons/receipt.svg public/icons/download.svg public/fonts/NotoSansSC-Regular.ttf
git commit -m "chore: add exceljs/pdfkit/archiver deps, receipt+download icons, Noto Sans SC font"
```

---

### Task 2: Create billing library — query functions + CSV/zip generator

**Files:**
- Create: `src/lib/billing.ts`

**Interfaces:**
- Consumes: `getDb()` from `@/lib/db`
- Produces: `queryDetail()`, `queryDailySummary()`, `queryModelSummary()` — return typed arrays
- Produces: `generateCsvZip()` — returns `{ zipBuffer, filename }`

- [ ] **Step 1: Write the complete billing.ts with queries + CSV + helpers**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/billing.ts
git commit -m "feat: add billing library with queries, helpers, and CSV/zip generator"
```

---

### Task 3: Add Excel generator + PDF generator to billing library

**Files:**
- Modify: `src/lib/billing.ts` (append Excel + PDF generators)

- [ ] **Step 1: Append Excel generator function**

```typescript
// ============================================================
// Excel generator
// ============================================================
import ExcelJS from 'exceljs';

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
  return { buffer: wbBuffer as Buffer, filename: `billing-${Date.now()}.xlsx` };
}
```

- [ ] **Step 2: Append PDF generator function**

```typescript
// ============================================================
// PDF generator
// ============================================================
import PDFDocument from 'pdfkit';
import path from 'path';

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
  doc.font('Helvetica-Bold').fontSize(fs);
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
  doc.font('Helvetica').fontSize(fs - 0.5);
  for (const row of rows) {
    if (y + rowHeight > doc.page.height - 60) {
      doc.addPage();
      y = 40;
      // Re-draw header on new page
      doc.font('Helvetica-Bold').fontSize(fs);
      x = leftMargin;
      doc.rect(leftMargin, y - 4, colWidths.reduce((a, b) => a + b, 0) + (headers.length - 1) * 1, rowHeight)
         .fill(headerBg).fillColor('#000');
      doc.fillColor('#000');
      headers.forEach((h, i) => {
        doc.text(h, x + 2, y, { width: colWidths[i], align: i === 0 ? 'left' : 'right' });
        x += colWidths[i] + 1;
      });
      y += rowHeight + 2;
      doc.font('Helvetica').fontSize(fs - 0.5);
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
```

Note: The import statements (`ExcelJS` and `PDFDocument`) need to be added at the top of `billing.ts`. The complete imports section for the file will be:

```typescript
import { getDb } from './db';
import archiver from 'archiver';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'path';
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing.ts
git commit -m "feat: add Excel and PDF generators to billing library"
```

---

### Task 4: Create admin billing API route

**Files:**
- Create: `src/app/admin/billing/route.ts`

**Interfaces:**
- Consumes: `requireAdmin` from `@/lib/admin-middleware`
- Consumes: all exports from `@/lib/billing`

- [ ] **Step 1: Write the API route**

```typescript
// ============================================================
// POST /admin/billing — export billing data (CSV / Excel / PDF)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import {
  queryDetail, queryDailySummary, queryModelSummary,
  generateCsvZip, generateExcel, generatePdf, getRelayKeyName,
  ExportQuery,
} from '@/lib/billing';

export async function POST(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;

  try {
    const body = await request.json();
    const { relay_key_id, format } = body as {
      relay_key_id: string;
      start_date: string;
      end_date: string;
      format: 'csv' | 'xlsx' | 'pdf';
    };
    const startDate = body.start_date?.replace('T', ' ');
    const endDate = body.end_date?.replace('T', ' ');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
    }

    // Limit date range to 1 year
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (endMs - startMs > 365 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: '日期范围不能超过 1 年' }, { status: 400 });
    }

    const q: ExportQuery = { relay_key_id: relay_key_id || '', start_date: startDate, end_date: endDate };

    const detail = queryDetail(q);
    const daily = queryDailySummary(q);
    const modelRows = queryModelSummary(q);

    if (detail.length === 0) {
      return NextResponse.json({ error: '未找到数据' }, { status: 404 });
    }

    switch (format) {
      case 'csv': {
        const { buffer, filename } = await generateCsvZip(detail, daily, modelRows);
        return new Response(buffer, {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }
      case 'xlsx': {
        const { buffer, filename } = await generateExcel(detail, daily, modelRows);
        return new Response(buffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }
      case 'pdf': {
        const keyName = relay_key_id ? getRelayKeyName(relay_key_id) : '全部 Key';
        const { buffer, filename } = await generatePdf(daily, modelRows, keyName, startDate, endDate);
        return new Response(buffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      }
      default:
        return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
    }
  } catch (e) {
    console.error('Billing export error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/billing/route.ts
git commit -m "feat: add billing export API route (POST /admin/billing)"
```

---

### Task 5: Create billing export frontend page

**Files:**
- Create: `src/app/dashboard/billing/page.tsx`

- [ ] **Step 1: Create the page component**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { InlineIcon } from '@/lib/icon';
import { apiFetch } from '@/lib/fetch-with-auth';
import { SelectFilter } from '@/lib/select-filter';
import { DatePicker } from '@/lib/date-picker';

interface RelayKey { id: string; name: string; }
type ExportFormat = 'csv' | 'xlsx' | 'pdf';

interface ExportRecord {
  time: string;
  keyName: string;
  format: ExportFormat;
  period: string;
}

function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FORMAT_OPTS: { label: string; value: ExportFormat }[] = [
  { label: 'CSV (.zip)', value: 'csv' },
  { label: 'Excel (.xlsx)', value: 'xlsx' },
  { label: 'PDF', value: 'pdf' },
];

export default function BillingPage() {
  const [keys, setKeys] = useState<RelayKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<ExportRecord[]>([]);
  const [activePreset, setActivePreset] = useState('today');

  useEffect(() => {
    apiFetch('/admin/keys').then(res => {
      if (res.ok) res.json().then(d => setKeys(d.keys || []));
    });
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('billing_export_history');
      if (saved) setHistory(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const saveHistory = useCallback((rec: ExportRecord) => {
    const updated = [rec, ...history].slice(0, 5);
    setHistory(updated);
    try { localStorage.setItem('billing_export_history', JSON.stringify(updated)); } catch { /* ignore */ }
  }, [history]);

  const handlePreset = (preset: 'today' | '7d' | '30d') => {
    setActivePreset(preset);
    const now = new Date();
    if (preset === 'today') {
      setStartDate(fmtDate(now));
      setEndDate(fmtDate(now));
    } else if (preset === '7d') {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      setStartDate(fmtDate(past));
      setEndDate(fmtDate(now));
    } else {
      const past = new Date(now);
      past.setDate(past.getDate() - 29);
      setStartDate(fmtDate(past));
      setEndDate(fmtDate(now));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiFetch('/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relay_key_id: selectedKeyId,
          start_date: startDate + ' 00:00:00',
          end_date: endDate + ' 23:59:59',
          format,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '导出失败' }));
        alert(err.error || '导出失败');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') || '';
      a.download = disposition.match(/filename="(.+)"/)?.[1] || `billing-export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const keyName = keys.find(k => k.id === selectedKeyId)?.name || '全部 Key';
      saveHistory({
        time: new Date().toLocaleString('zh-CN'),
        keyName,
        format,
        period: `${startDate} ~ ${endDate}`,
      });
    } catch (e) {
      alert('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">账单导出</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">按密钥和时间范围导出使用明细与汇总账单</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm space-y-4">
        {/* Key filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-medium text-gray-600 w-20 shrink-0">密钥筛选</label>
          <SelectFilter
            options={[
              { label: '全部 Key', value: '' },
              ...keys.map(k => ({ label: k.name, value: k.id })),
            ]}
            value={selectedKeyId}
            onChange={setSelectedKeyId}
            placeholder="全部 Key"
          />
        </div>

        {/* Date range */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-medium text-gray-600 w-20 shrink-0">时间范围</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
              {(['today', '7d', '30d'] as const).map(p => (
                <button key={p} onClick={() => handlePreset(p)}
                  className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all ' + (
                    activePreset === p
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  )}>
                  {p === 'today' ? '今日' : p === '7d' ? '7 天' : '30 天'}
                </button>
              ))}
            </div>
            <button onClick={() => setActivePreset('custom')}
              className={'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ' + (
                activePreset === 'custom'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              )}>
              <InlineIcon name="calendar" className="w-3 h-3 inline mr-1" />自定义
            </button>
          </div>
        </div>

        {activePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 ml-0 sm:ml-20">
            <DatePicker value={startDate} onChange={v => setStartDate(v)} />
            <span className="text-gray-300">—</span>
            <DatePicker value={endDate} onChange={v => setEndDate(v)} />
          </div>
        )}

        {/* Format selection */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-medium text-gray-600 w-20 shrink-0">导出格式</label>
          <div className="flex items-center gap-2">
            {FORMAT_OPTS.map(opt => (
              <button key={opt.value} onClick={() => setFormat(opt.value)}
                className={'px-4 py-2 rounded-lg border text-xs sm:text-sm font-medium transition-all flex items-center gap-2 ' + (
                  format === opt.value
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                )}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Export button */}
        <div className="flex justify-end pt-2">
          <button onClick={handleExport} disabled={exporting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
            {exporting ? (
              <InlineIcon name="loaderCircle" className="w-4 h-4 animate-spin" />
            ) : (
              <InlineIcon name="download" className="w-4 h-4" />
            )}
            {exporting ? '正在导出...' : '导出账单'}
          </button>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">最近导出记录</h3>
          <div className="space-y-2">
            {history.map((rec, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-xs">
                <div className="flex items-center gap-3 text-gray-600">
                  <span className="text-gray-400">{rec.time}</span>
                  <span className="font-medium text-gray-800">{rec.keyName}</span>
                  <span className="text-gray-400">{rec.period}</span>
                </div>
                <span className="text-xs font-medium uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  {rec.format}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/billing/page.tsx
git commit -m "feat: add billing export frontend page"
```

---

### Task 6: Update navigation

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Add billing to navItems array**

In `src/app/dashboard/layout.tsx`, add the billing nav entry after logs:

```typescript
const navItems = [
  { href: '/dashboard', label: '仪表盘', icon: 'layout-dashboard' },
  { href: '/dashboard/keys', label: 'Key 管理', icon: 'key' },
  { href: '/dashboard/channels', label: '渠道管理', icon: 'plug' },
  { href: '/dashboard/models', label: '模型广场', icon: 'bot' },
  { href: '/dashboard/logs', label: '调用日志', icon: 'list' },
  { href: '/dashboard/billing', label: '账单导出', icon: 'receipt' },   // ← new
  { href: '/dashboard/backup', label: '备份恢复', icon: 'hard-drive' },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat: add billing export nav item"
```

---

### Task 7: Build & verify

- [ ] **Step 1: Build the project**

```bash
npm run build 2>&1
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run type check if build doesn't**

```bash
npx tsc --noEmit 2>&1
```

Expected: No type errors.
