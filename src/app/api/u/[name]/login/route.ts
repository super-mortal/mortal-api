import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  createSession,
  getRelayKeyByName,
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
  const body = await request.json().catch(() => ({}));
  if (typeof body?.password !== 'string') {
    return NextResponse.json({ error: '缺少密码' }, { status: 400 });
  }
  // 单次查询同时拿到 id 与 access_password_enc
  const key = getRelayKeyByName(name);
  if (!key) return NextResponse.json({ error: 'Key 不存在' }, { status: 404 });
  if (!key.access_password_enc) {
    return NextResponse.json({ error: '尚未设置访问密码' }, { status: 409 });
  }
  if (key.must_reset_password === 1) {
    return NextResponse.json(
      { error: '密码已被重置,请先通过设置新密码页修改后再登录' },
      { status: 409 }
    );
  }
  if (!verifyAccessPassword(name, body.password)) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 });
  }
  const ua = request.headers.get('user-agent') || '';
  const session = createSession(key.id, ip, ua);
  const res = NextResponse.json({ success: true });
  res.cookies.set('mps', session.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
  return res;
}
