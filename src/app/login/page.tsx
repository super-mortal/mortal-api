'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineIcon } from '@/lib/icon';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('admin_token', data.token);
        router.push('/dashboard');
      } else {
        setError(data.error || '登录失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-indigo-50/30 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-base sm:text-lg mb-3">
            M
          </div>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Mortal API</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">管理后台</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                管理员密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                placeholder="请输入密码"
                autoFocus
              />
            </div>

            {error && (
              <div className="text-xs sm:text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-100 flex items-center gap-2">
                <InlineIcon name="circleX" className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <InlineIcon name="loaderCircle" className="w-4 h-4 animate-spin" />
              ) : (
                <InlineIcon name="arrowRight" className="w-4 h-4" />
              )}
              {loading ? '验证中...' : '登录'}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] sm:text-xs text-gray-400 mt-5 sm:mt-6">
          默认密码在 .env.local 中配置
        </p>
      </div>
    </div>
  );
}
