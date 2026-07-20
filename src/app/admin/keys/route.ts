import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { listRelayKeys, createRelayKey, updateRelayKey, deleteRelayKey, refreshRelayKey, getRelayKeyById } from '@/lib/keys';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  const { searchParams } = new URL(request.url);

  // Get channels data along with keys for the frontend
  if (searchParams.get('scope') === 'full') {
    const keys = listRelayKeys();
    const db = getDb();
    const channels = db.prepare('SELECT id, name FROM channels ORDER BY name').all();
    return NextResponse.json({ keys, channels });
  }

  const keys = listRelayKeys();
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const body = await request.json();
    const key = createRelayKey(body.name || 'New Key', body.spend_limit ?? 0, body.expires_at || null, body.allowed_models || '', body.allowed_channels || '', body.is_pinned ? 1 : 0);
    return NextResponse.json({ key }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const body = await request.json();
    const updated = updateRelayKey(body.id, {
      name: body.name,
      spend_limit: body.spend_limit,
      is_active: body.is_active,
      is_pinned: body.is_pinned,
      expires_at: body.expires_at,
      allowed_models: body.allowed_models,
      allowed_channels: body.allowed_channels,
    });

    let newKeyValue: string | null = null;
    if (body.refresh_key) {
      newKeyValue = refreshRelayKey(body.id);
    }

    const key = body.refresh_key ? getRelayKeyById(body.id) : undefined;
    return NextResponse.json({ success: updated, new_key: newKeyValue, key });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const err = requireAdmin(request);
  if (err) return err;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const deleted = deleteRelayKey(id);
    return NextResponse.json({ success: deleted });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
