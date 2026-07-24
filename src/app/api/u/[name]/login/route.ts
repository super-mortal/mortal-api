import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  createSession,
  getRelayKeyPasswordStatus,
  verifyAccessPassword,
} from '@/lib/key-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  if (!checkRateLimit(`${ip}:login`)) {
    return NextResponse.json({ error: '请求过于频繁,请稍后再试' }, { status: 429 });
  }
  const { name } = await params;
  const status = getRelayKeyPasswordStatus(name);
  if (!status) return NextResponse.json({ error: 'Key 不存在' }, { status: 404 });
  if (!status.hasPassword) {
    return NextResponse.json({ error: '尚未设置访问密码' }, { status: 409 });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body?.password !== 'string') {
    return NextResponse.json({ error: '缺少密码' }, { status: 400 });
  }
  if (!verifyAccessPassword(name, body.password)) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 });
  }
  // 重新查 key id 用于建 session
  const keyId = (await import('@/lib/key-access')).getRelayKeyByName(name)!.id;
  const ua = request.headers.get('user-agent') || '';
  const session = createSession(keyId, ip, ua);
  const res = NextResponse.json({ success: true });
  res.cookies.set('mps', session.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: `/u/${name}`,
    maxAge: 30 * 24 * 3600,
  });
  return res;
}
