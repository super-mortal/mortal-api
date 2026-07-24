'use client';

import { useEffect, useState, useCallback } from 'react';
import { InlineIcon } from '@/lib/icon';
import { apiFetch } from '@/lib/fetch-with-auth';
import { Spinner } from '@/lib/ui';
import { SelectFilter } from '@/lib/select-filter';
import { Popover } from '@/lib/popover';

interface Channel {
  id: string; name: string; health_status: string; is_active: number; uptime_pct?: number;
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
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

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

  if (loading) return (<div className="flex items-center justify-center h-64"><Spinner /></div>);

  // 构建模型分组: displayName → { channels, type, ... }
  const modelGroups = new Map<string, {
    displayName: string;
    type: 'alias' | 'model';
    actualModel: string;
    channels: Array<{ name: string; health: string; uptimePct: number; isActive: boolean }>;
  }>();

  // 收集有别名的模型
  const modelIdsWithAlias = new Set<string>();
  aliases.filter(a => a.is_active).forEach(a => modelIdsWithAlias.add(a.channel_model_id));

  // 处理别名
  aliases.filter(a => a.is_active).forEach(a => {
    const cm = channelModels.find(m => m.id === a.channel_model_id);
    const ch = channels.find(c => c.id === (cm?.channel_id || ''));
    const key = a.alias_name;
    if (!modelGroups.has(key)) {
      modelGroups.set(key, {
        displayName: key,
        type: 'alias',
        actualModel: a.model_id || cm?.model_id || '?',
        channels: [],
      });
    }
    modelGroups.get(key)!.channels.push({
      name: a.channel_name || cm?.channel_name || ch?.name || '?',
      health: ch?.health_status || 'unknown',
      uptimePct: ch?.uptime_pct ?? 0,
      isActive: ch?.is_active !== 0,
    });
  });

  // 处理原生模型（排除已有别名的）
  channelModels.filter(m => m.is_active && !modelIdsWithAlias.has(m.id)).forEach(m => {
    const ch = channels.find(c => c.id === m.channel_id);
    const key = m.model_id;
    if (!modelGroups.has(key)) {
      modelGroups.set(key, {
        displayName: key,
        type: 'model',
        actualModel: key,
        channels: [],
      });
    }
    modelGroups.get(key)!.channels.push({
      name: m.channel_name || ch?.name || '?',
      health: ch?.health_status || 'unknown',
      uptimePct: ch?.uptime_pct ?? 0,
      isActive: ch?.is_active !== 0,
    });
  });

  // 排序每个分组的渠道（uptimePct 降序）
  for (const group of modelGroups.values()) {
    group.channels.sort((a, b) => b.uptimePct - a.uptimePct);
  }

