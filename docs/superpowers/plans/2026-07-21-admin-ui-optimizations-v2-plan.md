# Admin UI Optimizations V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 UI issues across keys, channels, and models admin pages

**Architecture:** 5 independent frontend-only fixes — no backend changes needed. Tasks 1-2 touch keys/page.tsx, Tasks 3-4 touch channels/page.tsx, Task 5 touches models/page.tsx and popover.tsx.

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + react-day-picker

## Global Constraints

- All icons must use existing Lucide icons from `public/icons/` (no CDN)
- All changes are frontend-only (no API/model/db changes)
- Follow existing patterns in each file (uncontrolled inputs with `defaultValue` + `document.getElementById()` for model editor fields)
- Light theme, white bg gray text, indigo-500 primary color

---

### Task 1: Key Expiry DateTimePicker → DatePicker

**Files:**
- Modify: `src/app/dashboard/keys/page.tsx` — import and JSX in edit modal, value format, save logic

**Interfaces:**
- Consumes: `DatePicker` from `@/lib/date-picker` (already exists, date-only variant)
- Produces: expiry value stored as `yyyy-MM-ddT00:00` for midnight-of-day expiry semantics

- [ ] **Step 1: Update import**

Change line 11:
```typescript
// Before:
import { DateTimePicker } from '@/lib/date-picker';
// After:
import { DatePicker } from '@/lib/date-picker';
```

- [ ] **Step 2: Replace DateTimePicker JSX with DatePicker in edit modal**

Find the edit modal's expiry field (~line 369-371):
```tsx
// Before:
<DateTimePicker value={editExpiry} onChange={(v) => setEditExpiry(v)}
  className="w-full" />
// After:
<DatePicker value={editExpiry} onChange={(v) => setEditExpiry(v)}
  className="w-full" />
```

- [ ] **Step 3: Fix editExpiry format when opening edit modal**

Find the modal-open handler (~line 571):
```typescript
// Before:
setEditExpiry(k.expires_at ? k.expires_at.replace(' ', 'T').slice(0, 16) : '');
// After:
setEditExpiry(k.expires_at ? k.expires_at.replace(' ', 'T').slice(0, 10) : '');
```

(DatePicker expects `yyyy-MM-dd` format, 10 chars, not `yyyy-MM-ddTHH:mm` at 16 chars.)

- [ ] **Step 4: Fix handleEditSave comparison and expiry value**

Find `handleEditSave` (~line 169-180):
```typescript
// Before:
    if (editExpiry === '') body.expires_at = null;
    else if (editExpiry !== (showEdit.expires_at || '').replace(' ', 'T').slice(0, 16)) body.expires_at = editExpiry;
// After:
    if (editExpiry === '') body.expires_at = null;
    else if (editExpiry !== (showEdit.expires_at || '').replace(' ', 'T').slice(0, 10)) body.expires_at = editExpiry + 'T00:00';
```

(Compare date-only, send with `T00:00` so server stores midnight-of-day for expiry.)

- [ ] **Step 5: Build and commit**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

Expected output: no TypeScript/ESLint errors.

```bash
git add src/app/dashboard/keys/page.tsx
git commit -m "fix: replace DateTimePicker with DatePicker for key expiry (date-only)"
```

---

### Task 2: Model Display Format — Show Original ID with Alias

**Files:**
- Modify: `src/app/dashboard/keys/page.tsx` — `getModelsForChannels()`, `loadCreateModels()`, `loadEditModels()`

**Interfaces:**
- Consumes: `ComboBox` component options format `{ label: string; value: string }[]`
- Produces: model options showing `model_id (alias_name)` when alias exists

- [ ] **Step 1: Rewrite `getModelsForChannels()` return type and logic**

Replace the function (~lines 72-101):

```typescript
const getModelsForChannels = useCallback(async (chIds: string[]): Promise<Array<{ label: string; value: string }>> => {
    const res = await apiFetch('/admin/channels?scope=models');
    if (!res.ok) return [];
    const d = await res.json();
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
```

- [ ] **Step 2: Update `loadCreateModels()`**

