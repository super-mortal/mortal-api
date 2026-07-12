// ============================================================
// POST /api/admin/login
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminPassword, signAdminToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }
    if (verifyAdminPassword(password)) {
      const token = signAdminToken();
      return NextResponse.json({ token, success: true });
    }
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
