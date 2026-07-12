// ============================================================
// GET/DELETE /api/admin/logs
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { listCallLogs, deleteCallLog, deleteCallLogsByDate } from '@/lib/logs';

function normalizeDate(s?: string): string | undefined {
  if (!s) return s;
  return s.replace('T', ' ');
}

export async function GET(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;

  const { searchParams } = new URL(request.url);
  const options = {
    limit: parseInt(searchParams.get('limit') || '50'),
    offset: parseInt(searchParams.get('offset') || '0'),
    relay_key_id: searchParams.get('relay_key_id') || undefined,
    model: searchParams.get('model') || undefined,
    status: searchParams.get('status') || undefined,
    start_date: normalizeDate(searchParams.get('start_date') || undefined),
    end_date: normalizeDate(searchParams.get('end_date') || undefined),
  };

  const result = listCallLogs(options);
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const startDate = searchParams.get('start_date');

  // Bulk delete by date range
  if (startDate) {
    const endDate = normalizeDate(searchParams.get('end_date') || undefined);
    const count = deleteCallLogsByDate(normalizeDate(startDate)!, endDate);
    return NextResponse.json({ success: true, deleted: count });
  }

  // Single delete by id
  if (!id) return NextResponse.json({ error: 'id or start_date required' }, { status: 400 });
  const deleted = deleteCallLog(id);
  return NextResponse.json({ success: deleted });
}
