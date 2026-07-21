'use client';

import { useEffect, useState, useCallback } from 'react';
import { InlineIcon } from '@/lib/icon';
import { Modal } from '@/lib/modal';
import { apiFetch } from '@/lib/fetch-with-auth';
import { ComboBox } from '@/lib/combobox';
import { Switch } from '@/lib/switch';
import { ConfirmDialog } from '@/lib/confirm-dialog';
import { Popover } from '@/lib/popover';
import { DatePicker } from '@/lib/date-picker';

interface RelayKey {
  id: string; key: string; name: string; spend_limit: number;
  total_spent: number; is_active: number; is_pinned: number;
  expires_at: string | null; allowed_models: string; allowed_channels: string; created_at: string;
}

interface Channel { id: string; name: string; }

interface FullData {
  keys: RelayKey[];
  channels: Channel[];
  aliasMap: Record<string, string>;
}

function toBeijing(utc: string): string {
  return new Date(utc).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function isExpired(key: RelayKey): boolean {
  return !!key.expires_at && new Date(key.expires_at) < new Date();
}

export default function KeysPage() {
  const [keys, setKeys] = useState<RelayKey[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [aliasMap, setAliasMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<RelayKey | null>(null);
  const [newName, setNewName] = useState('');
  const [newSpendLimit, setNewSpendLimit] = useState(0);
  const [newExpiryDays, setNewExpiryDays] = useState<number | ''>('');
  const [newIsPinned, setNewIsPinned] = useState(false);
  const [newAllowedChannels, setNewAllowedChannels] = useState<string[]>([]);
  const [newAllowedModels, setNewAllowedModels] = useState<string[]>([]);
  const [editAllowedChannels, setEditAllowedChannels] = useState<string[]>([]);
  const [editAllowedModels, setEditAllowedModels] = useState<string[]>([]);
  const [editExpiry, setEditExpiry] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string } | null>(null);
  const [refreshConfirm, setRefreshConfirm] = useState<{ id: string; name: string } | null>(null);
  const [refreshResult, setRefreshResult] = useState<{ name: string; newKey: string } | null>(null);

  // Channel picker modal for create
  const [chPickerOpen, setChPickerOpen] = useState(false);
  const [chPickerMode, setChPickerMode] = useState<'create' | 'edit'>('create');
  const [chPickerSelected, setChPickerSelected] = useState<string[]>([]);

  // Model options for the selected channels
  const [createModelOptions, setCreateModelOptions] = useState<{ label: string; value: string }[]>([]);
  const [editModelOptions, setEditModelOptions] = useState<{ label: string; value: string }[]>([]);
  const [modelLoading, setModelLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await apiFetch('/admin/keys?scope=full');
    if (res.ok) { const d: FullData = await res.json(); setKeys(d.keys); setChannels(d.channels || []); setAliasMap(d.aliasMap || {}); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getModelsForChannels = useCallback(async (chIds: string[]): Promise<Array<{ label: string; value: string }>> => {
    const res = await apiFetch('/admin/channels?scope=models');
    if (!res.ok) return [];
    const d = await res.json();

    // 如果未选择渠道，获取全部 channel_models
    const chModels = chIds.length === 0
      ? (d.channelModels || [])
      : (d.channelModels || []).filter((m: any) => chIds.includes(m.channel_id));

    const chModelIds = new Set(chModels.map((m: any) => m.id));
    const aliases = (d.aliases || []).filter((a: any) => a.is_active);

    // Build alias lookup: model_id → alias_name
    const aliasByModelId: Record<string, string> = {};
    aliases
      .filter((a: any) => a.model_id && chModelIds.has(a.channel_model_id))
      .forEach((a: any) => { aliasByModelId[a.model_id] = a.alias_name; });

    // Build deduplicated options sorted by label
    const seen = new Set<string>();
    const options: Array<{ label: string; value: string }> = [];
    chModels.forEach((m: any) => {
      if (seen.has(m.model_id)) return;
      seen.add(m.model_id);
      const alias = aliasByModelId[m.model_id];
      options.push({
        label: alias ? `${m.model_id} (${alias})` : m.model_id,
        value: m.model_id,
      });
    });
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const loadCreateModels = useCallback(async (chIds: string[]) => {
    if (chIds.length === 0) { setCreateModelOptions([]); return; }
    setModelLoading(true);
    const models = await getModelsForChannels(chIds);
    setCreateModelOptions(models);
    const modelValues = new Set(models.map(m => m.value));
    setNewAllowedModels(prev => prev.filter(m => modelValues.has(m)));
    setModelLoading(false);
  }, [getModelsForChannels]);

  const loadEditModels = useCallback(async (chIds: string[]) => {
    if (chIds.length === 0) { setEditModelOptions([]); return; }
    setModelLoading(true);
    const models = await getModelsForChannels(chIds);
    setEditModelOptions(models);
    const modelValues = new Set(models.map(m => m.value));
    setEditAllowedModels(prev => prev.filter(m => modelValues.has(m)));
    setModelLoading(false);
  }, [getModelsForChannels]);

  // Open channel picker
  const openChPicker = (mode: 'create' | 'edit') => {
    setChPickerMode(mode);
    setChPickerSelected(mode === 'create' ? [...newAllowedChannels] : [...editAllowedChannels]);
    setChPickerOpen(true);
  };

  const confirmChannels = () => {
    setChPickerOpen(false);
    if (chPickerMode === 'create') {
      setNewAllowedChannels(chPickerSelected);
      loadCreateModels(chPickerSelected);
    } else {
      setEditAllowedChannels(chPickerSelected);
      loadEditModels(chPickerSelected);
    }
  };

  const calcExpiresAt = (days: number | ''): string | null => {
    if (days === '' || days <= 0) return null;
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.toISOString().replace('T', ' ').slice(0, 19);
  };

  const handleCreate = async () => {
    const res = await apiFetch('/admin/keys', {
      method: 'POST',
      body: JSON.stringify({
        name: newName || 'New Key', spend_limit: newSpendLimit,
        expires_at: calcExpiresAt(newExpiryDays),
        allowed_models: newAllowedModels.join(','),
        allowed_channels: newAllowedChannels.join(','),
        is_pinned: newIsPinned ? 1 : 0,
      }),
    });
    if (res.ok) {
      setShowCreate(false);
      setNewName(''); setNewSpendLimit(0); setNewExpiryDays(''); setNewIsPinned(false);
      setNewAllowedChannels([]); setNewAllowedModels([]);
      fetchData();
    }
  };

  const handleToggle = async (id: string, is_active: number) => {
    await apiFetch('/admin/keys', { method: 'PATCH', body: JSON.stringify({ id, is_active: is_active ? 0 : 1 }) });
    fetchData();
  };

  const handleEditSave = async () => {
    if (!showEdit) return;
    const body: Record<string, any> = {
      id: showEdit.id, name: showEdit.name, spend_limit: showEdit.spend_limit, is_pinned: showEdit.is_pinned,
      allowed_models: editAllowedModels.join(','),
      allowed_channels: editAllowedChannels.join(','),
    };
    if (editExpiry === '') body.expires_at = null;
    else if (editExpiry !== (showEdit.expires_at || '').replace(' ', 'T').slice(0, 10)) body.expires_at = editExpiry + 'T00:00';
    await apiFetch('/admin/keys', { method: 'PATCH', body: JSON.stringify(body) });
    setShowEdit(null); fetchData();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/admin/keys?id=${id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    fetchData();
  };

  const handleRefreshKey = async (id: string) => {
    setRefreshConfirm(null);
    try {
      const res = await apiFetch('/admin/keys', {
        method: 'PATCH',
        body: JSON.stringify({ id, refresh_key: true }),
      });
      const key = keys.find(k => k.id === id);
      const data = await res.json();
      if (data.new_key) {
        setRefreshResult({ name: key?.name || 'Key', newKey: data.new_key });
        setTimeout(() => setRefreshResult(null), 5000);
        fetchData();
      }
    } catch (err) {
      console.error('Key refresh failed:', err);
      const failedKey = keys.find(k => k.id === id);
      setRefreshResult({ name: failedKey?.name || 'Key', newKey: '⚠️ 刷新失败，请重试' });
      setTimeout(() => setRefreshResult(null), 5000);
    }
  };

  const copyKey = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">Key 管理</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">管理 API 访问密钥</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors">
          <InlineIcon name="plus" className="w-4 h-4" /> 创建 Key
        </button>
      </div>

      {refreshResult && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 animate-in fade-in">
          <InlineIcon name="check" className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-800">
            <p className="font-medium mb-1">Key「{refreshResult.name}」已刷新</p>
            <code className="block bg-white border border-amber-300 rounded px-2 py-1 font-mono text-[11px] break-all mb-1.5">{refreshResult.newKey}</code>
            <button onClick={() => { navigator.clipboard.writeText(refreshResult.newKey); }}
              className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2">
              复制新 Key
            </button>
          </div>
          <button onClick={() => setRefreshResult(null)}
            className="ml-auto text-amber-400 hover:text-amber-600 shrink-0">
            <InlineIcon name="x" className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="创建 API Key">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">名称</label>
            <div className="flex items-center gap-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="My Key" />
              <label className="flex items-center gap-2 text-xs text-gray-600 shrink-0 cursor-pointer">
                <span>置顶</span>
                <Switch
                  checked={newIsPinned}
                  onChange={setNewIsPinned}
                  size="sm"
                />
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">金额上限(元) (0=无限制)</label>
              <input type="number" value={newSpendLimit} onChange={(e) => setNewSpendLimit(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">有效天数 <span className="text-gray-400">（留空=永久有效）</span></label>
              <input type="number" min="1" value={newExpiryDays} onChange={(e) => setNewExpiryDays(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="留空=永久有效" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">允许的渠道 <span className="text-gray-400">（留空=全部渠道）</span></label>
            <button onClick={() => openChPicker('create')}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 transition-colors">
              <span className="text-gray-700">
                {newAllowedChannels.length === 0 ? '点击选择渠道...' : '已选择 ' + newAllowedChannels.length + ' 个渠道'}
              </span>
              <InlineIcon name="chevronDown" className="w-4 h-4 text-gray-400" />
            </button>
            {newAllowedChannels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {newAllowedChannels.map(cId => {
                  const ch = channels.find(c => c.id === cId);
                  return (
                    <span key={cId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-mono">
                      {ch?.name || cId}
                      <button onClick={() => {
                        const next = newAllowedChannels.filter(x => x !== cId);
                        setNewAllowedChannels(next);
                        loadCreateModels(next);
                      }} className="hover:text-red-500"><InlineIcon name="x" className="w-2.5 h-2.5" /></button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">允许的模型 <span className="text-gray-400">（基于选择的渠道，留空=全部可用）</span></label>
            {newAllowedChannels.length === 0 ? (
              <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">请先选择渠道</div>
            ) : modelLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5"><InlineIcon name="loaderCircle" className="w-3.5 h-3.5 animate-spin" /> 加载模型...</div>
            ) : (
              <ComboBox
                options={createModelOptions}
                value=""
                onChange={() => {}}
                allowCustom={true}
                placeholder="搜索模型名称后回车添加..."
                emptyText="该渠道无可用模型"
                multi
                selectedValues={newAllowedModels}
                onSelectionChange={setNewAllowedModels}
              />
            )}
            {newAllowedModels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {newAllowedModels.map(m => (
                  <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-mono">
                    {m}
                    <button onClick={() => setNewAllowedModels(newAllowedModels.filter(x => x !== m))} className="hover:text-red-500"><InlineIcon name="x" className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreate}
              className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">创建</button>
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">取消</button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="编辑 Key">
        {showEdit && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">名称</label>
              <div className="flex items-center gap-3">
                <input value={showEdit.name} onChange={(e) => setShowEdit({...showEdit, name: e.target.value})}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <label className="flex items-center gap-2 text-xs text-gray-600 shrink-0 cursor-pointer">
                  <span>置顶</span>
                  <Switch
                    checked={!!showEdit.is_pinned}
                    onChange={(checked) => setShowEdit({...showEdit, is_pinned: checked ? 1 : 0})}
                    size="sm"
                  />
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">金额上限(元)</label>
                <input type="number" value={showEdit.spend_limit} onChange={(e) => setShowEdit({...showEdit, spend_limit: Number(e.target.value)})}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">过期时间</label>
                <DatePicker value={editExpiry} onChange={(v) => setEditExpiry(v)}
                  className="w-full" />
                {showEdit.expires_at && <p className="text-[10px] text-gray-400 mt-1">当前: {toBeijing(showEdit.expires_at)}</p>}
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">允许的渠道 <span className="text-gray-400">（留空=全部渠道）</span></label>
              <button onClick={() => openChPicker('edit')}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 transition-colors">
                <span className="text-gray-700">
                  {editAllowedChannels.length === 0 ? '点击选择渠道...' : '已选择 ' + editAllowedChannels.length + ' 个渠道'}
                </span>
                <InlineIcon name="chevronDown" className="w-4 h-4 text-gray-400" />
              </button>
              {editAllowedChannels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {editAllowedChannels.map(cId => {
                    const ch = channels.find(c => c.id === cId);
                    return (
                      <span key={cId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-mono">
                        {ch?.name || cId}
                        <button onClick={() => {
                          const next = editAllowedChannels.filter(x => x !== cId);
                          setEditAllowedChannels(next);
                          loadEditModels(next);
                        }} className="hover:text-red-500"><InlineIcon name="x" className="w-3 h-3" /></button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">允许的模型 <span className="text-gray-400">（基于选择的渠道，留空=全部可用）</span></label>
              {editAllowedChannels.length === 0 ? (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">请先选择渠道</div>
              ) : modelLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5"><InlineIcon name="loaderCircle" className="w-3.5 h-3.5 animate-spin" /> 加载模型...</div>
              ) : (
                <ComboBox
                  options={editModelOptions}
                  value=""
                  onChange={() => {}}
                  allowCustom={true}
                  placeholder="搜索模型名称后回车添加..."
                  emptyText="该渠道无可用模型"
                  multi
                  selectedValues={editAllowedModels}
                  onSelectionChange={setEditAllowedModels}
                />
              )}
              {editAllowedModels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {editAllowedModels.map(m => (
                    <span key={m} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-mono">
                      {m}
                      <button onClick={() => setEditAllowedModels(editAllowedModels.filter(x => x !== m))} className="hover:text-red-500"><InlineIcon name="x" className="w-2.5 h-2.5" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleEditSave}
                className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">保存</button>
              <button onClick={() => { setShowEdit(null); setEditExpiry(''); setEditAllowedChannels([]); setEditAllowedModels([]); }}
                className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">取消</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Channel Picker Modal — on top of create/edit modal */}
      <Modal open={chPickerOpen} onClose={() => setChPickerOpen(false)} title="选择渠道" zIndex={9999}>
        <div className="space-y-3">
          <p className="text-xs text-gray-500">勾选此 Key 可以使用的渠道，留空=全部可用</p>
          <div className="max-h-60 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {channels.map(ch => {
              const checked = chPickerSelected.includes(ch.id);
              return (
                <label key={ch.id} className={'flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-sm ' + (checked ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-gray-100 hover:border-gray-200')}>
                  <input type="checkbox" checked={checked} onChange={() => {
                    setChPickerSelected(prev => checked ? prev.filter(x => x !== ch.id) : [...prev, ch.id]);
                  }} className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0" />
                  <span className="text-xs text-gray-700 truncate">{ch.name}</span>
                </label>
              );
            })}
            {channels.length === 0 && <p className="text-xs text-gray-400 text-center py-4 col-span-full">暂无渠道</p>}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={confirmChannels} className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">确认</button>
            <button onClick={() => setChPickerOpen(false)} className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">取消</button>
          </div>
        </div>
      </Modal>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-2.5 sm:px-3 py-2.5 font-medium text-gray-500 text-[11px]">名称</th>
                <th className="text-left px-2.5 sm:px-3 py-2.5 font-medium text-gray-500 text-[11px]">API Key</th>
                <th className="text-right px-2.5 sm:px-3 py-2.5 font-medium text-gray-500 text-[11px] hidden sm:table-cell">已消费(元)</th>
                <th className="text-right px-2.5 sm:px-3 py-2.5 font-medium text-gray-500 text-[11px] hidden sm:table-cell">金额上限(元)</th>
                <th className="text-center px-2.5 sm:px-3 py-2.5 font-medium text-gray-500 text-[11px]">状态</th>
                <th className="text-left px-2.5 sm:px-3 py-2.5 font-medium text-gray-500 text-[11px] hidden md:table-cell">模型限制</th>
                <th className="text-left px-2.5 sm:px-3 py-2.5 font-medium text-gray-500 text-[11px] hidden lg:table-cell">创建时间</th>
                <th className="text-left px-2.5 sm:px-3 py-2.5 font-medium text-gray-500 text-[11px] hidden lg:table-cell">到期时间</th>
                <th className="text-right px-2.5 sm:px-3 py-2.5 font-medium text-gray-500 text-[11px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center"><InlineIcon name="loaderCircle" className="w-5 h-5 animate-spin text-indigo-600 inline" /></td></tr>
              ) : keys.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">暂无 Key</td></tr>
              ) : keys.map((k) => {
                const expired = isExpired(k);
                const modelsList = k.allowed_models ? k.allowed_models.split(',').filter(Boolean) : [];
                return (
                <tr key={k.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-2.5 sm:px-3 py-2.5 text-gray-900 font-medium text-[11px] sm:text-xs">{k.name}</td>
                  <td className="px-2.5 sm:px-3 py-2.5">
                    <code className="font-mono text-[10px] sm:text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded truncate max-w-[120px] sm:max-w-none inline-block">
                      {k.key.slice(0, 16)}...
                    </code>
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 text-right text-gray-700 text-[11px] sm:text-xs hidden sm:table-cell">¥{k.total_spent.toFixed(2)}</td>
                  <td className="px-2.5 sm:px-3 py-2.5 text-right text-gray-700 text-[11px] sm:text-xs hidden sm:table-cell">{k.spend_limit > 0 ? '¥' + k.spend_limit.toFixed(2) : '∞'}</td>
                  <td className="px-2.5 sm:px-3 py-2.5 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium gap-1 ${
                      expired ? 'bg-red-50 text-red-600' :
                      k.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                      {expired ? <><InlineIcon name="clock" className="w-3 h-3" /> 过期</> : (k.is_active ? '启用' : '禁用')}
                    </span>
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 hidden md:table-cell">
                    {modelsList.length > 0 ? (
                      <Popover
                        trigger={
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-medium cursor-pointer hover:bg-gray-200 transition-colors">
                            <InlineIcon name="bot" className="w-3 h-3" />
                            {modelsList.length} 个模型
                            <InlineIcon name="chevronDown" className="w-2.5 h-2.5" />
                          </span>
                        }
                      >
                        <div className="space-y-1">
                          <p className="text-[10px] text-gray-400 font-medium mb-1.5">限制模型</p>
                          {modelsList.length > 10 ? (
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                              {modelsList.map(m => (
                                <div key={m} className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                  <code className="text-[11px] text-gray-700 font-mono break-all">{aliasMap[m] || m}</code>
                                </div>
                              ))}
                            </div>
                          ) : (
                            modelsList.map(m => (
                              <div key={m} className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                <code className="text-[11px] text-gray-700 font-mono whitespace-nowrap">{aliasMap[m] || m}</code>
                              </div>
                            ))
                          )}
                        </div>
                      </Popover>
                    ) : (
                      <span className="text-[10px] text-gray-400">全部</span>
                    )}
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 text-left text-[10px] text-gray-500 hidden lg:table-cell whitespace-nowrap">
                    {toBeijing(k.created_at)}
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 text-left text-[10px] whitespace-nowrap hidden lg:table-cell">
                    {k.expires_at ? (
                      <span className={expired ? 'text-red-500 font-medium' : 'text-gray-500'}>
                        {k.expires_at.slice(0, 10)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-2.5 sm:px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => copyKey(k.key, k.id)}
                        className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="复制">
                        {copiedId === k.id ? <InlineIcon name="check" className="w-3.5 h-3.5 text-emerald-500" /> : <InlineIcon name="copy" className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setRefreshConfirm({ id: k.id, name: k.name })}
                        className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        title="刷新 Key"
                      >
                        <InlineIcon name="refresh-cw" className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => {
                        setShowEdit(k);
                        setEditExpiry(k.expires_at ? k.expires_at.replace(' ', 'T').slice(0, 10) : '');
                        const channels = k.allowed_channels ? k.allowed_channels.split(',').filter(Boolean) : [];
                        setEditAllowedChannels(channels);
                        const models = k.allowed_models ? k.allowed_models.split(',').filter(Boolean) : [];
                        setEditAllowedModels(models);
                        loadEditModels(channels);
                      }}
                        className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="编辑">
                        <InlineIcon name="pencil" className="w-3.5 h-3.5" />
                      </button>
                      <Switch
                        checked={!!k.is_active}
                        onChange={() => handleToggle(k.id, k.is_active)}
                        size="sm"
                      />
                      <button onClick={() => setDeleteConfirm({ id: k.id })}
                        className="p-1.5 rounded text-red-300 hover:text-red-500 hover:bg-red-50">
                        <InlineIcon name="trash2" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!refreshConfirm}
        onClose={() => setRefreshConfirm(null)}
        onConfirm={() => handleRefreshKey(refreshConfirm!.id)}
        title="确认刷新 Key"
        message={`刷新 Key「${refreshConfirm?.name}」后旧 Key 将立即失效，确定继续？`}
        confirmText="确认刷新"
        variant="info"
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => handleDelete(deleteConfirm!.id)}
        title="确认删除"
        message="确定删除此 Key？此操作不可撤销。"
        confirmText="确认删除"
        variant="danger"
      />
    </div>
  );
}
