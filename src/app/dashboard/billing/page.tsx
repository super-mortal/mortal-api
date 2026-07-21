'use client';

import { useEffect, useState, useCallback } from 'react';
import { InlineIcon } from '@/lib/icon';
import { apiFetch } from '@/lib/fetch-with-auth';
import { SelectFilter } from '@/lib/select-filter';
import { DatePicker } from '@/lib/date-picker';

interface RelayKey { id: string; name: string; }
type ExportFormat = 'csv' | 'xlsx' | 'pdf';

interface ExportRecord {
  time: string;
  keyName: string;
  format: ExportFormat;
  period: string;
}

function todayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FORMAT_OPTS: { label: string; value: ExportFormat }[] = [
  { label: 'CSV (.zip)', value: 'csv' },
  { label: 'Excel (.xlsx)', value: 'xlsx' },
  { label: 'PDF', value: 'pdf' },
];

export default function BillingPage() {
  const [keys, setKeys] = useState<RelayKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [exporting, setExporting] = useState(false);
  const [history, setHistory] = useState<ExportRecord[]>([]);
  const [activePreset, setActivePreset] = useState('today');

  useEffect(() => {
    apiFetch('/admin/keys').then(res => {
      if (res.ok) res.json().then(d => setKeys(d.keys || []));
    });
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('billing_export_history');
      if (saved) setHistory(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const saveHistory = useCallback((rec: ExportRecord) => {
    const updated = [rec, ...history].slice(0, 5);
    setHistory(updated);
    try { localStorage.setItem('billing_export_history', JSON.stringify(updated)); } catch { /* ignore */ }
  }, [history]);

  const handlePreset = (preset: 'today' | '7d' | '30d') => {
    setActivePreset(preset);
    const now = new Date();
    if (preset === 'today') {
      setStartDate(fmtDate(now));
      setEndDate(fmtDate(now));
    } else if (preset === '7d') {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      setStartDate(fmtDate(past));
      setEndDate(fmtDate(now));
    } else {
      const past = new Date(now);
      past.setDate(past.getDate() - 29);
      setStartDate(fmtDate(past));
      setEndDate(fmtDate(now));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiFetch('/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relay_key_id: selectedKeyId,
          start_date: startDate + ' 00:00:00',
          end_date: endDate + ' 23:59:59',
          format,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '导出失败' }));
        alert(err.error || '导出失败');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') || '';
      a.download = disposition.match(/filename="(.+)"/)?.[1] || `billing-export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const keyName = keys.find(k => k.id === selectedKeyId)?.name || '全部 Key';
      saveHistory({
        time: new Date().toLocaleString('zh-CN'),
        keyName,
        format,
        period: `${startDate} ~ ${endDate}`,
      });
    } catch (e) {
      alert('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">账单导出</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">按密钥和时间范围导出使用明细与汇总账单</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm space-y-4">
        {/* Key filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-medium text-gray-600 w-20 shrink-0">密钥筛选</label>
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

        {/* Date range */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-medium text-gray-600 w-20 shrink-0">时间范围</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
              {(['today', '7d', '30d'] as const).map(p => (
                <button key={p} onClick={() => handlePreset(p)}
                  className={'px-3 py-1.5 rounded-md text-xs font-medium transition-all ' + (
                    activePreset === p
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  )}>
                  {p === 'today' ? '今日' : p === '7d' ? '7 天' : '30 天'}
                </button>
              ))}
            </div>
            <button onClick={() => setActivePreset('custom')}
              className={'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ' + (
                activePreset === 'custom'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              )}>
              <InlineIcon name="calendar" className="w-3 h-3 inline mr-1" />自定义
            </button>
          </div>
        </div>

        {activePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 ml-0 sm:ml-20">
            <DatePicker value={startDate} onChange={v => setStartDate(v)} />
            <span className="text-gray-300">—</span>
            <DatePicker value={endDate} onChange={v => setEndDate(v)} />
          </div>
        )}

        {/* Format selection */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-medium text-gray-600 w-20 shrink-0">导出格式</label>
          <div className="flex items-center gap-2">
            {FORMAT_OPTS.map(opt => (
              <button key={opt.value} onClick={() => setFormat(opt.value)}
                className={'px-4 py-2 rounded-lg border text-xs sm:text-sm font-medium transition-all flex items-center gap-2 ' + (
                  format === opt.value
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                )}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Export button */}
        <div className="flex justify-end pt-2">
          <button onClick={handleExport} disabled={exporting}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
            {exporting ? (
              <InlineIcon name="loaderCircle" className="w-4 h-4 animate-spin" />
            ) : (
              <InlineIcon name="download" className="w-4 h-4" />
            )}
            {exporting ? '正在导出...' : '导出账单'}
          </button>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">最近导出记录</h3>
          <div className="space-y-2">
            {history.map((rec, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-xs">
                <div className="flex items-center gap-3 text-gray-600">
                  <span className="text-gray-400">{rec.time}</span>
                  <span className="font-medium text-gray-800">{rec.keyName}</span>
                  <span className="text-gray-400">{rec.period}</span>
                </div>
                <span className="text-xs font-medium uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  {rec.format}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
