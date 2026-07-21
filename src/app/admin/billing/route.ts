// ============================================================
// POST /admin/billing — export billing data (Excel only)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import {
  queryDetail, queryDailySummary, queryModelSummary,
  generateExcel, getRelayKeyName,
  ExportQuery,
} from '@/lib/billing';

export async function POST(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;

  try {
    const body = await request.json();
    const { relay_key_id } = body as {
      relay_key_id: string;
      start_date: string;
      end_date: string;
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

    const { buffer, filename } = await generateExcel(detail, daily, modelRows);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error('Billing export error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
