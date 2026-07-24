import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  createSession,
  setAccessPassword,
  getRelayKeyByName,
  verifyAccessPassword,
  isPasswordStrong,
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
  const { password, confirm, currentPassword } = body || {};

  // 1. 基础校验
  if (typeof password !== 'string' || password !== confirm) {
    return NextResponse.json({ error: '两次密码输入不一致' }, { status: 400 });
  }
  if (!isPasswordStrong(password)) {
    return NextResponse.json(
      { error: '密码必须 ≥12 位,含大小写字母与特殊字符' },
      { status: 400 }
    );
  }

  // 2. 查 key(一次查询)
  const k = getRelayKeyByName(name);
  if (!k) return NextResponse.json({ error: 'Key 不存在' }, { status: 404 });

  const isFirstSetup = !k.access_password_enc;
  const providedCurrent = typeof currentPassword === 'string' && currentPassword.length > 0;

  if (!isFirstSetup && k.must_reset_password !== 1) {
    return NextResponse.json({ error: '该 Key 当前无需改密' }, { status: 409 });
  }

  // 3. 首次设密 vs 改密路径分流
  if (isFirstSetup) {
    if (providedCurrent) {
      return NextResponse.json(
        { error: '首次设密不需要 currentPassword' },
        { status: 400 }
      );
    }
  } else {
    // 已有密码 — 改密路径
    if (!providedCurrent) {
      return NextResponse.json({ error: '请输入当前密码' }, { status: 400 });
    }
    if (!verifyAccessPassword(name, currentPassword)) {
      return NextResponse.json(
        { error: '当前密码错误,请输入管理员重置后的默认值' },
        { status: 401 }
      );
    }
    if (currentPassword === password) {
      return NextResponse.json(
        { error: '新密码不能与当前密码相同' },
        { status: 400 }
      );
    }
  }

  // 4. 原子写(setAccessPassword 内部 SQL 守卫)
  const r = setAccessPassword(name, password);
  if (!r.ok) {
    const map: Record<string, { status: number; msg: string }> = {
      NOT_FOUND: { status: 404, msg: 'Key 不存在' },
      ALREADY_SET: { status: 409, msg: '该 Key 已设置访问密码,请使用登录页' },
      WEAK_PASSWORD: {
        status: 400,
        msg: '密码必须 ≥12 位,含大小写字母与特殊字符',
      },
      PASSWORD_ALREADY_SET_AND_NOT_RESET: {
        status: 409,
        msg: '密码已是您自己设置,无需改密。如需修改请联系管理员',
      },
    };
    const { status, msg } = map[r.reason];
    return NextResponse.json({ error: msg }, { status });
  }

  // 5. 建 session + 发 cookie
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