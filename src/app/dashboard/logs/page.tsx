'use client';

import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
import { InlineIcon } from '@/lib/icon';
import { Modal } from '@/lib/modal';
import { toBeijingFull } from '@/lib/date';
import { apiFetch } from '@/lib/fetch-with-auth';
import { SelectFilter } from '@/lib/select-filter';
import { TableEmpty, StatusBadge } from '@/lib/ui';
import { DateTimePicker, DatePicker } from '@/lib/date-picker';

function todayStart(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T00:00`;
}
function todayEnd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T23:59`;
}

interface CallLog {
  id: string; relay_key_name: string; relay_key_id: string; model: string; channel_name: string;
  prompt_tokens: number; completion_tokens: number; cached_input_tokens: number; total_tokens: number;
  cost: number; status: string; error_message: string | null;
  latency_ms: number;
  ip: string; created_at: string;
}
interface RelayKey { id: string; name: string; }

export default function LogsPage() {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<RelayKey[]>([]);
  const [page, setPage] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [statusFilter, setStatusFilter] = useState('');
  const [keyFilter, setKeyFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [startMonth, setStartMonth] = useState(todayStart());
  const [endMonth, setEndMonth] = useState(todayEnd());
  const [activeDate, setActiveDate] = useState<'today' | '7d' | '30d' | 'custom'>('today');
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [deleteDateFrom, setDeleteDateFrom] = useState('');
  const [deleteDateTo, setDeleteDateTo] = useState('');
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [deletingInProgress, setDeletingInProgress] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'single' | 'batch';
    id?: string;
    count?: number;
  } | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const toggleExpand = (id: string) => {
    setExpandedLogId(prev => prev === id ? null : id);
  };
  const [pageSize, setPageSize] = useState(20);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const pageSizeRef = useRef<HTMLDivElement>(null);

  const fetchKeys = useCallback(async () => {
    const res = await apiFetch('/admin/keys');
    if (res.ok) setKeys((await res.json()).keys || []);
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (statusFilter) params.set('status', statusFilter);
    if (keyFilter) params.set('relay_key_id', keyFilter);
    if (modelFilter) params.set('model', modelFilter);
    if (startMonth) params.set('start_date', startMonth);
    if (endMonth) params.set('end_date', endMonth);
    const res = await fetch(`/admin/logs?${params}`, { headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } });
    if (res.ok) { const d = await res.json(); setLogs(d.logs); setTotal(d.total); }
    setLoading(false);
  }, [page, pageSize, statusFilter, keyFilter, modelFilter, startMonth, endMonth]);

  const handleFilterPreset = useCallback((preset: 'today' | '7d' | '30d') => {
    setActiveDate(preset);
    setPage(0);
    setSelected(new Set());
    const now = new Date();
    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}T00:00`;
    };
    const fmtEnd = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}T23:59`;
    };

    if (preset === 'today') {
      setStartMonth(fmt(now));
      setEndMonth(fmtEnd(now));
    } else if (preset === '7d') {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      setStartMonth(fmt(past));
      setEndMonth(fmtEnd(now));
    } else if (preset === '30d') {
      const past = new Date(now);
      past.setDate(past.getDate() - 29);
      setStartMonth(fmt(past));
      setEndMonth(fmtEnd(now));
    }
  }, []);

  useEffect(() => { fetchLogs(); fetchKeys(); }, [fetchLogs, fetchKeys]);

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'single') {
      await fetch(`/admin/logs?id=${deleteConfirm.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      setDeleteConfirm(null);
      setSelected(new Set());
      fetchLogs();
      return;
    }
    const count = selected.size;
    setDeletingInProgress(true);
    setDeleteMsg(`正在删除 ${count} 条日志...`);
    let failed = false;
    try {
      const res = await fetch('/admin/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
        body: JSON.stringify({ ids: [...selected] }),
      });
      if (!res.ok) failed = true;
    } catch { failed = true; }
    setDeleteConfirm(null);
    setSelected(new Set());
    setDeletingInProgress(false);
    if (failed) {
      setDeleteMsg('批量删除失败，请重试');
      setTimeout(() => setDeleteMsg(null), 5000);
    } else {
      setDeleteMsg(`已删除 ${count} 条日志`);
      setTimeout(() => setDeleteMsg(null), 3000);
    }
    fetchLogs();
  };

  const handleBatchDeleteByDate = async () => {
    if (!deleteDateFrom) return;
    const range = `${deleteDateFrom}${deleteDateTo ? ` ~ ${deleteDateTo}` : ''}`;
    if (!confirm(`确定删除 ${range} 的全部日志？此操作不可撤销。`)) return;
    const params = new URLSearchParams();
    params.set('start_date', deleteDateFrom + ' 00:00:00');
    if (deleteDateTo) params.set('end_date', deleteDateTo + ' 23:59:59');
    const res = await fetch(`/admin/logs?${params}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } });
    if (res.ok) {
      const data = await res.json();
      setDeleteMsg(`已删除 ${data.deleted} 条日志`);
      setTimeout(() => setDeleteMsg(null), 3000);
    }
    setShowBatchDelete(false);
    fetchLogs();
  };

  const goToPage = (p: number) => {
    const np = Math.max(0, Math.min(totalPages - 1, p));
    setPage(np);
    setPageInput(String(np + 1));
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNumbers: number[] = [];
  for (let i = Math.max(0, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-semibold text-gray-900">调用日志</h1>
            {total > 0 && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{total} 条</span>}
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">查看和管理 API 调用记录</p>
        </div>
        <div className="flex items-center gap-2">
          {deleteMsg && (
            <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg animate-in fade-in">
              <InlineIcon name="check" className="w-3 h-3 inline mr-1" />{deleteMsg}
            </span>
          )}
          <button onClick={() => setShowBatchDelete(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-xs sm:text-sm text-red-500 hover:bg-red-50 transition-colors">
            <InlineIcon name="trash2" className="w-3.5 h-3.5" /> 按日期删除
          </button>
        </div>
      </div>

      <Modal open={showBatchDelete} onClose={() => setShowBatchDelete(false)} title="按日期批量删除日志">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">选择日期范围，删除该时间段内<b>所有</b>日志记录。</p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
            <InlineIcon name="triangleAlert" className="w-4 h-4 shrink-0" />此操作不可撤销
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">开始日期</label>
              <DatePicker value={deleteDateFrom} onChange={setDeleteDateFrom} className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">结束日期</label>
              <DatePicker value={deleteDateTo} onChange={setDeleteDateTo} className="w-full" />
            </div>
          </div>
          <button onClick={handleBatchDeleteByDate} disabled={!deleteDateFrom}
            className="w-full py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            <InlineIcon name="trash2" className="w-4 h-4" /> 立即删除
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal — replaces browser confirm() */}
      <Modal open={!!deleteConfirm} onClose={() => { if (!deletingInProgress) setDeleteConfirm(null); }}
        title="确认删除">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 flex items-center gap-2">
            <InlineIcon name="triangleAlert" className="w-5 h-5 shrink-0" />
            {deleteConfirm?.type === 'batch'
              ? `确定删除已选的 ${deleteConfirm.count} 条日志？`
              : '确定删除此条日志？'}
            <span className="font-medium"> 此操作不可撤销。</span>
          </div>
          {deletingInProgress ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <InlineIcon name="loaderCircle" className="w-6 h-6 animate-spin text-indigo-600" />
              <span className="text-sm text-gray-500">正在删除...</span>
            </div>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                取消
              </button>
              <button onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                <InlineIcon name="trash2" className="w-4 h-4" /> 确认删除
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-wrap">
          {/* 快捷筛选按钮组 */}
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
            <button onClick={() => handleFilterPreset('today')}
              className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all ' + (activeDate === 'today' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>今日</button>
            <button onClick={() => handleFilterPreset('7d')}
              className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all ' + (activeDate === '7d' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>7 天</button>
            <button onClick={() => handleFilterPreset('30d')}
              className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all ' + (activeDate === '30d' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>30 天</button>
            <button onClick={() => { setActiveDate('custom'); setPage(0); }}
              className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all ' + (activeDate === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50')}>
              <InlineIcon name="calendar" className="w-3 h-3 inline mr-1" />自定义</button>
            {/* 每页条数 */}
            <div ref={pageSizeRef} className="ml-auto pl-1.5 border-l border-gray-200 relative">
              <button onClick={() => setPageSizeOpen(!pageSizeOpen)}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                {pageSize} 条/页
                <InlineIcon name="chevronDown" className="w-3 h-3" />
              </button>
              {pageSizeOpen && (
                <div className="absolute z-50 top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[100px]">
                  {[10, 20, 50, 100].map(n => (
                    <button key={n} onClick={() => { setPageSize(n); setPage(0); setPageInput('1'); setPageSizeOpen(false); }}
                      className={'w-full text-left px-3 py-1.5 text-[11px] transition-colors ' + (pageSize === n ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700 hover:bg-gray-50')}>
                      {n} 条/页
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* 自定义日期输入框 — 仅 activeDate === 'custom' 时显示 */}
          {activeDate === 'custom' && (
            <div className="flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-3 py-1.5">
              <DateTimePicker value={startMonth} onChange={(v) => { setStartMonth(v); setPage(0); }} />
              <span className="text-gray-300 shrink-0">—</span>
              <DateTimePicker value={endMonth} onChange={(v) => { setEndMonth(v); setPage(0); }} />
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <SelectFilter
              options={[
                { label: '全部状态', value: '' },
                { label: '成功', value: 'success', color: 'green' },
                { label: '失败', value: 'fail', color: 'red' },
              ]}
              value={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(0); }}
              placeholder="全部状态"
            />
            <SelectFilter
              options={[
                { label: '全部 Key', value: '' },
                ...keys.map(k => ({ label: k.name, value: k.id })),
              ]}
              value={keyFilter}
              onChange={(v) => { setKeyFilter(v); setPage(0); }}
              placeholder="全部 Key"
            />
            <input type="text" value={modelFilter} onChange={(e) => { setModelFilter(e.target.value); setPage(0); }}
              placeholder="模型名"
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-24" />
            {(startMonth || statusFilter || keyFilter || modelFilter) && (
              <button onClick={() => { setStartMonth(''); setEndMonth(''); setStatusFilter(''); setKeyFilter(''); setModelFilter(''); setActiveDate('custom'); setPage(0); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 whitespace-nowrap">清除</button>
            )}
          </div>
        </div>
      </div>

      {/* Action Bar — appears when rows are selected */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-3 shadow-sm">
          <span className="text-sm text-indigo-700 font-medium">
            ☑ 已选 {selected.size} 条
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 bg-white transition-colors">
              取消选择
            </button>
            <button onClick={() => setDeleteConfirm({ type: 'batch', count: selected.size })}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors">
              <InlineIcon name="trash2" className="w-3.5 h-3.5" /> 批量删除
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-10 px-2 py-3 text-center">
                  <input type="checkbox"
                    checked={logs.length > 0 && selected.size === logs.length}
                    onChange={() => {
                      if (selected.size === logs.length) {
                        setSelected(new Set());
                      } else {
                        setSelected(new Set(logs.map(l => l.id)));
                      }
                    }}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                </th>
                <th className="text-left px-3 sm:px-4 py-3 font-medium text-gray-500 text-[9px] sm:text-[11px]">时间 (北京时间)</th>
                <th className="text-left px-3 sm:px-4 py-3 font-medium text-gray-500 text-[9px] sm:text-[11px] hidden sm:table-cell">Key</th>
                <th className="text-left px-3 sm:px-4 py-3 font-medium text-gray-500 text-[9px] sm:text-[11px]">模型</th>
                <th className="text-right px-3 sm:px-4 py-3 font-medium text-gray-500 text-[9px] sm:text-[11px] hidden sm:table-cell">渠道</th>
                <th className="text-right px-3 sm:px-4 py-3 font-medium text-gray-500 text-[9px] sm:text-[11px]">Token</th>
                <th className="text-right px-3 sm:px-4 py-3 font-medium text-gray-500 text-[9px] sm:text-[11px] hidden sm:table-cell">延迟 (ms)</th>
                <th className="px-2.5 sm:px-3 py-2.5 text-[9px] font-medium text-gray-400 uppercase tracking-wider text-right hidden md:table-cell">费用(元)</th>
                <th className="text-center px-3 sm:px-4 py-3 font-medium text-gray-500 text-[9px] sm:text-[11px] hidden sm:table-cell">状态</th>
                <th className="text-center px-3 sm:px-4 py-3 font-medium text-gray-500 text-[9px] sm:text-[11px] w-10">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableEmpty colSpan={10} loading />
              ) : logs.length === 0 ? (
                <TableEmpty colSpan={10} icon="list" text="暂无调用记录" />
              ) : logs.map((log) => (
                <Fragment key={log.id}>
                  <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer ${
                    selected.has(log.id) ? 'bg-indigo-50/30 border-l-2 border-indigo-400' : ''
                  }`}
                    onClick={() => toggleExpand(log.id)}>
                    <td className="px-2 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <input type="checkbox"
                        checked={selected.has(log.id)}
                        onChange={() => {
                          const next = new Set(selected);
                          next.has(log.id) ? next.delete(log.id) : next.add(log.id);
                          setSelected(next);
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-[9px] sm:text-[11px] text-gray-500 whitespace-nowrap font-mono">{toBeijingFull(log.created_at)}</td>
                    <td className="px-3 sm:px-4 py-3 text-gray-700 text-[9px] sm:text-[11px] hidden sm:table-cell truncate max-w-[100px]">{log.relay_key_name}</td>
                    <td className="px-3 sm:px-4 py-3"><code className="text-[9px] sm:text-[11px] text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded">{log.model}</code></td>
                    <td className="px-3 sm:px-4 py-3 text-right text-[9px] sm:text-[11px] text-gray-500 hidden sm:table-cell truncate max-w-[80px]">{log.channel_name || '-'}</td>
                    <td className="px-3 sm:px-4 py-3 text-right text-[9px] sm:text-[11px] text-gray-800 font-medium">{log.total_tokens.toLocaleString()}</td>
                    <td className="px-3 sm:px-4 py-3 text-right text-[9px] sm:text-[11px] text-gray-500 hidden sm:table-cell tabular-nums">{log.latency_ms}</td>
                    <td className="px-2.5 sm:px-3 py-2.5 hidden md:table-cell">
                      <span className="text-[11px] text-gray-600 tabular-nums">
                        {log.cost ? `¥${log.cost.toFixed(6)}` : '-'}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-center hidden sm:table-cell">
                      {log.status === 'success' ? (
                        <StatusBadge variant="success" icon="check" label="成功" />
                      ) : (
                        <span className="cursor-help" title={log.error_message || ''}>
                          <StatusBadge variant="fail" icon="x" label="失败" />
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-center">
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ type: 'single', id: log.id });
                      }}
                        className="p-1.5 rounded text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="删除">
                        <InlineIcon name="trash2" className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                  {expandedLogId === log.id && (
                    <tr key={`detail-${log.id}`} className="bg-gray-50/50 border-b border-gray-100">
                      <td colSpan={10} className="px-4 sm:px-6 py-4">
                        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <DetailField label="时间" value={toBeijingFull(log.created_at)} />
                            <DetailField label="Key" value={log.relay_key_name} />
                            <DetailField label="渠道" value={log.channel_name || '-'} />
                            <DetailField label="模型" value={log.model} />
                            <DetailField label="费用" value={log.cost ? log.cost.toFixed(6) : '0'} />
                            <DetailField label="IP" value={log.ip || '-'} />
                          </div>
                          <div className="flex flex-wrap gap-4 text-[11px]">
                            <TokenBadge label="输入" value={log.prompt_tokens} />
                            <TokenBadge label="输出" value={log.completion_tokens} />
                            {log.cached_input_tokens > 0 && (
                              <TokenBadge label="缓存输入" value={log.cached_input_tokens} color="emerald" />
                            )}
                            <TokenBadge label="未缓存输入" value={Math.max(0, log.prompt_tokens - (log.cached_input_tokens || 0))} color="amber" />
                            <TokenBadge label="总 Token" value={log.total_tokens} color="indigo" />
                            <TokenBadge label="费用" value={log.cost || 0} color="purple" />
                            <TokenBadge label="延迟" value={`${log.latency_ms} ms`} color="bg-cyan-50 text-cyan-700 border-cyan-200" />
                          </div>
                          {log.status === 'fail' && log.error_message && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 mb-1">
                                <InlineIcon name="triangleAlert" className="w-3.5 h-3.5 text-red-500" />
                                <span className="text-[11px] font-medium text-red-600">错误信息</span>
                              </div>
                              <p className="text-[11px] text-red-600 break-all whitespace-pre-wrap leading-relaxed">{log.error_message}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-[9px] text-gray-400">
                            <InlineIcon name="clock" className="w-3 h-3" />
                            <span>日志 ID: {log.id}</span>
                            <span className="text-gray-200">|</span>
                            <span>{log.channel_name || '-'}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-white rounded-xl border border-gray-100 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-400">共 <b className="text-gray-600">{total}</b> 条记录</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => goToPage(page - 1)} disabled={page === 0}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <InlineIcon name="chevronLeft" className="w-3.5 h-3.5" />
            </button>
            {pageNumbers[0] > 0 && (
              <button onClick={() => goToPage(0)} className="px-2.5 py-1.5 rounded-lg text-[11px] text-gray-500 hover:bg-gray-50 border border-gray-200">1</button>
            )}
            {pageNumbers[0] > 1 && <span className="text-[11px] text-gray-300 px-1">...</span>}
            {pageNumbers.map(p => (
              <button key={p} onClick={() => goToPage(p)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${
                  p === page ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 border border-gray-200'
                }`}>{p + 1}</button>
            ))}
            {pageNumbers[pageNumbers.length - 1] < totalPages - 2 && <span className="text-[11px] text-gray-300 px-1">...</span>}
            {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
              <button onClick={() => goToPage(totalPages - 1)} className="px-2.5 py-1.5 rounded-lg text-[11px] text-gray-500 hover:bg-gray-50 border border-gray-200">{totalPages}</button>
            )}
            <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <InlineIcon name="chevronRight" className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1 ml-2 border-l border-gray-200 pl-3">
              <input type="number" value={pageInput} onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') goToPage(Number(pageInput) - 1); }}
                className="w-12 px-2 py-1 rounded border border-gray-200 text-[11px] text-gray-700 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              <button onClick={() => goToPage(Number(pageInput) - 1)}
                className="text-[11px] text-indigo-600 hover:text-indigo-700 font-medium">跳转</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[9px] text-gray-400 block">{label}</span>
      <span className="text-[11px] text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function TokenBadge({ label, value, color = 'gray' }: { label: string; value: number | string; color?: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  };
  const colorClass = colorMap[color] || color;
  const display = typeof value === 'number' ? value.toLocaleString() : value;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[9px] font-medium ${colorClass}`}>
      <span className="opacity-60">{label}:</span>
      <span>{display}</span>
    </span>
  );
}