  // 转为数组，保持排序
  const displayGroups = [...modelGroups.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));

  const activeChannels = channels.filter(c => c.is_active).length;
  const nativeGroupCount = displayGroups.filter(g => g.type === 'model').length;
  const aliasGroupCount = displayGroups.filter(g => g.type === 'alias').length;

  const filteredGroups = displayGroups.filter(group => {
    if (filterChannel !== 'all') {
      // 分组中至少有一个渠道匹配筛选
      if (!group.channels.some(c => c.name === filterChannel)) return false;
    }
    if (filterStatus === 'healthy') {
      if (!group.channels.some(c => c.health === 'healthy' && c.isActive)) return false;
    }
    if (filterStatus === 'unhealthy') {
      if (!group.channels.some(c => c.health === 'unhealthy')) return false;
    }
    if (filterStatus === 'cooling_down') {
      if (!group.channels.some(c => c.health === 'cooling_down')) return false;
    }
    if (filterStatus === 'unknown') {
      if (!group.channels.some(c => c.health === 'unknown')) return false;
    }
    if (filterStatus === '停用') {
      if (!group.channels.some(c => !c.isActive)) return false;
    }
    if (filterType === '原生' && group.type !== 'model') return false;
    if (filterType === '别名' && group.type !== 'alias') return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-gray-900">模型广场</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">所有可用模型一览，共 {filteredGroups.length} 个</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 bg-white rounded-xl border border-gray-100 px-4 py-3">
        <span className="flex items-center gap-1.5"><span className="font-semibold text-gray-900">{activeChannels}</span> 活跃渠道</span>
        <span className="text-gray-200">|</span>
        <span className="flex items-center gap-1.5"><span className="font-semibold text-gray-900">{nativeGroupCount}</span> 原生模型</span>
        <span className="text-gray-200">|</span>
        <span className="flex items-center gap-1.5"><span className="font-semibold text-indigo-600">{aliasGroupCount}</span> 别名映射</span>

        {/* 右侧筛选 */}
        <div className="flex items-center gap-2 ml-auto">
          <SelectFilter
            options={[
              { label: '全部渠道', value: 'all' },
              ...channels.filter(c => c.is_active).map(c => ({ label: c.name, value: c.name })),
            ]}
            value={filterChannel}
            onChange={setFilterChannel}
            placeholder="全部渠道"
          />
          <SelectFilter
            options={[
              { label: '全部状态', value: 'all' },
              { label: '正常', value: 'healthy', color: 'green' },
              { label: '异常', value: 'unhealthy', color: 'red' },
              { label: '额度冷却', value: 'cooling_down', color: 'amber' },
              { label: '未检测', value: 'unknown', color: 'gray' },
              { label: '停用', value: '停用', color: 'gray' },
            ]}
            value={filterStatus}
            onChange={setFilterStatus}
            placeholder="全部状态"
          />
          <SelectFilter
            options={[
              { label: '全部类型', value: 'all' },
              { label: '原生模型', value: '原生' },
              { label: '别名映射', value: '别名' },
            ]}
            value={filterType}
            onChange={setFilterType}
            placeholder="全部类型"
          />
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <InlineIcon name="bot" className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p>暂无可用模型</p>
          <p className="text-xs mt-1">先在渠道管理中添加渠道和模型，或调整筛选条件</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredGroups.map((group, i) => {
            const bestChannel = group.channels[0]; // uptimePct 最高
            const copyKey = `group-${group.displayName}-${i}`;
            return (
            <div key={copyKey}
              className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm transition-all hover:border-gray-200 group">
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0">
                    <code className="text-sm font-semibold text-gray-900 font-mono truncate">{group.displayName}</code>
                    {group.type === 'alias' ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0">别名</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 shrink-0">原生</span>
                    )}
                    <button onClick={() => copyToClipboard(group.displayName, copyKey)}
                      className="ml-auto p-0.5 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all" title="复制模型名">
                      {copied === copyKey
                        ? <InlineIcon name="check" className="w-3.5 h-3.5 text-emerald-500" />
                        : <InlineIcon name="copy" className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {group.type === 'alias' && (
                    <div className="text-[10px] text-gray-400 mt-0 font-mono leading-tight">
                      <span className="text-gray-300">实际请求: </span>{group.actualModel}
                    </div>
                  )}
                  {/* 主渠道显示（uptime 最高的那个） */}
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {healthDot(bestChannel.health)}
                    <span className="text-xs text-gray-500 truncate">{bestChannel.name}</span>
                    {!bestChannel.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">停用</span>}
                    <span className="text-[10px] text-gray-400">{bestChannel.uptimePct}% 可用率</span>
                  </div>
                </div>
                {/* 箭头 — 放在外层，和复制按钮同行 */}
                {group.channels.length > 1 ? (
                  <Popover side="left" trigger={
                    <span className="p-0.5 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0">
                      <InlineIcon name="arrowLeft" className="w-3.5 h-3.5" />
                    </span>
                  }>
                    <div className="space-y-1 min-w-[160px]">
                      <p className="text-[10px] text-gray-400 font-medium mb-1.5">该模型可用渠道</p>
                      {group.channels.map(ch => (
                        <div key={ch.name} className="flex items-center gap-1.5">
                          {healthDot(ch.health)}
                          <span className="text-xs text-gray-700">{ch.name}</span>
                          <span className="text-[10px] text-gray-400 ml-auto">{ch.uptimePct}%</span>
                        </div>
                      ))}
                    </div>
                  </Popover>
                ) : (
                  <span className="p-0.5 rounded text-gray-300 shrink-0">
                    <InlineIcon name={group.type === 'alias' ? 'arrowLeft' : 'zap'} className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
