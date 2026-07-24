'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineIcon } from '@/lib/icon';

const RE = {
  length: /.{12,}/,
  lower: /[a-z]/,
  upper: /[A-Z]/,
  special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/,
  digit: /\d/,
};

function checks(pwd: string) {
  return {
    length: RE.length.test(pwd),
    lower: RE.lower.test(pwd),
    upper: RE.upper.test(pwd),
    special: RE.special.test(pwd),
    digit: RE.digit.test(pwd),
  };
}

export default function SetupForm({ keyName }: { keyName: string }) {
  const router = useRouter();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = checks(pwd);
  const allOk = c.length && c.lower && c.upper && c.special;

  const submit = async () => {
    if (!allOk) return setErr('密码必须 ≥12 位,含大小写字母与特殊字符');
    if (pwd !== confirm) return setErr('两次输入不一致');
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/u/${encodeURIComponent(keyName)}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd, confirm }),
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
          <InlineIcon name="shield-check" className="w-5 h-5 text-indigo-500" />
          <h1 className="text-lg font-semibold text-gray-900">设置访问密码</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Key <span className="font-mono text-gray-700">{keyName}</span> 首次访问,请设置访问密码(仅用于查看使用情况,与 API Key 无关)
        </p>
        <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          placeholder="至少 12 位,含大小写字母与特殊字符"
        />
        <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
          {[
            ['length', '≥ 12 位'],
            ['lower', '含小写字母'],
            ['upper', '含大写字母'],
            ['special', '含特殊字符'],
          ].map(([k, label]) => (
            <li key={k} className={c[k as keyof typeof c] ? 'text-emerald-600' : 'text-gray-400'}>
              <InlineIcon name={c[k as keyof typeof c] ? 'check' : 'x'} className="w-3 h-3 inline mr-1" />
              {label}
            </li>
          ))}
        </ul>
        <label className="block text-sm font-medium text-gray-700 mt-4 mb-1">确认密码</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        {err && (
          <div className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {err}
          </div>
        )}
        <button
          onClick={submit}
          disabled={!allOk || busy || pwd !== confirm}
          className="mt-5 w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <InlineIcon name="lock" className="w-4 h-4" />
          {busy ? '设置中…' : '设置并查看'}
        </button>
      </div>
    </div>
  );
}