Find (~lines 103-110):
```typescript
// Before:
  const models = await getModelsForChannels(chIds);
  setCreateModelOptions(models.map(m => ({ label: m, value: m })));
  setNewAllowedModels(prev => prev.filter(m => models.includes(m)));
// After:
  const models = await getModelsForChannels(chIds);
  setCreateModelOptions(models);
  const modelValues = new Set(models.map(m => m.value));
  setNewAllowedModels(prev => prev.filter(m => modelValues.has(m)));
```

- [ ] **Step 3: Update `loadEditModels()`**

Find (~lines 112-119):
```typescript
// Before:
  const models = await getModelsForChannels(chIds);
  setEditModelOptions(models.map(m => ({ label: m, value: m })));
  setEditAllowedModels(prev => prev.filter(m => models.includes(m)));
// After:
  const models = await getModelsForChannels(chIds);
  setEditModelOptions(models);
  const modelValues = new Set(models.map(m => m.value));
  setEditAllowedModels(prev => prev.filter(m => modelValues.has(m)));
```

- [ ] **Step 4: Build and commit**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

Expected: no errors.

```bash
git add src/app/dashboard/keys/page.tsx
git commit -m "fix: show model_id with alias in parentheses in key model selector"
```

---

### Task 3: API Key Eye Toggle — Always Visible When Editing

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` — remove conditional from eye button

- [ ] **Step 1: Remove sentinel condition from eye toggle button**

Find the API Key input area (~lines 313-326):

```tsx
{/* Before: */}
                  <div className="relative">
                    <input type={showApiKey ? 'text' : 'password'} value={panelForm.api_key}
                      onChange={e => setPanelForm({...panelForm, api_key: e.target.value})}
                      className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                      placeholder={panelEditId ? '••••••••••••••••••' : 'sk-...'} />
                    {panelEditId && panelForm.api_key === '••••••••••••••••••' && (
                      <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600">
                        {showApiKey ? <InlineIcon name="eyeOff" className="w-4 h-4" /> : <InlineIcon name="eye" className="w-4 h-4" />}
                      </button>
                    )}
                  </div>

{/* After: */}
                  <div className="relative">
                    <input type={showApiKey ? 'text' : 'password'} value={panelForm.api_key}
                      onChange={e => setPanelForm({...panelForm, api_key: e.target.value})}
                      className="w-full px-3 py-2.5 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
                      placeholder={panelEditId ? '••••••••••••••••••' : 'sk-...'} />
                    {panelEditId && (
                      <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600">
                        {showApiKey ? <InlineIcon name="eyeOff" className="w-4 h-4" /> : <InlineIcon name="eye" className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
```

- [ ] **Step 2: Build and commit**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

Expected: no errors.

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "fix: always show API key eye toggle when editing channel"
```

---

### Task 4: Model Editor Save Structure Refactor

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` — add pending model state, rewrite model card UI, extend saveChannel

**Interfaces:**
- Consumes: existing `modelsForChannel()`, `aliasesForModel()`, `apiFetch()` — unchanged
- Produces: `pendingModels` state tracking staged model changes; extended `saveChannel()` that commits model changes alongside channel info

- [ ] **Step 1: Add `pendingModels` state**

Add near line 57 (after `pricingMap`):
```typescript
interface PendingModelChange {
  alias?: string;
  prices?: { prompt_price: string; completion_price: string; cached_prompt_price: string };
  staged: boolean;
  deleted?: boolean;
}
const [pendingModels, setPendingModels] = useState<Record<string, PendingModelChange>>({});
```

- [ ] **Step 2: Add handleModelSave and handleModelDelete functions**

Add before `saveChannel` (~line 84):
```typescript
const handleModelSave = (modelId: string) => {
  const getVal = (id: string) => (document.getElementById(id) as HTMLInputElement)?.value || '';
  const alias = getVal(`alias-input-${modelId}`);
  const p = getVal(`price-prompt-${modelId}`);
  const c = getVal(`price-completion-${modelId}`);
  const ch = getVal(`price-cached-${modelId}`);

  const hasPrice = p || c || ch;
  const validateDecimal = (v: string, label: string): boolean => {
    if (v === '' || v === '0') return true;
    if (!/^\d+\.\d+$/.test(v)) { alert(`${label} 价格必须包含小数点，如 28.0`); return false; }
    return true;
  };
  if (hasPrice) {
    if (!validateDecimal(p, '标准输入') || !validateDecimal(c, '输出') || !validateDecimal(ch, '缓存输入')) return;
  }

  setPendingModels(prev => ({ ...prev, [modelId]: { alias: alias || undefined, prices: hasPrice ? { prompt_price: p, completion_price: c, cached_prompt_price: ch } : undefined, staged: true, deleted: false } }));
};

const handleModelDelete = (modelId: string) => {
  if (!confirm('确定删除此模型？')) return;
  setPendingModels(prev => ({ ...prev, [modelId]: { ...(prev[modelId] || {}), deleted: true, staged: true, alias: undefined, prices: undefined } }));
};
```

- [ ] **Step 3: Extend `saveChannel()` to also commit model changes**

Replace `saveChannel` (~lines 84-90):
```typescript
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
        const m = models.find(m => m.model_id === modelId);
        if (m) await apiFetch(`/admin/channels?id=${m.id}&type=channel-model`, { method: 'DELETE' });
        continue;
      }
      if (change.alias !== undefined) {
        const m = models.find(m => m.model_id === modelId);
        if (!m) continue;
        const als = aliasesForModel(m.id);
        if (als[0]) await apiFetch(`/admin/channels?id=${als[0].id}&type=alias`, { method: 'DELETE' });
        if (change.alias) {
          await apiFetch('/admin/channels', { method: 'POST', body: JSON.stringify({ _type: 'alias', alias_name: change.alias, channel_model_id: m.id }) });
        }
      }
      if (change.prices) {
        await apiFetch('/admin/pricing', { method: 'POST', body: JSON.stringify({ model_id: modelId, prompt_price: Number(change.prices.prompt_price), completion_price: Number(change.prices.completion_price), cached_prompt_price: Number(change.prices.cached_prompt_price) }) });
      }
    }

    setPendingModels({});
    setShowApiKey(false);
    setSidePanelOpen(false);
    fetchAll();
  };
