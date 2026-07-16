'use client';

import { useState } from 'react';
import { InlineIcon } from '@/lib/icon';
import { Modal } from '@/lib/modal';

export default function BackupPage() {
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [stats, setStats] = useState<{ keys?: number; channels?: number; logs?: number; aliases?: number } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleBackup = async () => {
    setBackingUp(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/admin/backup', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Backup failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mortal-api-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStats({
        keys: data.relay_keys?.length,
        channels: data.channels?.length,
        logs: data.call_logs?.length,
        aliases: data.model_aliases?.length,
      });
      showMsg('success', `备份完成！共 ${data.relay_keys?.length || 0} 个 Key、${data.channels?.length || 0} 个渠道`);
    } catch (e) {
      showMsg('error', `备份失败: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setMessage(null);
    try {
      const text = await restoreFile.text();
      const data = JSON.parse(text);
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Restore failed');
      }
      showMsg('success', '恢复完成！页面即将刷新...');
      setShowRestore(false);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      showMsg('error', `恢复失败: ${e instanceof Error ? e.message : 'Invalid file'}`);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">备份与恢复</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">一键备份和恢复所有数据</p>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${
          message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          <InlineIcon name={message.type === 'success' ? 'check' : 'circleX'} className="w-4 h-4 shrink-0" />
          {message.text}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Backup card */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
            <InlineIcon name="hard-drive" className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">导出备份</h3>
          <p className="text-xs sm:text-sm text-gray-500 mb-4">将所有数据（Key、渠道、日志、模型映射）导出为 JSON 文件</p>
          <button onClick={handleBackup} disabled={backingUp}
            className="px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors inline-flex items-center gap-2">
            {backingUp ? <InlineIcon name="loaderCircle" className="w-4 h-4 animate-spin" /> : <InlineIcon name="download" className="w-4 h-4" />}
            {backingUp ? '导出中...' : '立即备份'}
          </button>
          {stats && (
            <div className="mt-3 text-xs text-gray-400 flex gap-3">
              <span>🔑 {stats.keys} Key</span>
              <span>🔌 {stats.channels} 渠道</span>
              <span>📋 {stats.logs} 日志</span>
              <span>🔗 {stats.aliases} 别名</span>
            </div>
          )}
        </div>

        {/* Restore card */}
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 mb-4">
            <InlineIcon name="upload" className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">导入恢复</h3>
          <p className="text-xs sm:text-sm text-gray-500 mb-4">从备份文件恢复数据。当前所有数据将被替换。</p>
          <button onClick={() => setShowRestore(true)}
            className="px-4 py-2.5 rounded-lg border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-50 transition-colors inline-flex items-center gap-2">
            <InlineIcon name="upload" className="w-4 h-4" /> 恢复数据
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs sm:text-sm text-blue-700">
        <p className="font-medium mb-1">💡 备份说明</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-600">
          <li>备份文件包含所有 Key、渠道配置（API Key 已加密）、调用日志、模型别名</li>
          <li>恢复时会清空现有数据并用备份数据替换</li>
          <li>恢复后建议刷新页面并验证数据完整性</li>
          <li>数据库文件位于 <code className="text-blue-800 bg-blue-100/50 px-1 rounded">data/relay.db</code></li>
        </ul>
      </div>

      {/* Restore Modal */}
      <Modal open={showRestore} onClose={() => setShowRestore(false)} title="🔄 导入恢复数据">
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 flex items-center gap-2">
            <InlineIcon name="triangleAlert" className="w-4 h-4 shrink-0" />
            此操作将清空当前所有数据，不可撤销
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">选择备份文件 (.json)</label>
            <input type="file" accept=".json" onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 border border-gray-200 rounded-lg px-3 py-2" />
          </div>
          <button onClick={handleRestore} disabled={!restoreFile || restoring}
            className="w-full py-2.5 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            {restoring ? <InlineIcon name="loaderCircle" className="w-4 h-4 animate-spin" /> : <InlineIcon name="upload" className="w-4 h-4" />}
            {restoring ? '恢复中...' : '确认恢复'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
