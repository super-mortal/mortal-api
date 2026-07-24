import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/key-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const cookie = request.cookies.get('mps');
  if (cookie?.value) deleteSession(cookie.value);
  const res = NextResponse.json({ success: true });
  res.cookies.set('mps', '', { path: `/u/${name}`, maxAge: 0 });
  return res;
}