```

- [ ] **Step 4: Update model card expanded UI — remove individual buttons, add save/delete**

Find the expanded model card section (~lines 401-517). Replace the alias button area, pricing button, and delete button with unified save/delete:

**Alias section** (~lines 406-443): Remove the "更新"/"创建" button and "删除别名" link. Keep the input and the arrow label. Replace:
```tsx
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
                              </div>
                            </div>
```

**Pricing section** (~lines 445-509): Remove the "保存价格" button. Keep the three price inputs:
```tsx
                            {/* Pricing editor */}
                            <div>
                              <label className="block text-xs text-gray-500 mb-1.5">价格（元/1M tokens）</label>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <div className="text-[10px] text-gray-400 mb-0.5">标准输入</div>
                                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                                    <input type="text" inputMode="decimal"
                                      defaultValue={pricingMap[m.model_id]?.prompt_price ?? ''}
                                      id={`price-prompt-${m.id}`}
                                      className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" />
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-400 mb-0.5">输出</div>
                                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                                    <input type="text" inputMode="decimal"
                                      defaultValue={pricingMap[m.model_id]?.completion_price ?? ''}
                                      id={`price-completion-${m.id}`}
                                      className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" />
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] text-gray-400 mb-0.5">缓存输入</div>
                                  <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                                    <input type="text" inputMode="decimal"
                                      defaultValue={pricingMap[m.model_id]?.cached_prompt_price ?? ''}
                                      id={`price-cached-${m.id}`}
                                      className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden" />
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                                  </div>
                                </div>
                              </div>
                            </div>
```

**Delete model section** (~lines 512-516): Replace with unified bottom bar:
```tsx
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
```

**Deleted state indicator:** Add after the closing `</div>` of the expanded content, add a conditional class to the card wrapper if pending deletion:
```tsx
// When pendingModels[m.id]?.deleted is true, dim the card
const pend = pendingModels[m.id];
```
Use `pend?.deleted ? 'opacity-50 pointer-events-none' : ''` on the card's header and show a "待删除" badge:
Find the collapsed header (~line 380):
```tsx
                      <div key={m.id} className={`border border-gray-200 rounded-xl overflow-hidden mb-2 ${pendingModels[m.id]?.deleted ? 'opacity-50' : ''}`}>
