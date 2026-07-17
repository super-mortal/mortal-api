'use client';

import { Fragment, useEffect, useState, useCallback } from 'react';
import { InlineIcon } from '@/lib/icon';
import { Modal } from '@/lib/modal';
import { toBeijingFull } from '@/lib/date';
import { apiFetch } from '@/lib/fetch-with-auth';

interface CallLog {
  id: string; relay_key_name: string; relay_key_id: string; model: string; channel_name: string;
  prompt_tokens: number; completion_tokens: number; cached_input_tokens: number; total_tokens: number;
  cost: number; status: string; error_message: string | null;
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
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showBatchDelete, setShowBatchDelete] = useState(false);
  const [deleteDateFrom, setDeleteDateFrom] = useState('');
  const [deleteDateTo, setDeleteDateTo] = useState('');
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const limit = 20;
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const toggleExpand = (id: string) => {
    setExpandedLogId(prev => prev === id ? null : id);
  };

  const fetchKeys = useCallback(async () => {
    const res = await apiFetch('/admin/keys');
    if (res.ok) setKeys((await res.json()).keys || []);
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (statusFilter) params.set('status', statusFilter);
    if (keyFilter) params.set('relay_key_id', keyFilter);
    if (modelFilter) params.set('model', modelFilter);
    if (startMonth) params.set('start_date', startMonth);
    if (endMonth) params.set('end_date', endMonth);
    const res = await fetch(`/admin/logs?${params}`, { headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } });
    if (res.ok) { const d = await res.json(); setLogs(d.logs); setTotal(d.total); }
    setLoading(false);
  }, [page, statusFilter, keyFilter, modelFilter, startMonth, endMonth]);

  useEffect(() => { fetchLogs(); fetchKeys(); }, [fetchLogs, fetchKeys]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此条日志？')) return;
    setDeleting(id);
    await fetch(`/admin/logs?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } });
    setDeleting(null); fetchLogs();
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

  const totalPages = Math.max(1, Math.ceil(total / limit));
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
              <input type="date" value={deleteDateFrom} onChange={(e) => setDeleteDateFrom(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">结束日期</label>
              <input type="date" value={deleteDateTo} onChange={(e) => setDeleteDateTo(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20" />
            </div>
          </div>
          <button onClick={handleBatchDeleteByDate} disabled={!deleteDateFrom}
            className="w-full py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            <InlineIcon name="trash2" className="w-4 h-4" /> 立即删除
          </button>
        </div>
      </Modal>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-3 py-1.5">
            <InlineIcon name="clock" className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input type="datetime-local" value={startMonth} onChange={function(e) { setStartMonth(e.target.value); setPage(0); }}
              className="text-xs border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-700" style={{width: '9rem'}} />
            <span className="text-gray-300 shrink-0">—</span>
            <input type="datetime-local" value={endMonth} onChange={function(e) { setEndMonth(e.target.value); setPage(0); }}
              className="text-xs border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-700" style={{width: '9rem'}} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="">全部状态</option>
              <option value="success">成功</option>
              <option value="fail">失败</option>
            </select>
            <select value={keyFilter} onChange={(e) => { setKeyFilter(e.target.value); setPage(0); }}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 max-w-[120px]">
              <option value="">全部 Key</option>
              {keys.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <input type="text" value={modelFilter} onChange={(e) => { setModelFilter(e.target.value); setPage(0); }}
              placeholder="模型名"
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-24" />
            {(startMonth || statusFilter || keyFilter || modelFilter) && (
              <button onClick={() => { setStartMonth(''); setEndMonth(''); setStatusFilter(''); setKeyFilter(''); setModelFilter(''); setPage(0); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 whitespace-nowrap">清除</button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-3 sm:px-4 py-3 font-medium text-gray-500 text-[10px] sm:text-xs">时间 (北京时间)</th>
                <th className="text-left px-3 sm:px-4 py-3 font-medium text-gray-500 text-[10px] sm:text-xs hidden sm:table-cell">Key</th>
                <th className="text-left px-3 sm:px-4 py-3 font-medium text-gray-500 text-[10px] sm:text-xs">模型</th>
                <th className="text-right px-3 sm:px-4 py-3 font-medium text-gray-500 text-[10px] sm:text-xs hidden sm:table-cell">渠道</th>
                <th className="text-right px-3 sm:px-4 py-3 font-medium text-gray-500 text-[10px] sm:text-xs">Token</th>
                <th className="text-center px-3 sm:px-4 py-3 font-medium text-gray-500 text-[10px] sm:text-xs hidden sm:table-cell">状态</th>
                <th className="text-center px-3 sm:px-4 py-3 font-medium text-gray-500 text-[10px] sm:text-xs w-10">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center"><InlineIcon name="loaderCircle" className="w-5 h-5 animate-spin text-indigo-600 inline" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-16 text-center">
                  <div className="text-gray-300 text-3xl mb-2"><InlineIcon name="list" className="w-8 h-8 mx-auto" /></div>
                  <p className="text-sm text-gray-400">暂无调用记录</p>
                </td></tr>
              ) : logs.map((log) => (
                <Fragment key={log.id}>
                  <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(log.id)}>
                    <td className="px-3 sm:px-4 py-3 text-[10px] sm:text-xs text-gray-500 whitespace-nowrap font-mono">{toBeijingFull(log.created_at)}</td>
                    <td className="px-3 sm:px-4 py-3 text-gray-700 text-[10px] sm:text-xs hidden sm:table-cell truncate max-w-[100px]">{log.relay_key_name}</td>
                    <td className="px-3 sm:px-4 py-3"><code className="text-[10px] sm:text-xs text-indigo-600 bg-indigo-50/80 px-1.5 py-0.5 rounded">{log.model}</code></td>
                    <td className="px-3 sm:px-4 py-3 text-right text-[10px] sm:text-xs text-gray-500 hidden sm:table-cell truncate max-w-[80px]">{log.channel_name || '-'}</td>
                    <td className="px-3 sm:px-4 py-3 text-right text-[10px] sm:text-xs text-gray-800 font-medium">{log.total_tokens.toLocaleString()}</td>
                    <td className="px-3 sm:px-4 py-3 text-center hidden sm:table-cell">
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50/80 text-emerald-600 border border-emerald-200/50">
                          <InlineIcon name="check" className="w-2.5 h-2.5 mr-0.5" />成功
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50/80 text-red-500 border border-red-200/50 cursor-help" title={log.error_message || ''}>
                          <InlineIcon name="x" className="w-2.5 h-2.5 mr-0.5" />失败
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-center">
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(log.id); }} disabled={deleting === log.id}
                        className="p-1.5 rounded text-red-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50" title="删除">
                        {deleting === log.id ? <InlineIcon name="loaderCircle" className="w-3.5 h-3.5 animate-spin" /> : <InlineIcon name="trash2" className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                  {expandedLogId === log.id && (
                    <tr key={`detail-${log.id}`} className="bg-gray-50/50 border-b border-gray-100">
                      <td colSpan={7} className="px-4 sm:px-6 py-4">
                        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <DetailField label="时间" value={toBeijingFull(log.created_at)} />
                            <DetailField label="Key" value={log.relay_key_name} />
                            <DetailField label="渠道" value={log.channel_name || '-'} />
                            <DetailField label="模型" value={log.model} />
                            <DetailField label="费用" value={log.cost ? log.cost.toFixed(6) : '0'} />
                            <DetailField label="IP" value={log.ip || '-'} />
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs">
                            <TokenBadge label="输入" value={log.prompt_tokens} />
                            <TokenBadge label="输出" value={log.completion_tokens} />
                            {log.cached_input_tokens > 0 && (
                              <TokenBadge label="缓存输入" value={log.cached_input_tokens} color="emerald" />
                            )}
                            <TokenBadge label="未缓存输入" value={Math.max(0, log.prompt_tokens - (log.cached_input_tokens || 0))} color="amber" />
                            <TokenBadge label="总 Token" value={log.total_tokens} color="indigo" />
                          </div>
                          {log.status === 'fail' && log.error_message && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 mb-1">
                                <InlineIcon name="triangleAlert" className="w-3.5 h-3.5 text-red-500" />
                                <span className="text-xs font-medium text-red-600">错误信息</span>
                              </div>
                              <p className="text-xs text-red-600 break-all whitespace-pre-wrap leading-relaxed">{log.error_message}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-[10px] text-gray-400">
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
          <span className="text-xs text-gray-400">共 <b className="text-gray-600">{total}</b> 条记录</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => goToPage(page - 1)} disabled={page === 0}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <InlineIcon name="chevronLeft" className="w-3.5 h-3.5" />
            </button>
            {pageNumbers[0] > 0 && (
              <button onClick={() => goToPage(0)} className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50 border border-gray-200">1</button>
            )}
            {pageNumbers[0] > 1 && <span className="text-xs text-gray-300 px-1">...</span>}
            {pageNumbers.map(p => (
              <button key={p} onClick={() => goToPage(p)}
                className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                  p === page ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 border border-gray-200'
                }`}>{p + 1}</button>
            ))}
            {pageNumbers[pageNumbers.length - 1] < totalPages - 2 && <span className="text-xs text-gray-300 px-1">...</span>}
            {pageNumbers[pageNumbers.length - 1] < totalPages - 1 && (
              <button onClick={() => goToPage(totalPages - 1)} className="px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50 border border-gray-200">{totalPages}</button>
            )}
            <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              <InlineIcon name="chevronRight" className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1 ml-2 border-l border-gray-200 pl-3">
              <input type="number" value={pageInput} onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') goToPage(Number(pageInput) - 1); }}
                className="w-12 px-2 py-1 rounded border border-gray-200 text-xs text-gray-700 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              <button onClick={() => goToPage(Number(pageInput) - 1)}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">跳转</button>
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
      <span className="text-[10px] text-gray-400 block">{label}</span>
      <span className="text-xs text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function TokenBadge({ label, value, color = 'gray' }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium ${colorMap[color] || colorMap.gray}`}>
      <span className="opacity-60">{label}:</span>
      <span>{value.toLocaleString()}</span>
    </span>
  );
}
