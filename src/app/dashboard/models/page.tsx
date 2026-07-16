'use client';

import { useEffect, useState, useCallback } from 'react';
import { InlineIcon } from '@/lib/icon';
import { apiFetch } from '@/lib/fetch-with-auth';

interface Channel {
  id: string; name: string; health_status: string; is_active: number;
}
interface ChannelModel {
  id: string; channel_id: string; model_id: string; is_active: number;
  channel_name?: string;
}
interface ModelAlias {
  id: string; alias_name: string; channel_model_id: string;
  is_active: number; model_id?: string; channel_name?: string;
}

const healthDot = (s: string) => {
  const m: Record<string, string> = { healthy: 'bg-emerald-400', unhealthy: 'bg-red-400', unknown: 'bg-gray-300' };
  return <span className={`inline-block w-2 h-2 rounded-full ${m[s] || m.unknown}`} />;
};

export default function ModelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelModels, setChannelModels] = useState<ChannelModel[]>([]);
  const [aliases, setAliases] = useState<ModelAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await apiFetch('/admin/channels?scope=models');
    if (res.ok) { const d = await res.json(); setChannels(d.channels); setChannelModels(d.channelModels || []); setAliases(d.aliases || []); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) return (<div className="flex items-center justify-center h-64"><InlineIcon name="loaderCircle" className="w-6 h-6 animate-spin text-indigo-600" /></div>);

  const displayItems: {
    type: 'alias' | 'model';
    displayName: string;
    actualModel: string;
    channelName: string;
    channelHealth: string;
    isActive: boolean;
  }[] = [];

  const modelIdsWithAlias = new Set<string>();
  aliases.filter(a => a.is_active).forEach(a => modelIdsWithAlias.add(a.channel_model_id));

  aliases.filter(a => a.is_active).forEach(a => {
    const cm = channelModels.find(m => m.id === a.channel_model_id);
    const ch = channels.find(c => c.id === (cm?.channel_id || ''));
    displayItems.push({
      type: 'alias',
      displayName: a.alias_name,
      actualModel: a.model_id || cm?.model_id || '?',
      channelName: a.channel_name || cm?.channel_name || ch?.name || '?',
      channelHealth: ch?.health_status || 'unknown',
      isActive: ch?.is_active !== 0,
    });
  });

  channelModels.filter(m => m.is_active && !modelIdsWithAlias.has(m.id)).forEach(m => {
    const ch = channels.find(c => c.id === m.channel_id);
    displayItems.push({
      type: 'model',
      displayName: m.model_id,
      actualModel: m.model_id,
      channelName: m.channel_name || ch?.name || '?',
      channelHealth: ch?.health_status || 'unknown',
      isActive: ch?.is_active !== 0,
    });
  });

  const activeChannels = channels.filter(c => c.is_active).length;
  const nativeModels = channelModels.filter(m => m.is_active).length;
  const aliasCount = aliases.filter(a => a.is_active).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">模型广场</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">所有可用模型一览，共 {displayItems.length} 个</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 bg-white rounded-xl border border-gray-100 px-4 py-3">
        <span className="flex items-center gap-1.5"><span className="font-semibold text-gray-900">{activeChannels}</span> 活跃渠道</span>
        <span className="text-gray-200">|</span>
        <span className="flex items-center gap-1.5"><span className="font-semibold text-gray-900">{nativeModels}</span> 原生模型</span>
        <span className="text-gray-200">|</span>
        <span className="flex items-center gap-1.5"><span className="font-semibold text-indigo-600">{aliasCount}</span> 别名映射</span>
      </div>

      {displayItems.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <InlineIcon name="bot" className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p>暂无可用模型</p>
          <p className="text-xs mt-1">先在渠道管理中添加渠道和模型</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayItems.map((item, i) => {
            const copyKey = `${item.type}-${item.displayName}-${i}`;
            return (
            <div key={copyKey}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-all hover:border-gray-200 group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <code className="text-sm font-semibold text-gray-900 font-mono truncate">{item.displayName}</code>
                    {item.type === 'alias' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0">别名</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 shrink-0">原生</span>
                    )}
                    {/* Copy button */}
                    <button onClick={() => copyToClipboard(item.displayName, copyKey)}
                      className="ml-auto p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all shrink-0" title="复制模型名">
                      {copied === copyKey
                        ? <InlineIcon name="check" className="w-3.5 h-3.5 text-emerald-500" />
                        : <InlineIcon name="copy" className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {item.type === 'alias' && (
                    <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
                      <span className="text-gray-300">实际请求: </span>{item.actualModel}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {healthDot(item.channelHealth)}
                    <span className="text-xs text-gray-500 truncate">{item.channelName}</span>
                    {!item.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">停用</span>}
                  </div>
                </div>
                <InlineIcon name={item.type === 'alias' ? 'arrowRight' : 'zap'} className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5" />
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