```
And add a "待删除" badge next to the model name in the collapsed header:
```tsx
                          <code className="text-sm font-semibold text-gray-800 font-mono truncate">{m.model_id}</code>
                          {pendingModels[m.id]?.deleted && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200 shrink-0">待删除</span>
                          )}
```

- [ ] **Step 5: Clear pendingModels on all side panel close paths**

There are 4 close paths. Add `setPendingModels({})` to each:
1. Overlay click (~line 276): `onClick={() => { setPendingModels({}); setShowApiKey(false); setSidePanelOpen(false); }}`
2. Header X close (~line 284): `onClick={() => { setPendingModels({}); setShowApiKey(false); setSidePanelOpen(false); }}`
3. Cancel button (~line 553): `onClick={() => { setPendingModels({}); setShowApiKey(false); setSidePanelOpen(false); }}`
4. Escape key handler (~line 166): add `setPendingModels({})` inside the handler

- [ ] **Step 6: Build and commit**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

Expected: no errors.

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "refactor: unify model editor save — stage locally, commit via outer save"
```

---

### Task 5: Model Plaza Arrow Direction & Popover Left

**Files:**
- Modify: `src/lib/popover.tsx` — add `side` prop for left-side positioning
- Modify: `src/app/dashboard/models/page.tsx` — arrow icon, popover usage, alignment

- [ ] **Step 1: Add `side` prop to Popover component**

In `src/lib/popover.tsx`, extend the interface and update positioning:

**Interface change** (~line 6):
```typescript
interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'center';
  side?: 'bottom' | 'left';   // NEW
}
```

**Default parameter** (~line 19):
```typescript
  align = 'start',
  side = 'bottom',   // NEW
```

**Style calculation** (~lines 71-80). Replace:
```tsx
          style={{
            top: dropPos.top,
            left: dropPos.left,
            width: 'max-content',
            minWidth: Math.max(dropPos.width, 160),
          }}
```
With:
```tsx
          style={{
            top: dropPos.top,
            ...(side === 'left'
              ? { right: window.innerWidth - dropPos.left - 4 }
              : { left: dropPos.left }
            ),
            width: 'max-content',
            minWidth: Math.max(dropPos.width, 160),
          }}
```

- [ ] **Step 2: Update model plaza — arrow icon, popover side, alignment**

In `src/app/dashboard/models/page.tsx`, find the popover section (~lines 230-251):

Replace:
```tsx
                {/* 右侧悬浮箭头（多渠道时显示 Popover） */}
                {group.channels.length > 1 ? (
                  <Popover
                    trigger={
                      <span className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0 mt-0.5">
                        <InlineIcon name="arrowRight" className="w-3.5 h-3.5" />
                      </span>
                    }
                  >
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
                  <InlineIcon name={group.type === 'alias' ? 'arrowRight' : 'zap'} className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5" />
                )}
```

With:
```tsx
                {/* 左侧箭头（多渠道时显示 Popover） */}
                {group.channels.length > 1 ? (
                  <Popover side="left"
                    trigger={
                      <span className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0 mt-1">
                        <InlineIcon name="arrowLeft" className="w-3.5 h-3.5" />
                      </span>
                    }
                  >
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
                  <InlineIcon name={group.type === 'alias' ? 'arrowLeft' : 'zap'} className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-1" />
                )}
```

Changes: `side="left"`, `arrowRight`→`arrowLeft`, `mt-0.5`→`mt-1` (better vertical alignment with the first content line).

- [ ] **Step 3: Build and commit**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -20
```

Expected: no errors.

```bash
git add src/lib/popover.tsx src/app/dashboard/models/page.tsx
git commit -m "fix: model plaza arrow left, popover left-side positioning, alignment"
```

---

## Self-Review

**Spec coverage:**
1. ✅ Key expiry DatePicker → Task 1
2. ✅ Model display format → Task 2
3. ✅ API Key eye toggle always visible → Task 3
4. ✅ Model editor save restructure → Task 4
5. ✅ Model plaza arrow direction + popover left → Task 5

**Placeholder scan:** No TBD/TODO/incomplete sections. All code blocks are complete.

**Type consistency:** `PendingModelChange` interface defined in Task 4 Step 1 and used consistently in Steps 2-5. `side` prop added to Popover in Task 5 Step 1, used in Step 2.
