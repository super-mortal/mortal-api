'use client';

import { useEffect, useState, useCallback } from 'react';
import { InlineIcon } from '@/lib/icon';
import { toBeijing } from '@/lib/date';
import { DatePicker } from '@/lib/date-picker';
import { SelectFilter } from '@/lib/select-filter';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';

interface DashboardData {
  stats: {
    total_calls: number; success_calls: number; fail_calls: number;
    total_prompt_tokens: number; total_completion_tokens: number; total_tokens: number;
    total_cached_input_tokens: number; total_uncached_input_tokens: number;
    total_cost: number;
  };
  dailyStats: { date: string; calls: number; tokens: number; completion_tokens: number; cached_tokens: number; uncached_tokens: number; cost: number }[];
  modelStats: { model: string; calls: number; tokens: number; completion_tokens: number; cached_tokens: number; uncached_tokens: number; total_cost: number }[];
}

interface RelayKey { id: string; name: string; key: string; }

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#4338ca', '#7c3aed'];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<RelayKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [activeDate, setActiveDate] = useState('today');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const fetchKeys = useCallback(async () => {
    const res = await fetch('/admin/keys', { headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } });
    if (res.ok) { const d = await res.json(); setKeys(d.keys || []); }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (activeDate === 'today') {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      params.set('start_date', `${y}-${m}-${d} 00:00:00`);
      params.set('end_date', `${y}-${m}-${d} 23:59:59`);
    } else if (activeDate === '7d') params.set('days', '7');
    else if (activeDate === '30d') params.set('days', '30');
    else if (activeDate === 'custom') {
      if (startMonth) params.set('start_date', startMonth + ' 00:00:00');
      if (endMonth) params.set('end_date', endMonth + ' 23:59:59');
    }
    if (selectedKeyId) params.set('relay_key_id', selectedKeyId);
    return `/admin/stats?${params}`;
  }, [activeDate, startMonth, endMonth, selectedKeyId]);

  const fetchStats = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(buildUrl(), { headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } });
      if (res.ok) setData(await res.json());
      else if (res.status === 401) { localStorage.removeItem('admin_token'); window.location.href = '/login'; }
      else { const e = await res.text(); setError(e); }
    } catch (e) { setError('请求失败'); console.error(e); }
    finally { setLoading(false); }
  }, [buildUrl]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (activeDate !== 'today') return;
    const timer = setInterval(() => { fetchStats(); }, 60000);
    return () => clearInterval(timer);
  }, [activeDate, fetchStats]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        {error ? (
          <div className="text-center"><p className="text-red-400 text-sm">{error}</p>
            <button onClick={fetchStats} className="mt-2 text-xs text-indigo-500 underline">重试</button>
          </div>
        ) : <InlineIcon name="loaderCircle" className="w-6 h-6 animate-spin text-indigo-600" />}
      </div>
    );
  }

  const successRate = data.stats.total_calls > 0
    ? ((data.stats.success_calls / data.stats.total_calls) * 100).toFixed(1) : '0';

  const todayCost = data.dailyStats.length > 0
    ? '¥' + (data.dailyStats[data.dailyStats.length - 1].cost?.toFixed(4) || '0.0000')
    : '¥0.0000';

  const statCards = [
    { label: '总调用次数', value: data.stats.total_calls.toLocaleString(), sub: `成功率 ${successRate}%`, color: 'text-gray-900', icon: 'activity' },
    { label: '成功', value: data.stats.success_calls.toLocaleString(), sub: '调用', color: 'text-emerald-600', icon: 'check' },
    { label: '失败', value: data.stats.fail_calls.toLocaleString(), sub: '调用', color: data.stats.fail_calls > 0 ? 'text-red-500' : 'text-gray-900', icon: 'x' },
    { label: '今日消费', value: todayCost, sub: '今日', color: 'text-emerald-600', icon: 'dollar-sign' },
    { label: '输出 Tokens', value: data.stats.total_completion_tokens.toLocaleString(), sub: 'Completion', color: 'text-purple-500', icon: 'checkCheck' },
    { label: '命中缓存', value: data.stats.total_cached_input_tokens.toLocaleString(), sub: '缓存输入 Tokens', color: 'text-emerald-500', icon: 'zap' },
    { label: '未命中缓存', value: data.stats.total_uncached_input_tokens.toLocaleString(), sub: '未缓存输入 Tokens', color: 'text-amber-500', icon: 'flame' },
    { label: '总 Tokens', value: data.stats.total_tokens.toLocaleString(), sub: `费用 ${data.stats.total_cost.toFixed(4)}`, color: 'text-indigo-600', icon: 'database' },
  ];

  const pieData = data.modelStats.map((m, i) => ({ name: m.model, value: m.calls, color: COLORS[i % COLORS.length] }));
  const totalPie = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">仪表盘</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">数据总览与统计图表</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
            <button onClick={function() { setActiveDate('today'); setShowCustom(false); }}
              className={'px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ' + (activeDate === 'today' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>今日</button>
            <button onClick={function() { setActiveDate('7d'); setShowCustom(false); }}
              className={'px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ' + (activeDate === '7d' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>7 天</button>
            <button onClick={function() { setActiveDate('30d'); setShowCustom(false); }}
              className={'px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ' + (activeDate === '30d' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>30 天</button>
            <button onClick={function() { setActiveDate('all'); setShowCustom(false); }}
              className={'px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ' + (activeDate === 'all' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>全部</button>
            <button onClick={function() { setActiveDate('custom'); setShowCustom(true); }}
              className={'px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ' + (activeDate === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>
              <InlineIcon name="calendar" className="w-3 h-3 inline mr-1" />自定义</button>
          </div>
          {showCustom && (
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker value={startMonth} onChange={(v) => { setStartMonth(v); }} />
              <span className="text-gray-400 text-sm">→</span>
              <DatePicker value={endMonth} onChange={(v) => { setEndMonth(v); }} />
              <button onClick={() => { setActiveDate('today'); setShowCustom(false); setStartMonth(''); setEndMonth(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">清除</button>
            </div>
          )}
          <SelectFilter
            options={[
              { label: '全部 Key', value: '' },
              ...keys.map(k => ({ label: k.name, value: k.id })),
            ]}
            value={selectedKeyId}
            onChange={setSelectedKeyId}
            placeholder="全部 Key"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {statCards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4 hover:shadow-sm transition-shadow">
            <div className={`text-lg sm:text-xl font-semibold ${c.color} truncate`}>{c.value}</div>
            <div className="text-[10px] sm:text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <InlineIcon name={c.icon} className="w-3 h-3" />
              {c.label}
            </div>
          </div>
        ))}
      </div>

      {/* Row 1: Daily Call Trends — full width */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">每日调用趋势</h3>
        <p className="text-xs text-gray-400 mb-4">按日期统计的调用次数</p>
        {data.dailyStats.length > 0 ? (
          <div className="h-52 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyStats}>
                <defs><linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                <Area type="monotone" dataKey="calls" stroke="#6366f1" strokeWidth={2} fill="url(#colorCalls)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-52 sm:h-64 flex items-center justify-center text-sm text-gray-400">暂无数据</div>
        )}
      </div>

      {/* Row 2: Daily Token Consumption — full width + horizontal scroll */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">每日 Token 消耗</h3>
        <p className="text-xs text-gray-400 mb-4">输出 / 缓存输入 / 未缓存输入</p>
        {data.dailyStats.length > 0 ? (
          <div className="h-52 sm:h-64">
            <div className="overflow-x-auto w-full">
              <div style={{ minWidth: Math.max(data.dailyStats.length * 28 + 80, 400) }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.dailyStats} maxBarSize={24}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', padding: '6px 10px' }}
                      formatter={(value: any, name: any) => [value.toLocaleString(), name]}
                      labelFormatter={(label: any) => label.slice(5)}
                    />
                    <Bar dataKey="uncached_tokens" name="未缓存输入" fill="#f59e0b" stackId="a" />
                    <Bar dataKey="cached_tokens" name="缓存输入" fill="#22c55e" stackId="a" />
                    <Bar dataKey="completion_tokens" name="输出" fill="#8b5cf6" stackId="a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 mt-3 text-[10px] sm:text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#f59e0b]" /> 未缓存输入</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#22c55e]" /> 缓存输入</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#8b5cf6]" /> 输出</span>
            </div>
          </div>
        ) : (
          <div className="h-52 sm:h-64 flex items-center justify-center text-sm text-gray-400">暂无数据</div>
        )}
      </div>

      {/* Row 3: Cost Trends — full width */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">近 7 天消费趋势</h3>
        <p className="text-xs text-gray-400 mb-4">按日期统计的消费金额</p>
        {data.dailyStats.length > 0 ? (
          <div className="h-52 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyStats}>
                <defs><linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                <Area type="monotone" dataKey="cost" stroke="#6366f1" strokeWidth={2} fill="url(#colorCost)" name="消费(元)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-52 sm:h-64 flex items-center justify-center text-sm text-gray-400">暂无数据</div>
        )}
      </div>

      {/* Row 4: Model Distribution + Token Composition — 2 cols */}
      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">模型调用分布</h3>
          <p className="text-xs text-gray-400 mb-4">各模型调用占比</p>
          {pieData.length > 0 ? (
            <div className="flex flex-col items-center">
              <div className="h-44 sm:h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: any, name: any) => [Number(value).toLocaleString(), name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] sm:text-xs text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                    {d.name} {totalPie > 0 ? `(${((d.value / totalPie) * 100).toFixed(1)}%)` : ''}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-44 sm:h-48 flex items-center justify-center text-sm text-gray-400">暂无数据</div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Token 构成</h3>
          <p className="text-xs text-gray-400 mb-4">输出 / 缓存输入 / 未缓存输入</p>
          {data.dailyStats.length > 0 ? (
            <div className="h-44 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dailyStats} maxBarSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={26} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', padding: '6px 10px' }}
                    formatter={(value: any, name: any) => [value.toLocaleString(), name]}
                    labelFormatter={(label: any) => label.slice(5)}
                  />
                  <Bar dataKey="uncached_tokens" name="未缓存输入" fill="#f59e0b" stackId="a" />
                  <Bar dataKey="cached_tokens" name="缓存输入" fill="#22c55e" stackId="a" />
                  <Bar dataKey="completion_tokens" name="输出" fill="#a78bfa" stackId="a" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-44 sm:h-48 flex items-center justify-center text-sm text-gray-400">暂无数据</div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 sm:mt-3 text-[10px] sm:text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#f59e0b]" /> 未缓存</span>
            <span className="font-mono text-gray-700">{data.stats.total_uncached_input_tokens.toLocaleString()}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#22c55e]" /> 缓存</span>
            <span className="font-mono text-gray-700">{data.stats.total_cached_input_tokens.toLocaleString()}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#a78bfa]" /> 输出</span>
            <span className="font-mono text-gray-700">{data.stats.total_completion_tokens.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Row 5: Success Rate + Model Cost Ranking — 2 cols */}
      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">成功率</h3>
          <p className="text-xs text-gray-400 mb-4">调用健康度概览</p>
          <div className="flex flex-col items-center justify-center h-44 sm:h-48">
            <div className="relative w-28 h-28 sm:w-32 sm:h-32">
              <svg className="w-28 h-28 sm:w-32 sm:h-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="#22c55e" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - Math.min(Number(successRate) / 100, 1))}`}
                  className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className="text-xl sm:text-2xl font-bold text-gray-900">{successRate}%</span>
                <span className="text-[9px] sm:text-[10px] text-gray-400">成功率</span>
              </div>
            </div>
            <div className="flex gap-3 sm:gap-4 mt-2 sm:mt-3 text-[10px] sm:text-xs text-gray-500">
              <span className="flex items-center gap-1"><InlineIcon name="check" className="w-3 h-3 text-emerald-500" /> {data.stats.success_calls}</span>
              <span className="flex items-center gap-1"><InlineIcon name="x" className="w-3 h-3 text-red-400" /> {data.stats.fail_calls}</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">按模型消费排行</h3>
          <p className="text-xs text-gray-400 mb-4">各模型消费金额</p>
          {data.modelStats.length > 0 ? (
            <div className="h-44 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.modelStats.slice(0, 10)} layout="vertical" maxBarSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="model" width={80} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value: any) => [`¥${Number(value).toFixed(4)}`, '消费']} />
                  <Bar dataKey="total_cost" fill="#6366f1" name="消费(元)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-44 sm:h-48 flex items-center justify-center text-sm text-gray-400">暂无数据</div>
          )}
        </div>
      </div>
    </div>
  );
}
