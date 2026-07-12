// ============================================================
// Admin auth middleware for API routes
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from './auth';

export function requireAdmin(request: NextRequest): NextResponse | null {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || !verifyAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
