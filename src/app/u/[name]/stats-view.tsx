'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeySummary, DailyBucket, RecentLog } from '@/lib/key-stats';
import { InlineIcon } from '@/lib/icon';
import LogoutButton from './logout-button';
import TrendChart from './trend-chart';

function fmt(n: number) {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString('zh-CN');
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

export default function StatsView({
  keyName, isActive, summary, trend, days, recent,
}: {
  keyName: string;
  isActive: boolean;
  summary: KeySummary;
  trend: DailyBucket[];
  days: number;
  recent: RecentLog[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const setDays = (d: number) => {
    const p = new URLSearchParams(params);
    p.set('days', String(d));
    router.push(`/u/${encodeURIComponent(keyName)}?${p.toString()}`);
  };

  const FILTER_OPTIONS = [
    { label: '今天', value: 1 },
    { label: '7天', value: 7 },
    { label: '30天', value: 30 },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Key 使用统计</div>
            <div className="text-base font-semibold text-gray-900 font-mono">{keyName}</div>
          </div>
          <LogoutButton keyName={keyName} />
        </div>
        {!isActive && (
          <div className="bg-amber-50 border-t border-amber-200 text-amber-800 text-xs px-4 py-2 text-center">
            <InlineIcon name="shield-check" className="w-3 h-3 inline mr-1" />
            该 Key 已被管理员禁用,以下为历史快照
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 第一行: 2 格统计 + 筛选 */}
        <section className="flex items-start justify-between gap-3">
          <div className="grid grid-cols-2 gap-3 flex-1">
            <Tile label="总调用次数" value={fmt(summary.totalCalls)} />
            <Tile label="总费用 (¥)" value={summary.totalCost.toFixed(2)}
              sub={summary.lastCallAt ? `最近: ${summary.lastCallAt}` : '尚无调用'} />
          </div>
          <div className="flex gap-1 shrink-0 mt-1">
            {FILTER_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setDays(value)}
                className={`px-2.5 py-1 rounded text-xs ${
                  days === value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* 第二行: Token 明细 */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="缓存输入" value={fmt(summary.cachedInputTokens)} />
          <Tile label="未缓存输入" value={fmt(summary.promptTokens - summary.cachedInputTokens)} />
          <Tile label="输出" value={fmt(summary.completionTokens)} />
          <Tile label="总 Tokens" value={fmt(summary.totalTokens)} />
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">调用趋势</h2>
          <TrendChart data={trend} />
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">近期调用明细(最近 50 条)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">时间</th>
                  <th className="px-4 py-2 text-left">模型</th>
                  <th className="px-4 py-2 text-right">Prompt</th>
                  <th className="px-4 py-2 text-right">Completion</th>
                  <th className="px-4 py-2 text-right">费用 (¥)</th>
                  <th className="px-4 py-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recent.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">暂无调用记录</td></tr>
                )}
                {recent.map((r) => (
                  <tr key={r.id} className="text-gray-700">
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{r.created_at}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.model}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(r.prompt_tokens)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(r.completion_tokens)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{(r.cost || 0).toFixed(4)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${
                        r.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {r.status === 'success' ? '成功' : '失败'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
