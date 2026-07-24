// ============================================================
// Next.js Middleware — path normalization & compatibility
// ============================================================
// Handles common client misconfigurations so they still work:
//   /api/v1/chat/completions   → /v1/chat/completions   (strip /api)
//   /api/v1/models             → /v1/models             (strip /api)
//   /api/admin/*               → /admin/*               (strip /api)
//   /v1/v1/chat/completions    → /v1/chat/completions   (deduplicate /v1)
//   /v1/v1/models              → /v1/models             (deduplicate /v1)
//   /chat/completions          → /v1/chat/completions   (add /v1)
//   /models                    → /v1/models             (add /v1)
// ============================================================
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let normalized = pathname;

  // 1. Strip /api prefix
  if (normalized.startsWith('/api/') && !normalized.startsWith('/api/u/')) {
    normalized = normalized.slice(4); // remove '/api'
  } else if (normalized === '/api') {
    normalized = '/';
  }

  // 2. Deduplicate /v1/v1 → /v1
  normalized = normalized.replace(/^\/v1\/v1\b/, '/v1');

  // 3. Handle bare paths that need /v1 prefix
  if (normalized === '/chat/completions') {
    normalized = '/v1/chat/completions';
  } else if (normalized === '/models') {
    normalized = '/v1/models';
  }

  // If path changed, rewrite internally
  if (normalized !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = normalized;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Strip /api prefix
    '/api/:path*',
    // Deduplicate /v1/v1
    '/v1/v1/:path*',
    // Add missing /v1 prefix
    '/chat/completions',
    '/models',
  ],
};
