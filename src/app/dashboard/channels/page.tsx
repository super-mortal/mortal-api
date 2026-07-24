'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { InlineIcon } from '@/lib/icon';
import { apiFetch } from '@/lib/fetch-with-auth';
import { Switch } from '@/lib/switch';
import { ConfirmDialog } from '@/lib/confirm-dialog';
import { Spinner, EmptyState } from '@/lib/ui';
import { HealthBadge } from '@/lib/health-badge';
import { Modal } from '@/lib/modal';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

function SortableChannelCard({ ch, children }: { ch: Channel; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ch.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    position: isDragging ? 'relative' as const : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'relative z-50' : ''}>
      <div className="flex items-stretch">
        {/* Drag handle */}
        <button
          className="flex items-center justify-center w-8 shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors rounded-l-xl hover:bg-gray-50 border-r border-transparent hover:border-gray-200"
          {...attributes}
          {...listeners}
          title="拖拽排序"
        >
          <InlineIcon name="grip-vertical" className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
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
  const [panelEditId, setPanelEditId] = useState<string | null>(null);
  const [panelForm, setPanelForm] = useState({ name: '', base_url: '', api_key: '', priority: 0, notes: '' });
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [modelChannelId, setModelChannelId] = useState('');
  const [newModelId, setNewModelId] = useState('');
  const [showAddModel, setShowAddModel] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [modalShowApiKey, setModalShowApiKey] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);
  const [deleteModelConfirm, setDeleteModelConfirm] = useState<string | null>(null);
  const [modelErrModal, setModelErrModal] = useState(false);
  const [modelValidationError, setModelValidationError] = useState<string | null>(null);
  const [pricingMap, setPricingMap] = useState<Record<string, { prompt_price: number | string; completion_price: number | string; cached_prompt_price: number | string }>>({});
  const [pullEmptyDialog, setPullEmptyDialog] = useState<string | null>(null);
  const [pullFailDialog, setPullFailDialog] = useState<string | null>(null);
  const [pullErrDialog, setPullErrDialog] = useState<string | null>(null);

  interface PendingModelChange {
    alias?: string;
    clearAlias?: boolean;
    prices?: { prompt_price: string; completion_price: string; cached_prompt_price: string };
    staged: boolean;
    deleted?: boolean;
    aliasName?: string | null;  // 新增：记录当前别名值（用于确定 pricing key）
  }
  const [pendingModels, setPendingModels] = useState<Record<string, PendingModelChange>>({});
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Modal state (independent from side panel)
  const [chModal, setChModal] = useState(false);
  const [modalForm, setModalForm] = useState({ name: '', base_url: '', api_key: '', priority: 0, notes: '' });
  const [modalEditId, setModalEditId] = useState<string | null>(null);

  const refreshPricingMap = useCallback(async () => {
    const r = await apiFetch('/admin/pricing');
    if (r.ok) {
      const d = await r.json();
      const map: Record<string, any> = {};
      d.pricing.forEach((p: any) => { map[p.model_id] = p; });
      setPricingMap(map);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    const res = await apiFetch('/admin/channels?scope=models');
    if (res.ok) { const d = await res.json(); setChannels(d.channels); setChannelModels(d.channelModels || []); setAliases(d.aliases || []); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { refreshPricingMap(); }, [refreshPricingMap]);

  const modelsForChannel = (chId: string) => channelModels.filter(m => m.channel_id === chId);
  const aliasesForModel = (cmId: string) => aliases.filter(a => a.channel_model_id === cmId);

  const handleModelSave = async (modelId: string) => {
    const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';
    const alias = getVal(`alias-input-${modelId}`);
    const p = getVal(`price-prompt-${modelId}`);
    const c = getVal(`price-completion-${modelId}`);
    const ch = getVal(`price-cached-${modelId}`);

    const hasPrice = p || c || ch;
    const validateDecimal = (v: string, label: string): boolean => {
      if (v === '' || v === '0') return true;
      if (!/^\d+\.\d+$/.test(v)) { setModelValidationError(`${label} 价格必须包含小数点，如 28.0`); return false; }
      return true;
    };
    if (hasPrice) {
      if (!validateDecimal(p, '标准输入') || !validateDecimal(c, '输出') || !validateDecimal(ch, '缓存输入')) return;
    }

    // Direct API commit — no longer two-step via pendingModels
    const models = modelsForChannel(panelEditId || '');
    const m = models.find(mm => mm.model_id === modelId);
    if (!m) { setModelValidationError('模型不存在'); return; }

    try {
      // 1. Handle alias: delete old, create new
      const als = aliasesForModel(m.id);
      if (als[0]) {
        const delRes = await apiFetch(`/admin/channels?id=${als[0].id}&type=alias`, { method: 'DELETE' });
        if (!delRes.ok) { setModelValidationError('删除旧别名失败'); return; }
      }
      if (alias) {
        const createRes = await apiFetch('/admin/channels', {
          method: 'POST',
          body: JSON.stringify({ _type: 'alias', alias_name: alias, channel_model_id: m.id })
        });
        if (!createRes.ok) { setModelValidationError('创建别名失败'); return; }
      }

      // 2. Handle prices
      if (hasPrice) {
        const pricingKey = alias || modelId;
        const priceRes = await apiFetch('/admin/pricing', {
          method: 'POST',
          body: JSON.stringify({
            pricing_key: pricingKey,
            model_id: modelId,
            channel_model_id: m.id,
            prompt_price: Number(p),
            completion_price: Number(c),
            cached_prompt_price: Number(ch),
          })
        });
        if (priceRes.ok) {
          const data = await priceRes.json();
          if (data.syncedCount > 0) {
            setSyncFeedback(`价格已同步至 ${data.syncedCount} 个渠道（${data.syncedChannels.map((ch: any) => ch.channel_name).join('、')}）`);
          } else {
            setSyncFeedback(`价格已保存`);
          }
          setTimeout(() => setSyncFeedback(null), 3000);
          refreshPricingMap();
        } else {
          setModelValidationError('保存价格失败');
          return;
        }
      }

      // 3. Clear from pending (it's already committed) and refresh
      setPendingModels(prev => { const n = { ...prev }; delete n[modelId]; return n; });
      fetchAll();
    } catch (e) {
      setModelValidationError('保存失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const quickDeleteModel = async (modelId: string) => {
    const models = modelsForChannel(panelEditId || '');
    const m = models.find(mm => mm.model_id === modelId);
    if (!m) return;
    await apiFetch(`/admin/channels?id=${m.id}&type=channel-model`, { method: 'DELETE' });
    fetchAll();
  };

  const handleModelDelete = (modelId: string) => {
    setDeleteModelConfirm(modelId);
  };
  const confirmDeleteModel = () => {
    if (!deleteModelConfirm) return;
    setPendingModels(prev => ({ ...prev, [deleteModelConfirm]: { ...(prev[deleteModelConfirm] || {}), deleted: true, staged: true, alias: undefined, prices: undefined } }));
    setDeleteModelConfirm(null);
  };

  const saveChannel = async () => {
    const isEdit = !!panelEditId;
    const body: Record<string, any> = isEdit ? { id: panelEditId, ...panelForm } : panelForm;
    if (isEdit && (!body.api_key || body.api_key === '••••••••••••••••••')) delete body.api_key;
    const res = await apiFetch('/admin/channels', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    if (!res.ok) return;

    // Commit pending model changes
    const models = modelsForChannel(panelEditId || '');
    for (const [modelId, change] of Object.entries(pendingModels)) {
      if (!change.staged) continue;
      if (change.deleted) {
        const m = models.find(mm => mm.model_id === modelId);
        if (m) await apiFetch(`/admin/channels?id=${m.id}&type=channel-model`, { method: 'DELETE' });
        continue;
      }
      if (change.alias !== undefined) {
        const m = models.find(mm => mm.model_id === modelId);
        if (!m) continue;
        const als = aliasesForModel(m.id);
        if (als[0]) await apiFetch(`/admin/channels?id=${als[0].id}&type=alias`, { method: 'DELETE' });
        if (change.alias) {
          await apiFetch('/admin/channels', { method: 'POST', body: JSON.stringify({ _type: 'alias', alias_name: change.alias, channel_model_id: m.id }) });
        }
      }
      if (change.prices) {
        // 确定 pricing key：别名存在时用别名，否则用 model_id
        const pricingKey = change.aliasName || modelId;
        // 获取 channel_model 的 id（用于后端同步查询）
        const m = models.find(mm => mm.model_id === modelId);
        const res = await apiFetch('/admin/pricing', {
          method: 'POST',
          body: JSON.stringify({
            pricing_key: pricingKey,
            model_id: modelId,  // 保留向后兼容
            channel_model_id: m?.id || '',
            prompt_price: Number(change.prices.prompt_price),
            completion_price: Number(change.prices.completion_price),
            cached_prompt_price: Number(change.prices.cached_prompt_price),
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.syncedCount > 0) {
            setSyncFeedback(`价格已同步至 ${data.syncedCount} 个渠道（${data.syncedChannels.map((c: any) => c.channel_name).join('、')}）`);
          } else {
            setSyncFeedback(`价格已保存`);
          }
          // 3 秒后自动清除
          setTimeout(() => setSyncFeedback(null), 3000);
          refreshPricingMap();
        }
      }
    }

    setPendingModels({});
    setShowApiKey(false);
    setSidePanelOpen(false);
    fetchAll();
  };

  const saveModalChannel = async () => {
    const isEdit = !!modalEditId;
    const body: Record<string, any> = isEdit ? { id: modalEditId, ...modalForm } : modalForm;
    if (isEdit && (!body.api_key || body.api_key === '••••••••••••••••••')) delete body.api_key;
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
      const res = await apiFetch('/admin/channels', { method: 'PUT', body: JSON.stringify({ id, _action: 'pull-models' }) });
      if (res.ok) {
        const d = await res.json();
        const models = d.models || [];
        if (models.length === 0) {
          setPullEmptyDialog('上游返回了空模型列表，请检查 API Key 和 URL');
        } else {
          setPulledModels((p) => ({ ...p, [id]: models }));
        }
      } else {
        const text = await res.text();
        setPullFailDialog('拉取失败 (HTTP ' + res.status + '):\n' + (text || '').slice(0, 300));
      }
    } catch (e) {
      setPullErrDialog('拉取异常: ' + String(e instanceof Error ? e.message : e).slice(0, 300));
    }
    setPullingId(null);
  };

  const addModel = async () => {
    if (!newModelId) return;
    const res = await apiFetch('/admin/channels', { method: 'POST', body: JSON.stringify({ _type: 'channel-model', channel_id: modelChannelId, model_id: newModelId }) });
    if (res.ok) { setNewModelId(''); fetchAll(); } else { setModelErrModal(true); }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPendingModels({}); setSidePanelOpen(false); } };
    if (sidePanelOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [sidePanelOpen]);

  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const current = channelsRef.current;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = current.findIndex((ch) => ch.id === active.id);
    const newIndex = current.findIndex((ch) => ch.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(current, oldIndex, newIndex);
    setChannels(reordered);

    // Persist new priority order
    const total = reordered.length;
    const results = await Promise.allSettled(
      reordered.map((ch, idx) =>
        apiFetch('/admin/channels', {
          method: 'PATCH',
          body: JSON.stringify({ id: ch.id, priority: total - idx }),
        })
      )
    );
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.error(`${failures.length} PATCH calls failed during drag persistence`);
    }
  }, []); // stable — no longer depends on channels

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-lg sm:text-xl font-semibold text-gray-900">渠道管理</h1><p className="text-xs sm:text-sm text-gray-500 mt-0.5">管理上游 API 提供商</p></div>
        <button onClick={() => { setModalForm({ name: '', base_url: '', api_key: '', priority: 0, notes: '' }); setModalEditId(null); setChModal(true); }}
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={channels.map(ch => ch.id)} strategy={verticalListSortingStrategy}>
          {channels.map(ch => {
            const models = modelsForChannel(ch.id);
            return (
              <SortableChannelCard key={ch.id} ch={ch}>
                <div className="bg-white border border-gray-100 hover:shadow-sm transition-shadow h-full"
                  style={{ borderRadius: '0 0.75rem 0.75rem 0' }}>
                  <div className="p-4 sm:p-5 relative">
                    <div className="flex items-center gap-3">
                      {/* Block A — name + meta (left, flex:1) */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{ch.name}</h3>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-0.5">
                          <code className="text-gray-400 font-mono text-[10px]">{ch.base_url}</code>
                          {ch.notes && <span>· {ch.notes}</span>}
                          <span>· {ch.priority === 0 ? <span className="text-gray-400">自动</span> : <>优先 {ch.priority}</>}</span>
                          <span>· 模型: {models.length} 个</span>
                        </div>
                      </div>

                      {/* Block B — badge + 24 dots + 96%|320ms (absolute, centered) */}
                      <div className="hidden md:flex items-center gap-3 absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
                        <HealthBadge health_status={ch.health_status} is_active={ch.is_active} cooldown_until={ch.cooldown_until} />
                        <div className="flex gap-[2px]">
                          {(ch.recent_checks || []).slice(0, 24).concat(Array(Math.max(0, 24 - (ch.recent_checks || []).length)).fill({ ok: 1 })).slice(0, 24).map((c, i) => (
                            <span
                              key={i}
                              className="inline-block w-[4px] h-[16px] rounded-[1px]"
                              style={{ background: c.ok === 1 ? '#10b981' : c.ok === 0 ? '#ef4444' : '#fbbf24' }}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-mono whitespace-nowrap">
                          <span className="text-emerald-600 font-semibold">{ch.uptime_pct ?? 100}%</span>
                          <span className="text-gray-300">|</span>
                          <span className="text-gray-700 font-semibold">{ch.avg_latency_ms ? `${ch.avg_latency_ms}ms` : '—'}</span>
                        </div>
                      </div>

                      {/* Block C — action buttons (right, ml-auto) */}
                      <div className="flex items-center gap-0.5 shrink-0 ml-auto">
                        <span className="group relative">
                          <button onClick={() => { setModalForm({ name: ch.name, base_url: ch.base_url, api_key: '••••••••••••••••••', priority: ch.priority, notes: ch.notes }); setModalEditId(ch.id); setChModal(true); }}
                            className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all border border-transparent hover:border-blue-200"><InlineIcon name="pencil" className="w-4 h-4" /></button>
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">编辑</span>
                        </span>
                        {/* 连通检测 — unchanged */}
                        <span className="group relative">
                          <button onClick={() => openCheckModal(ch)}
                            className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all border border-transparent hover:border-emerald-200"><InlineIcon name="activity" className="w-4 h-4" /></button>
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">连通检测</span>
                        </span>
                        <span className="group relative">
                          <button onClick={() => { setPanelForm({ name: ch.name, base_url: ch.base_url, api_key: ch.api_key ? '••••••••••••••••••' : '', priority: ch.priority, notes: ch.notes }); setPanelEditId(ch.id); setModelChannelId(ch.id); setSidePanelOpen(true); }}
                            className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-200"><InlineIcon name="chevronDown" className="w-4 h-4" /></button>
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">展开</span>
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
              </SortableChannelCard>
            );
          })}
        </SortableContext>
      </DndContext>
      {channels.length === 0 && (
        <div className="py-16"><EmptyState icon="plug" text="暂无渠道" iconClassName="w-10 h-10 mx-auto mb-3 text-gray-200" /></div>
      )}

      {/* Side Panel */}
      {sidePanelOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => { setPendingModels({}); setShowApiKey(false); setSidePanelOpen(false); }} />
          <div className="absolute right-0 top-0 bottom-0 w-1/2 min-w-[500px] max-w-[660px] bg-white shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{panelEditId ? '编辑渠道' : '新建渠道'}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{panelForm.name || '未命名'}</p>
              </div>
              <button onClick={() => { setPendingModels({}); setShowApiKey(false); setSidePanelOpen(false); }} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <InlineIcon name="x" className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {/* 基本信息 */}
              <div className="mb-6">
                <h4 className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
                  <InlineIcon name="fileText" className="w-3.5 h-3.5" /> 基本信息
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">名称</label>
                    <input value={panelForm.name} onChange={e => setPanelForm({...panelForm, name: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="DeepSeek 官方" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">优先级</label>
                    <input type="number" value={panelForm.priority} onChange={e => setPanelForm({...panelForm, priority: Number(e.target.value)})}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="数字越大越靠前，0=自动" />
                    <p className="text-[10px] text-gray-400 mt-1">数字越大优先级越高，0 表示自动分配</p>
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                  <input value={panelForm.base_url} onChange={e => setPanelForm({...panelForm, base_url: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder="https://api.deepseek.com" />
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">API Key <span className="text-gray-400">（加密存储）</span></label>
                  <div className="relative">
                    <input type={showApiKey ? 'text' : 'password'} value={panelForm.api_key}
                      onChange={e => setPanelForm({...panelForm, api_key: e.target.value})}
                      className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                      placeholder={panelEditId ? '••••••••••••••••••' : 'sk-...'} />
                    {panelEditId && (
                      <button type="button"
                        onClick={async () => {
                          if (showApiKey) {
                            setShowApiKey(false);
                            setPanelForm(f => ({ ...f, api_key: '••••••••••••••••••' }));
                            return;
                          }
                          try {
                            const res = await apiFetch(`/admin/channels?scope=api-key&id=${panelEditId}`);
                            if (res.ok) {
                              const d = await res.json();
                              setPanelForm(f => ({ ...f, api_key: d.api_key }));
                              setShowApiKey(true);
                            }
                          } catch (e) { console.error('拉取 api key 失败', e); }
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600">
                        {showApiKey ? <InlineIcon name="eyeOff" className="w-4 h-4" /> : <InlineIcon name="eye" className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-gray-500 mb-1">备注</label>
                  <input value={panelForm.notes} onChange={e => setPanelForm({...panelForm, notes: e.target.value})}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="如 DeepSeek" />
                </div>
              </div>

              {/* 模型与别名 — only show for edit mode */}
              {panelEditId && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                      <InlineIcon name="bot" className="w-3.5 h-3.5" /> 模型与别名
                    </h4>
                    <div className="flex gap-2">
                      <button onClick={() => doPullModels(panelEditId)} disabled={pullingId === panelEditId}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors">
                        {pullingId === panelEditId ? <InlineIcon name="loaderCircle" className="w-3.5 h-3.5 animate-spin" /> : <InlineIcon name="server" className="w-3.5 h-3.5" />} 拉取</button>
                      <button onClick={() => setShowAddModel(!showAddModel)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 bg-indigo-50/50 hover:bg-indigo-100 inline-flex items-center gap-1.5 transition-colors"
                      ><InlineIcon name="plus" className="w-3.5 h-3.5" /> 添加</button>
                    </div>
                  </div>

                  {showAddModel && (
                    <div className="mt-2 mb-3 flex items-center gap-2">
                      <input
                        value={newModelId}
                        onChange={e => setNewModelId(e.target.value)}
                        placeholder="输入模型 ID..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                      />
                      <button onClick={() => { addModel(); setShowAddModel(false); }}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors">确认</button>
                      <button onClick={() => setShowAddModel(false)}
                        className="text-xs text-gray-400 hover:text-gray-600">取消</button>
                    </div>
                  )}

                  {/* Model cards */}
                  {modelsForChannel(panelEditId).length === 0 ? (
                    <div className="py-6 text-center">
                      <InlineIcon name="bot" className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                      <p className="text-sm text-gray-400">暂无模型，点击"拉取"或"添加"</p>
                    </div>
                  ) : (
                    modelsForChannel(panelEditId).map(m => {
                    const als = aliasesForModel(m.id);
                    const alias = als.length > 0 ? als[0] : null;
                    const isExpanded = expandedModelId === m.id;

                    return (
                      <div key={m.id} className={`border border-gray-200 rounded-xl overflow-hidden mb-2 ${pendingModels[m.model_id]?.deleted ? 'opacity-50' : ''}`}>
                        {/* Collapsed header */}
                        <div
                          className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => setExpandedModelId(isExpanded ? null : m.id)}
                        >
                          <code className="text-sm font-semibold text-gray-800 font-mono truncate">{m.model_id}</code>
                          {pendingModels[m.model_id]?.deleted && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200 shrink-0">待删除</span>
                          )}
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
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); quickDeleteModel(m.model_id); }}
                              title="删除该 model"
                              className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                              <InlineIcon name="trash2" className="w-3.5 h-3.5" />
                            </button>
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
                                <div className="flex-1 relative">
                                  <input
                                    defaultValue={alias?.alias_name || ''}
                                    placeholder="输入别名..."
                                    id={`alias-input-${m.model_id}`}
                                    className="w-full px-3 py-1.5 pr-7 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const input = document.getElementById(`alias-input-${m.model_id}`) as HTMLInputElement;
                                      if (input) input.value = '';
                                      setPendingModels(prev => ({ ...prev, [m.model_id]: { ...(prev[m.model_id] || {}), clearAlias: true } }));
                                    }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                                    title="清除别名"
                                  >
                                    <InlineIcon name="x" className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Pricing editor */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1.5">价格（元/1M tokens）</label>
                              {/* 新增：定价 key 提示 */}
                              {alias ? (
                                <p className="text-[10px] text-gray-400 mb-2">
                                  此价格为 <code className="text-indigo-500 bg-indigo-50 px-1 rounded">{alias.alias_name}</code> 的全局统一价格，相同别名渠道将自动同步
                                </p>
                              ) : (
                                <p className="text-[10px] text-gray-400 mb-2">
                                  此价格为 <code className="text-gray-500 bg-gray-100 px-1 rounded">{m.model_id}</code> 的全局统一价格
                                </p>
                              )}
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <div className="text-[10px] text-gray-400 mb-0.5">标准输入</div>
                                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                                    <input type="text" inputMode="decimal"
                                      value={pricingMap[m.model_id]?.prompt_price ?? ''}
                                      onChange={e => setPricingMap(prev => ({ ...prev, [m.model_id]: { ...prev[m.model_id], prompt_price: e.target.value } }))}
                                      id={`price-prompt-${m.model_id}`}
                                      className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" />
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-400 mb-0.5">输出</div>
                                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                                    <input type="text" inputMode="decimal"
                                      value={pricingMap[m.model_id]?.completion_price ?? ''}
                                      onChange={e => setPricingMap(prev => ({ ...prev, [m.model_id]: { ...prev[m.model_id], completion_price: e.target.value } }))}
                                      id={`price-completion-${m.model_id}`}
                                      className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" />
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-400 mb-0.5">缓存输入</div>
                                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                                    <input type="text" inputMode="decimal"
                                      value={pricingMap[m.model_id]?.cached_prompt_price ?? ''}
                                      onChange={e => setPricingMap(prev => ({ ...prev, [m.model_id]: { ...prev[m.model_id], cached_prompt_price: e.target.value } }))}
                                      id={`price-cached-${m.model_id}`}
                                      className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" />
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Unified save/delete buttons */}
                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                              <button onClick={() => handleModelDelete(m.model_id)}
                                className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                                <InlineIcon name="trash2" className="w-3 h-3" /> 删除
                              </button>
                              <div className="flex items-center gap-2">
                                {pendingModels[m.model_id]?.staged && (
                                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                    ✓ 已暂存
                                  </span>
                                )}
                                <button onClick={() => handleModelSave(m.model_id)}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition-colors">
                                  保存
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }))}

                  {/* Pulled models */}
                  {pulledModels[panelEditId]?.length > 0 && (
                    <details className="text-sm text-gray-500 mt-2" open>
                      <summary className="cursor-pointer hover:text-gray-700 font-medium text-xs">上游可用模型（{pulledModels[panelEditId].length} 个）</summary>
                      <div className="grid grid-cols-3 gap-1.5 mt-2">
                        {pulledModels[panelEditId].map(m => {
                          const exists = modelsForChannel(panelEditId).some(mod => mod.model_id === m);
                          return (
                            <div key={m}
                              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-mono ${
                                exists
                                  ? 'bg-gray-100 text-gray-500'
                                  : 'bg-white border border-gray-200 text-gray-700 hover:border-indigo-300 transition-colors group'
                              }`}
                            >
                              <span className="flex-1 truncate">{m}</span>
                              {exists ? (
                                <button onClick={() => {
                                  const cm = channelModels.find(mod => mod.model_id === m && mod.channel_id === panelEditId);
                                  if (cm) { apiFetch(`/admin/channels?id=${cm.id}&type=channel-model`, { method: 'DELETE' }).then(() => fetchAll()); }
                                }}
                                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded bg-red-100 text-red-500 hover:bg-red-200 transition-colors text-xs font-bold"
                                >−</button>
                              ) : (
                                <button onClick={() => {
                                  apiFetch('/admin/channels', { method: 'POST', body: JSON.stringify({ _type: 'channel-model', channel_id: panelEditId, model_id: m }) }).then(() => fetchAll());
                                }}
                                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors text-xs font-bold opacity-0 group-hover:opacity-100"
                                >+</button>
                              )}
                            </div>
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
                  {panelEditId ? '💾 保存' : '创建'}
                </button>
                <button onClick={() => { setPendingModels({}); setShowApiKey(false); setSidePanelOpen(false); }}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Channel Create/Edit Modal */}
      <Modal open={chModal} onClose={() => { setChModal(false); setModalForm({ name: '', base_url: '', api_key: '', priority: 0, notes: '' }); setModalEditId(null); setModalShowApiKey(false); }} title={modalEditId ? '编辑渠道' : '新建渠道'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">名称</label>
              <input value={modalForm.name} onChange={e => setModalForm({...modalForm, name: e.target.value})}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="DeepSeek 官方" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">优先级</label>
              <input type="number" value={modalForm.priority} onChange={e => setModalForm({...modalForm, priority: Number(e.target.value)})}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="数字越大越靠前，0=自动" />
              <p className="text-[10px] text-gray-400 mt-1">数字越大优先级越高，0 表示自动分配</p>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Base URL</label>
            <input value={modalForm.base_url} onChange={e => setModalForm({...modalForm, base_url: e.target.value})}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder="https://api.deepseek.com" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">API Key <span className="text-gray-400">（加密存储）</span></label>
            <div className="relative">
              <input type={modalShowApiKey ? 'text' : 'password'} value={modalForm.api_key}
                onChange={e => setModalForm({...modalForm, api_key: e.target.value})}
                className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                placeholder={modalEditId ? '••••••••••••••••••' : 'sk-...'} />
              {modalEditId && (
                <button type="button"
                  onClick={async () => {
                    if (modalShowApiKey) {
                      setModalShowApiKey(false);
                      setModalForm(f => ({ ...f, api_key: '••••••••••••••••••' }));
                      return;
                    }
                    try {
                      const res = await apiFetch(`/admin/channels?scope=api-key&id=${modalEditId}`);
                      if (res.ok) {
                        const d = await res.json();
                        setModalForm(f => ({ ...f, api_key: d.api_key }));
                        setModalShowApiKey(true);
                      }
                    } catch (e) { console.error('拉取 api key 失败', e); }
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600">
                  {modalShowApiKey ? <InlineIcon name="eyeOff" className="w-4 h-4" /> : <InlineIcon name="eye" className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">备注</label>
            <input value={modalForm.notes} onChange={e => setModalForm({...modalForm, notes: e.target.value})}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="如 DeepSeek" />
          </div>
          <button onClick={saveModalChannel}
            className="w-full py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
            {modalEditId ? '保存修改' : '创建渠道'}
          </button>
        </div>
      </Modal>

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
      <ConfirmDialog
        open={!!modelValidationError}
        onClose={() => setModelValidationError(null)}
        onConfirm={() => setModelValidationError(null)}
        title="提示"
        message={modelValidationError || ''}
        confirmText="知道了"
        variant="info"
      />
      <ConfirmDialog
        open={!!deleteModelConfirm}
        onClose={() => setDeleteModelConfirm(null)}
        onConfirm={confirmDeleteModel}
        title="确认删除"
        message="确定删除此模型？此操作不可撤销。"
        confirmText="确认删除"
        variant="danger"
      />
      {syncFeedback && (
        <div className="fixed top-4 right-4 z-[100] bg-white border border-emerald-200 px-4 py-3 rounded-xl shadow-lg text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
          <span className="inline-flex w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full items-center justify-center text-xs font-bold">✓</span>
          <span className="text-gray-700">{syncFeedback}</span>
        </div>
      )}
      <ConfirmDialog
        open={!!pullEmptyDialog}
        onClose={() => setPullEmptyDialog(null)}
        onConfirm={() => setPullEmptyDialog(null)}
        title="提示"
        message={pullEmptyDialog || ''}
        confirmText="知道了"
        variant="info"
      />
      <ConfirmDialog
        open={!!pullFailDialog}
        onClose={() => setPullFailDialog(null)}
        onConfirm={() => setPullFailDialog(null)}
        title="拉取失败"
        message={pullFailDialog || ''}
        confirmText="知道了"
        variant="danger"
      />
      <ConfirmDialog
        open={!!pullErrDialog}
        onClose={() => setPullErrDialog(null)}
        onConfirm={() => setPullErrDialog(null)}
        title="请求异常"
        message={pullErrDialog || ''}
        confirmText="知道了"
        variant="danger"
      />
    </div>
  );
}
