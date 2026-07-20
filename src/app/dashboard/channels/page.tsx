'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { InlineIcon } from '@/lib/icon';
import { apiFetch } from '@/lib/fetch-with-auth';
import { Switch } from '@/lib/switch';
import { ConfirmDialog } from '@/lib/confirm-dialog';
import { Spinner, EmptyState } from '@/lib/ui';
import { HealthBadge, HealthBar } from '@/lib/health-badge';
import { Modal } from '@/lib/modal';

interface Channel {
  id: string; name: string; base_url: string; api_key: string;
  priority: number; notes: string; is_active: number;
  health_status: string; last_health_check: string | null;
  cooldown_until?: string | null;
  recent_checks?: Array<{ checked_at: string; ok: number; kind: string | null; latency_ms: number; error?: string | null }>;
  uptime_pct?: number;
  avg_latency_ms?: number;
}
interface ChannelModel {
  id: string; channel_id: string; model_id: string; is_active: number;
}
interface ModelAlias {
  id: string; alias_name: string; channel_model_id: string;
  is_active: number; model_id?: string; channel_name?: string;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelModels, setChannelModels] = useState<ChannelModel[]>([]);
  const [aliases, setAliases] = useState<ModelAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkModal, setCheckModal] = useState(false);
  const [checkChannel, setCheckChannel] = useState<Channel | null>(null);
  const [checkSelectedModel, setCheckSelectedModel] = useState('');
  const [checkRunning, setCheckRunning] = useState(false);
  const [checkDone, setCheckDone] = useState<'ok' | 'fail' | null>(null);
  const [checkLatency, setCheckLatency] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [pullingId, setPullingId] = useState<string | null>(null);
  const [pulledModels, setPulledModels] = useState<Record<string, string[]>>({});

  // Side panel state
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [chForm, setChForm] = useState({ name: '', base_url: '', api_key: '', priority: 0, notes: '' });
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [modelChannelId, setModelChannelId] = useState('');
  const [newModelId, setNewModelId] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);
  const [modelErrModal, setModelErrModal] = useState(false);
  const [pricingMap, setPricingMap] = useState<Record<string, { prompt_price: number; completion_price: number; cached_prompt_price: number }>>({});

  const fetchAll = useCallback(async () => {
    const res = await apiFetch('/admin/channels?scope=models');
    if (res.ok) { const d = await res.json(); setChannels(d.channels); setChannelModels(d.channelModels || []); setAliases(d.aliases || []); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    apiFetch('/admin/pricing').then(r => r.ok && r.json()).then(d => {
      if (d?.pricing) {
        const map: Record<string, any> = {};
        d.pricing.forEach((p: any) => { map[p.model_id] = p; });
        setPricingMap(map);
      }
    });
  }, [fetchAll]);

  const modelsForChannel = (chId: string) => channelModels.filter(m => m.channel_id === chId);
  const aliasesForModel = (cmId: string) => aliases.filter(a => a.channel_model_id === cmId);

  const saveChannel = async () => {
    const isEdit = !!editId;
    const body: Record<string, any> = isEdit ? { id: editId, ...chForm } : chForm;
    if (isEdit && !body.api_key) delete body.api_key;
    const res = await apiFetch('/admin/channels', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    if (res.ok) { setSidePanelOpen(false); fetchAll(); }
  };

  const handleDeleteChannel = async () => {
    if (!deleteConfirm) return;
    await apiFetch(`/admin/channels?id=${deleteConfirm.id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    fetchAll();
  };
  const deleteChannel = async (id: string) => {
    setDeleteConfirm({ id });
  };
  const toggleChannel = async (id: string, active: number) => {
    await apiFetch('/admin/channels', { method: 'PATCH', body: JSON.stringify({ id, is_active: active ? 0 : 1 }) });
    fetchAll();
  };
  const doHealthCheck = async () => {
    if (!checkChannel || !checkSelectedModel) return;
    setCheckRunning(true);
    setCheckDone(null);
    setCheckLatency(null);
    try {
      const res = await apiFetch('/admin/channels', { method: 'PUT', body: JSON.stringify({ id: checkChannel.id, model_id: checkSelectedModel, _action: 'check-model' }) });
      const data = await res.json();
      setCheckDone(data.healthy ? 'ok' : 'fail');
      setCheckLatency(data.latency || null);
      setCheckError(data.healthy ? null : (data.error || null));
    } catch { setCheckDone('fail'); setCheckError('请求异常'); }
    setCheckRunning(false);
  };
  const openCheckModal = (ch: Channel) => {
    setCheckChannel(ch);
    const models = modelsForChannel(ch.id);
    setCheckSelectedModel(models.length > 0 ? models[0].model_id : '');
    setCheckDone(null);
    setCheckLatency(null);
    setCheckError(null);
    setCheckModal(true);
  };
  const doPullModels = async (id: string) => {
    setPullingId(id);
    try {
      var res = await apiFetch('/admin/channels', { method: 'PUT', body: JSON.stringify({ id, _action: 'pull-models' }) });
      if (res.ok) {
        var d = await res.json();
        var models = d.models || [];
        if (models.length === 0) { alert('上游返回了空模型列表，请检查 API Key 和 URL'); }
        else { setPulledModels(function(p) { var o: Record<string, string[]> = {}; o[id] = models; return Object.assign({}, p, o); }); }
      } else {
        var text = await res.text();
        alert('拉取失败 (HTTP ' + res.status + '):\n' + (text || '').slice(0, 300));
      }
    } catch (e) {
      alert('拉取异常: ' + String(e instanceof Error ? e.message : e).slice(0, 300));
    }
    setPullingId(null);
  };

  const addModel = async () => {
    if (!newModelId) return;
    const res = await apiFetch('/admin/channels', { method: 'POST', body: JSON.stringify({ _type: 'channel-model', channel_id: modelChannelId, model_id: newModelId }) });
    if (res.ok) { setNewModelId(''); fetchAll(); } else { setModelErrModal(true); }
  };
  const deleteModel = async (id: string) => {
    await apiFetch(`/admin/channels?id=${id}&type=channel-model`, { method: 'DELETE' });
    fetchAll();
  };

  const openSidePanel = (ch?: Channel) => {
    if (ch) {
      setChForm({ name: ch.name, base_url: ch.base_url, api_key: '', priority: ch.priority, notes: ch.notes });
      setEditId(ch.id);
      setModelChannelId(ch.id);
    } else {
      setChForm({ name: '', base_url: '', api_key: '', priority: 0, notes: '' });
      setEditId(null);
      setModelChannelId('');
    }
    setExpandedModelId(null);
    setNewModelId('');
    setSidePanelOpen(true);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg sm:text-xl font-semibold text-gray-900">渠道管理</h1><p className="text-xs sm:text-sm text-gray-500 mt-0.5">管理上游 API 提供商</p></div>
        <button onClick={() => openSidePanel()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors">
          <InlineIcon name="plus" className="w-4 h-4" /> 新建渠道</button>
      </div>

      {/* Health Check Modal */}
      <Modal open={checkModal} onClose={() => { setCheckModal(false); setCheckDone(null); setCheckLatency(null); setCheckError(null); }} title={`连通性检测 - ${checkChannel?.name || ''}`}>
        <div className="space-y-4">
          <p className="text-xs text-gray-500">选择要检测的模型，测试能否正常调用。</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">选择模型</label>
            <select value={checkSelectedModel} onChange={function(e) { setCheckSelectedModel(e.target.value); setCheckDone(null); setCheckLatency(null); setCheckError(null); }}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white font-mono">
              {modelsForChannel(checkChannel?.id || '').map(m => (
                <option key={m.id} value={m.model_id}>{m.model_id}</option>
              ))}
            </select>
          </div>
          {checkDone && (
            <div className={'px-4 py-3 rounded-lg text-sm ' + (checkDone === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200')}>
              <div className="flex items-center gap-2">
                <InlineIcon name={checkDone === 'ok' ? 'check' : 'x'} className="w-4 h-4 shrink-0" />
                <span>{checkDone === 'ok' ? '连接正常' : '连接异常'}</span>
                {checkLatency && <span className="text-xs opacity-75 ml-auto font-mono">{checkLatency}</span>}
              </div>
              {checkDone === 'fail' && checkError && (
                <p className="mt-1.5 text-xs break-all whitespace-pre-wrap leading-relaxed opacity-90">{checkError}</p>
              )}
            </div>
          )}
          <button onClick={doHealthCheck} disabled={checkRunning || !checkSelectedModel}
            className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
            {checkRunning ? <><InlineIcon name="loaderCircle" className="w-4 h-4 animate-spin" /> 检测中...</> : '开始检测'}
          </button>
        </div>
      </Modal>

      {/* Channel Cards */}
      {channels.map(ch => {
        const models = modelsForChannel(ch.id);
        return (
          <div key={ch.id} className="bg-white rounded-xl border border-gray-100 hover:shadow-sm transition-shadow">
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{ch.name}</h3>
                    <HealthBadge health_status={ch.health_status} is_active={ch.is_active} cooldown_until={ch.cooldown_until} />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-0.5">
                    <code className="text-gray-400 font-mono text-[10px]">{ch.base_url}</code>
                    {ch.notes && <span>· {ch.notes}</span>}
                    <span>· 优先 {ch.priority}</span>
                    <span>· 模型: {models.length} 个</span>
                  </div>
                </div>
                  <div className="mt-2 md:mt-0 md:mx-3 md:flex-1 hidden md:block">
                    <HealthBar recent_checks={ch.recent_checks || []} uptime_pct={ch.uptime_pct ?? 100} avg_latency_ms={ch.avg_latency_ms ?? 0} />
                  </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="group relative">
                    <button onClick={() => openSidePanel(ch)}
                      className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-200"><InlineIcon name="settings" className="w-4 h-4" /></button>
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">配置</span>
                  </span>
                  <span className="group relative">
                    <button onClick={() => openCheckModal(ch)}
                      className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all border border-transparent hover:border-emerald-200"><InlineIcon name="activity" className="w-4 h-4" /></button>
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">连通检测</span>
                  </span>
                  <Switch
                    checked={!!ch.is_active}
                    onChange={() => toggleChannel(ch.id, ch.is_active)}
                  />
                  <span className="group relative">
                    <button onClick={() => deleteChannel(ch.id)} className="p-2 rounded-lg text-red-300 hover:text-red-500 hover:bg-red-50 transition-all border border-transparent hover:border-red-200"><InlineIcon name="trash2" className="w-4 h-4" /></button>
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">删除</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {channels.length === 0 && (
        <div className="py-16"><EmptyState icon="plug" text="暂无渠道" iconClassName="w-10 h-10 mx-auto mb-3 text-gray-200" /></div>
      )}

      {/* Side Panel */}
      {sidePanelOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSidePanelOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-1/3 min-w-[380px] max-w-[520px] bg-white shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{editId ? '编辑渠道' : '新建渠道'}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{chForm.name || '未命名'}</p>
              </div>
              <button onClick={() => setSidePanelOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <InlineIcon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* 基本信息 */}
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
                  <InlineIcon name="fileText" className="w-3.5 h-3.5" /> 基本信息
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">名称</label>
                    <input value={chForm.name} onChange={e => setChForm({...chForm, name: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="DeepSeek 官方" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">优先级</label>
                    <input type="number" value={chForm.priority} onChange={e => setChForm({...chForm, priority: Number(e.target.value)})}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                  <input value={chForm.base_url} onChange={e => setChForm({...chForm, base_url: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder="https://api.deepseek.com" />
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">API Key <span className="text-gray-400">（加密存储）</span></label>
                  <input type="password" value={chForm.api_key} onChange={e => setChForm({...chForm, api_key: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder={editId ? '留空保持不变' : 'sk-...'} />
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">备注</label>
                  <input value={chForm.notes} onChange={e => setChForm({...chForm, notes: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="如 DeepSeek" />
                </div>
              </div>

              {/* 模型与别名 — only show for edit mode */}
              {editId && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                      <InlineIcon name="bot" className="w-3.5 h-3.5" /> 模型与别名
                    </h4>
                    <div className="flex gap-2">
                      <button onClick={() => doPullModels(editId)} disabled={pullingId === editId}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors">
                        {pullingId === editId ? <InlineIcon name="loaderCircle" className="w-3.5 h-3.5 animate-spin" /> : <InlineIcon name="server" className="w-3.5 h-3.5" />} 拉取</button>
                      <button onClick={() => { setNewModelId(''); }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 inline-flex items-center gap-1.5 transition-colors"
                      ><InlineIcon name="plus" className="w-3.5 h-3.5" /> 添加</button>
                    </div>
                  </div>

                  {/* Model cards */}
                  {modelsForChannel(editId).map(m => {
                    const als = aliasesForModel(m.id);
                    const alias = als.length > 0 ? als[0] : null;
                    const isExpanded = expandedModelId === m.id;

                    return (
                      <div key={m.id} className="border border-gray-200 rounded-xl overflow-hidden mb-2">
                        {/* Collapsed header */}
                        <div
                          className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => setExpandedModelId(isExpanded ? null : m.id)}
                        >
                          <code className="text-sm font-semibold text-gray-800 font-mono truncate">{m.model_id}</code>
                          <span className="text-gray-300 text-xs shrink-0">──→</span>
                          {alias ? (
                            <code className="text-sm font-semibold text-amber-700 font-mono truncate">{alias.alias_name}</code>
                          ) : (
                            <span className="text-xs text-gray-400 italic truncate">未设置别名</span>
                          )}
                          <span className="ml-auto flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pricingMap[m.model_id] ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
                              {pricingMap[m.model_id] ? '¥' : '未定价'}
                            </span>
                            <InlineIcon name={isExpanded ? 'chevronUp' : 'chevronDown'} className="w-3.5 h-3.5 text-gray-400" />
                          </span>
                        </div>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-4 space-y-4">
                            {/* Alias editor */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1.5">别名映射</label>
                              <div className="flex items-center gap-2">
                                <code className="text-xs text-gray-500 bg-white border border-gray-200 rounded px-2 py-1.5 font-mono">{m.model_id}</code>
                                <span className="text-gray-300">→</span>
                                <input
                                  defaultValue={alias?.alias_name || ''}
                                  placeholder="输入别名..."
                                  id={`alias-input-${m.id}`}
                                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                                />
                                <button
                                  onClick={async () => {
                                    const input = document.getElementById(`alias-input-${m.id}`) as HTMLInputElement;
                                    const name = input?.value?.trim();
                                    if (!name) return;
                                    if (alias) {
                                      await apiFetch(`/admin/channels?id=${alias.id}&type=alias`, { method: 'DELETE' });
                                    }
                                    await apiFetch('/admin/channels', {
                                      method: 'POST',
                                      body: JSON.stringify({ _type: 'alias', alias_name: name, channel_model_id: m.id }),
                                    });
                                    fetchAll();
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
                                >
                                  {alias ? '更新' : '创建'}
                                </button>
                              </div>
                              {alias && (
                                <button
                                  onClick={async () => { await apiFetch(`/admin/channels?id=${alias.id}&type=alias`, { method: 'DELETE' }); fetchAll(); }}
                                  className="mt-1 text-[10px] text-red-400 hover:text-red-600"
                                >
                                  删除别名
                                </button>
                              )}
                            </div>

                            {/* Pricing editor */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1.5">价格（元/1M tokens）</label>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <div className="text-[10px] text-gray-400 mb-0.5">标准输入</div>
                                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                                    <input type="number" step="0.001"
                                      defaultValue={pricingMap[m.model_id]?.prompt_price ?? ''}
                                      id={`price-prompt-${m.id}`}
                                      className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0" />
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-400 mb-0.5">输出</div>
                                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                                    <input type="number" step="0.001"
                                      defaultValue={pricingMap[m.model_id]?.completion_price ?? ''}
                                      id={`price-completion-${m.id}`}
                                      className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0" />
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-400 mb-0.5">缓存输入</div>
                                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                                    <input type="number" step="0.001"
                                      defaultValue={pricingMap[m.model_id]?.cached_prompt_price ?? ''}
                                      id={`price-cached-${m.id}`}
                                      className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0" />
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={async () => {
                                  const getVal = (id: string) => Number((document.getElementById(id) as HTMLInputElement)?.value || 0);
                                  await apiFetch('/admin/pricing', {
                                    method: 'POST',
                                    body: JSON.stringify({
                                      model_id: m.model_id,
                                      prompt_price: getVal(`price-prompt-${m.id}`),
                                      completion_price: getVal(`price-completion-${m.id}`),
                                      cached_prompt_price: getVal(`price-cached-${m.id}`),
                                    }),
                                  });
                                  fetchAll();
                                }}
                                className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors"
                              >
                                保存价格
                              </button>
                            </div>

                            {/* Delete model */}
                            <button onClick={() => deleteModel(m.id)}
                              className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                              <InlineIcon name="trash2" className="w-3 h-3" /> 删除此模型
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Pulled models */}
                  {pulledModels[editId]?.length > 0 && (
                    <details className="text-sm text-gray-500 mt-2" open>
                      <summary className="cursor-pointer hover:text-gray-700 font-medium text-xs">上游可用模型（{pulledModels[editId].length} 个）</summary>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {pulledModels[editId].map(m => {
                          const exists = modelsForChannel(editId).some(mod => mod.model_id === m);
                          return exists ? (
                            <span key={m} className="text-xs bg-gray-200 text-gray-500 px-2.5 py-1 rounded-lg cursor-default">{m} ✓</span>
                          ) : (
                            <button key={m} onClick={() => {
                              apiFetch('/admin/channels', { method: 'POST', body: JSON.stringify({ _type: 'channel-model', channel_id: editId, model_id: m }) }).then(() => fetchAll());
                            }}
                              className="text-xs bg-white border border-gray-200 px-2.5 py-1 rounded-lg hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all">{m}</button>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 border-t border-gray-100 bg-white">
              <div className="flex gap-3">
                <button onClick={saveChannel}
                  className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
                  {editId ? '💾 保存' : '创建'}
                </button>
                <button onClick={() => setSidePanelOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteChannel}
        title="确认删除"
        message="确定删除此渠道？关联的模型和别名也会被删除。此操作不可撤销。"
        confirmText="确认删除"
        variant="danger"
      />
      <ConfirmDialog
        open={modelErrModal}
        onClose={() => setModelErrModal(false)}
        onConfirm={() => setModelErrModal(false)}
        title="提示"
        message="模型已存在或创建失败。"
        confirmText="知道了"
        variant="info"
      />
    </div>
  );
}
