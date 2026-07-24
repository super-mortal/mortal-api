import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  createSession,
  setAccessPassword,
} from '@/lib/key-access';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  if (!checkRateLimit(`${ip}:setup`)) {
    return NextResponse.json({ error: '请求过于频繁,请稍后再试' }, { status: 429 });
  }
  const { name } = await params;
  const body = await request.json().catch(() => ({}));
  const { password, confirm } = body || {};
  if (typeof password !== 'string' || password !== confirm) {
    return NextResponse.json({ error: '两次密码输入不一致' }, { status: 400 });
  }
  const r = setAccessPassword(name, password);
  if (!r.ok) {
    const map: Record<string, { status: number; msg: string }> = {
      NOT_FOUND: { status: 404, msg: 'Key 不存在' },
      ALREADY_SET: { status: 409, msg: '该 Key 已设置访问密码,请使用登录页' },
      WEAK_PASSWORD: {
        status: 400,
        msg: '密码必须 ≥12 位,含大小写字母与特殊字符',
      },
    };
    const { status, msg } = map[r.reason];
    return NextResponse.json({ error: msg }, { status });
  }
  const ua = request.headers.get('user-agent') || '';
  const session = createSession(r.relayKeyId, ip, ua);
  const res = NextResponse.json({ success: true });
  res.cookies.set('mps', session.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
  return res;
}
