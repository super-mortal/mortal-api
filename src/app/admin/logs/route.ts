// ============================================================
// GET/DELETE /api/admin/logs
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { listCallLogs, deleteCallLog, deleteCallLogsByDate, deleteCallLogsByIds } from '@/lib/logs';

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

  // Bulk delete by explicit id list (request body)
  try {
    const body = await request.json().catch(() => null);
    if (body && Array.isArray(body.ids) && body.ids.length > 0) {
      const deletedCount = deleteCallLogsByIds(body.ids.filter((x: any) => typeof x === 'string'));
      return NextResponse.json({ success: true, deleted: deletedCount });
    }
  } catch {
    // fall through to query-param handling below
  }

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
  if (!id) return NextResponse.json({ error: 'id, ids, or start_date required' }, { status: 400 });
  const deleted = deleteCallLog(id);
  return NextResponse.json({ success: deleted });
}
