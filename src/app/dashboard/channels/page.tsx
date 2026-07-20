'use client';

import { useEffect, useState, useCallback } from 'react';
import { InlineIcon } from '@/lib/icon';
import { Modal } from '@/lib/modal';
import { ComboBox } from '@/lib/combobox';
import { apiFetch } from '@/lib/fetch-with-auth';
import { Switch } from '@/lib/switch';
import { ConfirmDialog } from '@/lib/confirm-dialog';
import { Spinner, EmptyState } from '@/lib/ui';

interface Channel {
  id: string; name: string; base_url: string; api_key: string;
  priority: number; notes: string; is_active: number;
  health_status: string; last_health_check: string | null;
}
interface ChannelModel {
  id: string; channel_id: string; model_id: string; is_active: number;
}
interface ModelAlias {
  id: string; alias_name: string; channel_model_id: string;
  is_active: number; model_id?: string; channel_name?: string;
}

const healthBadge = (s: string) => {
  const m: Record<string, { s: string; l: string }> = {
    healthy: { s: 'bg-emerald-50 text-emerald-600', l: '正常' },
    unhealthy: { s: 'bg-red-50 text-red-500', l: '异常' },
    unknown: { s: 'bg-gray-100 text-gray-500', l: '未知' },
  };
  const r = m[s] || m.unknown;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${r.s}`}>{r.l}</span>;
};

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pullingId, setPullingId] = useState<string | null>(null);
  const [pulledModels, setPulledModels] = useState<Record<string, string[]>>({});

  // Channel form modal
  const [chModal, setChModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [chForm, setChForm] = useState({ name: '', base_url: '', api_key: '', priority: 0, notes: '' });

  // Add model modal (used in expanded section)
  const [modelModal, setModelModal] = useState(false);
  const [modelChannelId, setModelChannelId] = useState('');
  const [newModelId, setNewModelId] = useState('');

  // Alias modal
  const [aliasModal, setAliasModal] = useState(false);
  const [aliasChannelModelId, setAliasChannelModelId] = useState('');
  const [aliasName, setAliasName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);
  const [modelErrModal, setModelErrModal] = useState(false);

  const fetchAll = useCallback(async () => {
    const res = await apiFetch('/admin/channels?scope=models');
    if (res.ok) { const d = await res.json(); setChannels(d.channels); setChannelModels(d.channelModels || []); setAliases(d.aliases || []); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const modelsForChannel = (chId: string) => channelModels.filter(m => m.channel_id === chId);
  const aliasesForModel = (cmId: string) => aliases.filter(a => a.channel_model_id === cmId);

  const allKnownModelOptions = () => {
    const all = new Set<string>();
    channelModels.forEach(m => all.add(m.model_id));
    Object.values(pulledModels).flat().forEach(m => all.add(m));
    return Array.from(all).sort().map(m => ({ label: m, value: m }));
  };

  const saveChannel = async () => {
    const isEdit = !!editId;
    const body: Record<string, any> = isEdit ? { id: editId, ...chForm } : chForm;
    if (isEdit && !body.api_key) delete body.api_key;
    const res = await apiFetch('/admin/channels', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    if (res.ok) { setChModal(false); fetchAll(); }
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
    if (res.ok) { setModelModal(false); setNewModelId(''); fetchAll(); } else { setModelErrModal(true); }
  };
  const deleteModel = async (id: string) => {
    await apiFetch(`/admin/channels?id=${id}&type=channel-model`, { method: 'DELETE' });
    fetchAll();
  };
  const addAlias = async () => {
    if (!aliasName) return;
    const res = await apiFetch('/admin/channels', { method: 'POST', body: JSON.stringify({ _type: 'alias', alias_name: aliasName, channel_model_id: aliasChannelModelId }) });
    if (res.ok) { setAliasModal(false); setAliasName(''); fetchAll(); } else { alert('别名已存在或创建失败'); }
  };
  const deleteAlias = async (id: string) => {
    await apiFetch(`/admin/channels?id=${id}&type=alias`, { method: 'DELETE' });
    fetchAll();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg sm:text-xl font-semibold text-gray-900">渠道管理</h1><p className="text-xs sm:text-sm text-gray-500 mt-0.5">管理上游 API 提供商</p></div>
        <button onClick={() => { setChForm({ name: '', base_url: '', api_key: '', priority: 0, notes: '' }); setEditId(null); setChModal(true); }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors">
          <InlineIcon name="plus" className="w-4 h-4" /> 新建渠道</button>
      </div>

      {/* Channel Create/Edit Modal — name, base_url, api_key, priority, notes only */}
      <Modal open={chModal} onClose={() => setChModal(false)} title={editId ? '编辑渠道' : '新建渠道'}>
        <div className="space-y-4">
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
          <div>
            <label className="block text-xs text-gray-500 mb-1">Base URL</label>
            <input value={chForm.base_url} onChange={e => setChForm({...chForm, base_url: e.target.value})}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder="https://api.deepseek.com" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">API Key <span className="text-gray-400">（加密存储）</span></label>
            <input type="password" value={chForm.api_key} onChange={e => setChForm({...chForm, api_key: e.target.value})}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder={editId ? '留空保持不变' : 'sk-...'} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">备注</label>
            <input value={chForm.notes} onChange={e => setChForm({...chForm, notes: e.target.value})}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="如 DeepSeek" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={saveChannel}
              className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">{editId ? '保存' : '创建'}</button>
            <button onClick={() => setChModal(false)}
              className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">取消</button>
          </div>
        </div>
      </Modal>

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

      {/* Add Model Modal — used in expanded section */}
      <Modal open={modelModal} onClose={() => setModelModal(false)} title="添加模型">
        <div className="space-y-3">
          <div><label className="block text-xs text-gray-500 mb-1">模型 ID <span className="text-gray-400">（如 deepseek-v4-pro）</span></label>
            <input value={newModelId} onChange={e => setNewModelId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder="deepseek-v4-pro" />
          </div>
          <button onClick={addModel} className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">添加</button>
        </div>
      </Modal>

      {/* Alias Modal */}
      <Modal open={aliasModal} onClose={() => setAliasModal(false)} title="添加模型别名">
        <div className="space-y-3">
          <div><label className="block text-xs text-gray-500 mb-1">别名 <span className="text-gray-400">（用户调用时使用的名称）</span></label>
            <input value={aliasName} onChange={e => setAliasName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder="my-custom-model" /></div>
          <button onClick={addAlias} className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">创建</button>
        </div>
      </Modal>

      {/* Channel Cards */}
      {channels.map(ch => {
        const expanded = expandedId === ch.id;
        const models = modelsForChannel(ch.id);
        const pulled = pulledModels[ch.id] || [];
        return (
          <div key={ch.id} className="bg-white rounded-xl border border-gray-100 hover:shadow-sm transition-shadow">
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{ch.name}</h3>
                    {healthBadge(ch.health_status)}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${ch.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>{ch.is_active ? '活跃' : '停用'}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-0.5">
                    <code className="text-gray-400 font-mono text-[10px]">{ch.base_url}</code>
                    {ch.notes && <span>· {ch.notes}</span>}
                    <span>· 优先 {ch.priority}</span>
                    <span>· 模型: {models.length} 个</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="group relative">
                    <button onClick={() => { setChForm({ name: ch.name, base_url: ch.base_url, api_key: '', priority: ch.priority, notes: ch.notes }); setEditId(ch.id); setChModal(true); }}
                      className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-200"><InlineIcon name="pencil" className="w-4 h-4" /></button>
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">编辑</span>
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
                  <span className="group relative">
                    <button onClick={() => setExpandedId(expanded ? null : ch.id)}
                      className={'p-2 rounded-lg transition-all border ' + (expanded ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 border-transparent hover:border-gray-200')}>
                      <InlineIcon name="chevronDown" className={'w-4 h-4 transition-transform ' + (expanded ? 'rotate-180' : '')} /></button>
                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">{expanded ? '收起' : '展开'}</span>
                  </span>
                </div>
              </div>
            </div>

            {expanded && (
              <div className="border-t border-gray-100 bg-gray-50/30 px-5 sm:px-6 py-5 space-y-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><InlineIcon name="bot" className="w-4 h-4" /> 模型与别名</h4>
                  <div className="flex gap-2">
                    <button onClick={() => doPullModels(ch.id)} disabled={pullingId === ch.id}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors">
                      {pullingId === ch.id ? <InlineIcon name="loaderCircle" className="w-3.5 h-3.5 animate-spin" /> : <InlineIcon name="server" className="w-3.5 h-3.5" />} 拉取</button>
                    <button onClick={() => { setModelChannelId(ch.id); setNewModelId(''); setModelModal(true); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 inline-flex items-center gap-1.5 transition-colors">
                      <InlineIcon name="plus" className="w-3.5 h-3.5" /> 添加</button>
                  </div>
                </div>

                {/* Combined model + alias cards */}
                {models.length > 0 ? (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {models.map(m => {
                      const als = aliasesForModel(m.id);
                      const alias = als.length > 0 ? als[0] : null;
                      return (
                        <div key={m.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 group shadow-sm hover:border-indigo-200 transition-all">
                          {/* Left: primary display */}
                          <div className="flex-1 min-w-0">
                            {alias ? (
                              <>
                                <div className="flex items-center gap-1.5">
                                  <code className="text-sm font-semibold text-amber-700 font-mono truncate">{alias.alias_name}</code>
                                  <button onClick={() => deleteAlias(alias.id)} className="p-0.5 rounded text-red-200 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"><InlineIcon name="x" className="w-3 h-3" /></button>
                                </div>
                                <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
                                  <span className="text-gray-300">model: </span>{m.model_id}
                                </div>
                              </>
                            ) : (
                              <>
                                <code className="text-sm font-semibold text-gray-800 font-mono truncate block">{m.model_id}</code>
                                <button onClick={() => { setAliasChannelModelId(m.id); setAliasName(''); setAliasModal(true); }}
                                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-gray-400 border border-dashed border-gray-300 rounded px-2 py-0.5 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all">
                                  <InlineIcon name="plus" className="w-3 h-3" /> 别名</button>
                              </>
                            )}
                          </div>
                          {/* Right: delete model */}
                          <button onClick={() => deleteModel(m.id)} className="p-1 rounded text-red-200 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shrink-0"><InlineIcon name="x" className="w-3 h-3" /></button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="w-full py-6 text-center text-sm text-gray-400">
                    <InlineIcon name="bot" className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                    暂无模型，点击"拉取"或"添加"
                  </div>
                )}

                {/* Pulled models quick-add */}
                {pulled.length > 0 && (
                  <details className="text-sm text-gray-500" open>
                    <summary className="cursor-pointer hover:text-gray-700 font-medium">上游可用模型（{pulled.length} 个）</summary>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {pulled.map(m => {
                        const exists = models.some(mod => mod.model_id === m);
                        return exists ? (
                          <span key={m} className="text-xs bg-gray-200 text-gray-500 px-2.5 py-1 rounded-lg cursor-default">{m} ✓</span>
                        ) : (
                          <button key={m} onClick={() => {
                            apiFetch('/admin/channels', { method: 'POST', body: JSON.stringify({ _type: 'channel-model', channel_id: ch.id, model_id: m }) }).then(() => fetchAll());
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
        );
      })}
      {channels.length === 0 && (
        <div className="py-16"><EmptyState icon="plug" text="暂无渠道" iconClassName="w-10 h-10 mx-auto mb-3 text-gray-200" /></div>
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
