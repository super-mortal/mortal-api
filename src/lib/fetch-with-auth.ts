// ============================================================
// Authenticated fetch — auto-redirects to login on 401
// ============================================================

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('admin_token');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    // Use a small delay so the user can see what happened
    window.location.href = '/login';
    throw new Error('Unauthorized — redirected to login');
  }

  return res;
}
