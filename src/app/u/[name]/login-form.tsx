'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineIcon } from '@/lib/icon';

export default function LoginForm({ keyName }: { keyName: string }) {
  const router = useRouter();
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/u/${encodeURIComponent(keyName)}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setErr(data.error || `请求失败 (${r.status})`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <InlineIcon name="lock" className="w-5 h-5 text-indigo-500" />
          <h1 className="text-lg font-semibold text-gray-900">登录查看使用情况</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Key <span className="font-mono text-gray-700">{keyName}</span>
        </p>
        <label className="block text-sm font-medium text-gray-700 mb-1">访问密码</label>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="若忘记请联系管理员重置"
        />
        {err && (
          <div className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        <button
          onClick={submit}
          disabled={busy || !pwd}
          className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300 transition-colors"
        >
          {busy ? '登录中…' : '登录'}
        </button>
        <p className="mt-4 text-xs text-gray-400">
          如管理员重置过密码,默认值: <code className="font-mono">@123456789123Pk</code>
        </p>
      </div>
    </div>
  );
}
