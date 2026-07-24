# Channels & Billing Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the channels page card layout (HealthBar centered + 24 dots + 96%|320ms), invert priority semantics, enable quick-delete on model rows, fix price-sync refresh, replace native `alert()` with the project's `ConfirmDialog`, beautify the price-sync toast, add an export dialog with `includeLatency`, give summary stats 4-color badges, and reshape the per-model billing summary table.

**Architecture:** Each task is a focused single-file or two-file change. UI tasks render and are verified visually in the dev server; logic tasks are verified via `npx tsc --noEmit` + manual interaction. A one-shot SQL migration reverses existing priority values before the new routing rule ships.

**Tech Stack:** Next.js 16 App Router, React, TypeScript strict, Tailwind v4, better-sqlite3, lucide icons (local), existing `ConfirmDialog` / `Modal` components.

## Global Constraints

- `npx tsc --noEmit` MUST exit 0 after each task.
- Default `0` for `priority` / spend limit means **"auto" / "unlimited"** — never treat 0 as invalid.
- All timestamps use `datetime('now', '+8 hours')` (Beijing time) — do NOT introduce UTC defaults.
- Lucide icons must already exist in `public/icons/*.svg`. If a new one is needed, add it to `scripts/download-lucide-icons.js` and run the downloader. **No CDN.**
- Use prepared statements for any new SQL.
- API key endpoint (`GET /admin/channels?scope=api-key&id=...`) MUST write `console.log('[api-key-view]', { channel_id, at })` if touched.
- `priority = 0` keeps the "自动" label; reversal only applies to non-zero priorities.
- The 24-dot HealthBar reads from `ch.recent_checks || []` (most recent first, oldest dropped).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/dashboard/channels/page.tsx` | UI: card layout (Task 1), quick-delete (Task 3), ConfirmDialog replacements (Task 5), toast style (Task 6), drag-priority (Task 2 left-side) |
| `src/lib/channels.ts` | Routing: `priority DESC` ordering (Task 2 right-side) |
| `src/app/dashboard/logs/page.tsx` | Export dialog (Task 7 UI), summary badges (Task 7 UI) |
| `src/lib/billing.ts` | `exportBillingExcel(..., includeLatency)` + per-model sheet (Tasks 7 + 8) |
| `scripts/reverse-channel-priorities.sql` | One-shot SQL migration (Task 9) |
| `docs/superpowers/specs/2026-07-24-channels-billing-polish-design.md` | Spec (already written) |

---

## Task Decomposition

- **Task 1** — Channels card layout (UI; biggest single change; needs visual review).
- **Task 2** — Priority semantics inversion (drag persistence + routing SQL + label).
- **Task 3** — Quick-delete on model row (immediate API DELETE, no confirm).
- **Task 4** — `refreshPricingMap()` after save (so synced channels re-render with new values).
- **Task 5** — Replace `alert()` calls in `handleModelSave` with project `ConfirmDialog`.
- **Task 6** — Price-sync toast → light card style (white bg, green border, ✓ checkmark).
- **Task 7** — Export dialog (checkbox for latency) + summary 4-color badges + `includeLatency` plumbing.
- **Task 8** — Per-model summary sheet (drop alias column, smart display, centered).
- **Task 9** — One-shot priority reversal SQL script.

---

## Tasks

### Task 1: Channels card layout (HealthBar centered + 24 dots + 96%|320ms)

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` line 461-516 (card markup) and `line 462-489` (inner row).

**Interfaces:**
- Consumes: `Channel.recent_checks`, `Channel.uptime_pct`, `Channel.avg_latency_ms`, `Channel.health_status`, `Channel.is_active`, `Channel.cooldown_until` (all already exist).
- Produces: visual card that matches v8 mockup — 3 horizontal blocks, middle block absolute-positioned at `left:50%`, all 24 dots single-row.

- [ ] **Step 1: Read the current card block** at `src/app/dashboard/channels/page.tsx` line 461-516. Confirm `ch.recent_checks`, `uptime_pct`, `avg_latency_ms` are populated from the backend (they are — see `src/lib/channels.ts` `formatChannel`).

- [ ] **Step 2: Replace the card markup (line 462-489)** with the three-block layout. Wrap the outer card container in `position: relative`:

```tsx
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
      {/* ...保留原 5 个按钮 (编辑/连通检测/展开/Switch/删除) — 见下方完整段 ... */}
      <span className="group relative">
        <button onClick={() => { setModalForm({ name: ch.name, base_url: ch.base_url, api_key: '••••••••••••••••••', priority: ch.priority, notes: ch.notes }); setModalEditId(ch.id); setChModal(true); }}
          className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all border border-transparent hover:border-blue-200"><InlineIcon name="pencil" className="w-4 h-4" /></button>
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">编辑</span>
      </span>
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
      <Switch checked={!!ch.is_active} onChange={() => toggleChannel(ch.id, ch.is_active)} />
      <span className="group relative">
        <button onClick={() => deleteChannel(ch.id)} className="p-2 rounded-lg text-red-300 hover:text-red-500 hover:bg-red-50 transition-all border border-transparent hover:border-red-200"><InlineIcon name="trash2" className="w-4 h-4" /></button>
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">删除</span>
      </span>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Remove the old `?` helpCircle tooltip** — delete the entire `<span className="group relative shrink-0">` block containing the helpCircle button (was line 467-474 in the v8 design, now in the new layout the badge has moved out so just remove that block). Also remove `<HealthBadge>` from Block A's name row.

- [ ] **Step 4: Verify the 24-dot slice logic** — `(ch.recent_checks || []).slice(0, 24)` takes the **most recent** 24. If fewer than 24 exist, pad with `{ ok: 1 }` (visual green) so the row always shows 24 dots. The `.concat(Array(...).fill({ ok: 1 }))` then `.slice(0, 24)` ensures exactly 24 dots are rendered.

- [ ] **Step 5: Run type check**

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Visual verify in browser**

```bash
cd /d/project/mortal-api
npm run dev
```

Open `http://localhost:3000/dashboard/channels`. Confirm:
- Each card shows: name on left, badge+24dots+`96%|320ms` floating centered, action buttons on right.
- No `?` icon, no name-side badge.
- Three states render correctly: green "正常", red "异常", amber "额度冷却".

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "refactor(channels): card layout v8 — HealthBar centered + 24 dots + 96%|320ms"
```

---

### Task 2: Invert priority semantics (bigger = higher)

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` line 382-407 (`handleDragEnd`).
- Modify: `src/lib/channels.ts` (routing/order SQL — find the `ORDER BY priority` clause).
- Modify: `src/app/dashboard/channels/page.tsx` line 555-558 (priority input placeholder/label).
- Create: `scripts/reverse-channel-priorities.sql` (run BEFORE new code deploys, see Task 9).

**Interfaces:**
- Consumes: `Channel.priority: number` (0 = 自动).
- Produces: drag persists `priority = count - idx`; routing orders `priority DESC`; UI label "数字越大优先级越高".

- [ ] **Step 1: Locate the routing/order SQL in `src/lib/channels.ts`**. Search for `ORDER BY priority` and read the surrounding `pickHealthyChannel` (or equivalent) function. Note: the function name may differ.

- [ ] **Step 2: Reverse drag persistence in `handleDragEnd`**

In `src/app/dashboard/channels/page.tsx` around line 393-402, change:

```ts
const results = await Promise.allSettled(
  reordered.map((ch, idx) =>
    apiFetch('/admin/channels', {
      method: 'PATCH',
      body: JSON.stringify({ id: ch.id, priority: idx }),
    })
  )
);
```

To:

```ts
const total = reordered.length;
const results = await Promise.allSettled(
  reordered.map((ch, idx) =>
    apiFetch('/admin/channels', {
      method: 'PATCH',
      body: JSON.stringify({ id: ch.id, priority: total - idx }),
    })
  )
);
```

(`priority = 0` is reserved for "自动"; users will not normally drag to position 0 because all rows get at least priority = 1.)

- [ ] **Step 3: Reverse the routing ORDER BY in `src/lib/channels.ts`**

Find the `ORDER BY priority ASC` (or equivalent) and change to `ORDER BY priority DESC`. **Critical:** if there is a `priority > 0` predicate, keep it. The change is ONLY direction.

- [ ] **Step 4: Update the priority input placeholder in `src/app/dashboard/channels/page.tsx` line 555-558**

Change the placeholder from `"优先级"` to `"数字越大越靠前"`. Example:

```tsx
<input
  type="number"
  value={panelForm.priority}
  onChange={e => setPanelForm({ ...panelForm, priority: Number(e.target.value) })}
  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
  placeholder="数字越大越靠前，0=自动"
/>
```

Also add a `<p className="text-[10px] text-gray-400 mt-1">数字越大优先级越高，0 表示自动分配</p>` directly below the input (optional but matches project patterns).

- [ ] **Step 5: Update the priority input in the modal** (`chModal`, around line 847-849) — same placeholder change.

- [ ] **Step 6: Type check**

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Verify in browser** that drag-reorder visually moves the channel and that `priority` numbers are now `total - idx` after a drag (DevTools → React → channel state, or check Network PATCH body).

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/channels/page.tsx src/lib/channels.ts
git commit -m "refactor(channels): invert priority semantics — bigger = higher"
```

---

### Task 3: Quick-delete on model row (no confirm)

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` line 227-234 (`handleModelDelete` + `confirmDeleteModel`) and line 668-673 (model-row trash2 `onClick`).

**Interfaces:**
- Consumes: `ChannelModel.id` from `modelsForChannel(panelEditId)`.
- Produces: row's trash2 button calls `quickDeleteModel(modelId)` which directly DELETEs and refreshes.

- [ ] **Step 1: Add `quickDeleteModel` function** above `handleModelDelete` (around line 226):

```ts
const quickDeleteModel = async (modelId: string) => {
  const models = modelsForChannel(panelEditId || '');
  const m = models.find(mm => mm.model_id === modelId);
  if (!m) return;
  await apiFetch(`/admin/channels?id=${m.id}&type=channel-model`, { method: 'DELETE' });
  fetchAll();
};
```

- [ ] **Step 2: Update model-row trash2 button** (line 668-673) — change `onClick`:

Before:
```tsx
<button type="button"
  onClick={(e) => { e.stopPropagation(); handleModelDelete(m.model_id); }}
  title="删除该 model"
  className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
  <InlineIcon name="trash2" className="w-3.5 h-3.5" />
</button>
```

After:
```tsx
<button type="button"
  onClick={(e) => { e.stopPropagation(); quickDeleteModel(m.model_id); }}
  title="删除该 model"
  className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
  <InlineIcon name="trash2" className="w-3.5 h-3.5" />
</button>
```

- [ ] **Step 3: Leave `handleModelDelete` (line 227-229) and `confirmDeleteModel` (line 230-234) untouched** — they're still used by the expanded panel's bottom-row "删除" button (line 758-761).

- [ ] **Step 4: Remove the now-unused `deleteModelConfirm` ConfirmDialog** (line 917-925) only if it becomes unreachable. **Wait — verify reachability first.** The expanded panel's "删除" button (line 758-761) still calls `handleModelDelete`, which still uses `deleteModelConfirm`. **Keep the dialog intact.** Only the row-trash2 path bypasses it.

- [ ] **Step 5: Type check**

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Manual verify in browser**

In dev server, expand a channel's side panel → click the trash2 on a collapsed row → confirm the row vanishes immediately, no dialog. The expanded-panel "删除" still pops a confirm.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "feat(channels): quick-delete on collapsed model row (no confirm)"
```

---

### Task 4: Refresh `pricingMap` after save (synced channels re-render)

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` line 134-149 (fetch + useEffect) and line 154-225 (`handleModelSave` + `saveChannel`).

**Interfaces:**
- Consumes: existing `/admin/pricing` GET response (`{ pricing: Array<{model_id, prompt_price, completion_price, cached_prompt_price}> }`).
- Produces: `refreshPricingMap()` helper, called after every successful price POST.

- [ ] **Step 1: Extract the pricing fetch into `refreshPricingMap`**

In `src/app/dashboard/channels/page.tsx`, locate the existing `useEffect` at line 141-149 (which fetches `/admin/pricing`). Replace its body with a call to a new memoized helper, and add the helper above `fetchAll`:

```ts
const refreshPricingMap = useCallback(async () => {
  const r = await apiFetch('/admin/pricing');
  if (r.ok) {
    const d = await r.json();
    const map: Record<string, any> = {};
    d.pricing.forEach((p: any) => { map[p.model_id] = p; });
    setPricingMap(map);
  }
}, []);

useEffect(() => { refreshPricingMap(); }, [refreshPricingMap]);
```

- [ ] **Step 2: Call `refreshPricingMap()` after successful price save in `handleModelSave`**

In `handleModelSave` (around line 205-217, inside the `if (priceRes.ok) { ... }` block), after `setTimeout(() => setSyncFeedback(null), 3000);`, add:

```ts
refreshPricingMap();
```

Same change in `saveChannel`'s pending-models commit loop (around line 277-286): after `setTimeout(() => setSyncFeedback(null), 3000);`, add:

```ts
refreshPricingMap();
```

- [ ] **Step 3: Verify pricing-input defaultValue binding**

Look at the price inputs in the expanded model card (around line 727-749). Each input uses `defaultValue={pricingMap[m.model_id]?.prompt_price ?? ''}`. Because `defaultValue` is only read on mount, when `pricingMap` changes after a sibling save, the **already-mounted** inputs WON'T re-render.

Fix: change `defaultValue` to `value` and add `onChange`. For three inputs:

```tsx
<input type="text" inputMode="decimal"
  value={pricingMap[m.model_id]?.prompt_price ?? ''}
  onChange={e => setPricingMap(prev => ({ ...prev, [m.model_id]: { ...prev[m.model_id], prompt_price: e.target.value } }))}
  id={`price-prompt-${m.model_id}`}
  className="..." />
```

Repeat for `price-completion-{modelId}` (key `completion_price`) and `price-cached-{modelId}` (key `cached_prompt_price`).

**Important:** `handleModelSave` reads via `document.getElementById(id)` (line 155-159). Switching from `defaultValue` to controlled `value` means changes also live in `pricingMap` — but the DOM-read path still works because the input's `value` reflects `pricingMap[...]`. **However, the in-progress edits the user typed before clicking 保存 may be overwritten** if `refreshPricingMap()` runs before the user clicks save. Acceptable: the save button reads DOM value (line 155) which is the latest typed value, and `refreshPricingMap()` only runs AFTER save success. The over-write only affects OTHER channels' inputs, not the one being edited.

- [ ] **Step 4: Type check**

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Manual verify**

In dev server:
1. Open two channels that share a model_id (e.g., both have `deepseek-v4-pro`).
2. In channel A's expanded panel, set prices for `deepseek-v4-pro` → click "保存" → toast appears.
3. Expand channel B's side panel → the price inputs for `deepseek-v4-pro` should now show the values you just saved in A.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "fix(channels): refresh pricingMap after save — synced channels re-render"
```

---

### Task 5: Replace `alert()` with `ConfirmDialog` in channels page

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` — multiple lines.

**Interfaces:**
- Consumes: existing `ConfirmDialog` import (line 7).
- Produces: all `alert(...)` calls in `handleModelSave` replaced with `setModelValidationError(...)` + a `<ConfirmDialog open={!!modelValidationError} variant="info">`.

- [ ] **Step 1: Add new state** near line 112:

```ts
const [modelValidationError, setModelValidationError] = useState<string | null>(null);
```

- [ ] **Step 2: Replace the 5 `alert()` calls in `handleModelSave` (lines 164, 174, 181, 188, 214, 223)** with `setModelValidationError(...)`:

```ts
// line 164 (validateDecimal)
if (!/^\d+\.\d+$/.test(v)) { setModelValidationError(`${label} 价格必须包含小数点，如 28.0`); return false; }

// line 174 (m not found)
if (!m) { setModelValidationError('模型不存在'); return; }

// line 181 (delete old alias fail)
if (!delRes.ok) { setModelValidationError('删除旧别名失败'); return; }

// line 188 (create alias fail)
if (!createRes.ok) { setModelValidationError('创建别名失败'); return; }

// line 214 (save price fail)
else { setModelValidationError('保存价格失败'); return; }
```

- [ ] **Step 3: Replace the final `catch` block alert** (line 223):

Before:
```ts
} catch (e) {
  alert('保存失败: ' + (e instanceof Error ? e.message : String(e)));
}
```

After:
```ts
} catch (e) {
  setModelValidationError('保存失败: ' + (e instanceof Error ? e.message : String(e)));
}
```

- [ ] **Step 4: Add the ConfirmDialog JSX** near the bottom (after the existing `modelErrModal` ConfirmDialog around line 908-916):

```tsx
<ConfirmDialog
  open={!!modelValidationError}
  onClose={() => setModelValidationError(null)}
  onConfirm={() => setModelValidationError(null)}
  title="提示"
  message={modelValidationError || ''}
  confirmText="知道了"
  variant="info"
/>
```

- [ ] **Step 5: Type check**

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Manual verify**

In dev server, trigger each error path:
- Type `abc` into a price input → click 保存 → see project ConfirmDialog (not browser alert).
- The "添加" model button with duplicate model_id → see project dialog.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "refactor(channels): replace alert() with ConfirmDialog in model save"
```

---

### Task 6: Price-sync toast → light card style

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` line 926-930.

**Interfaces:**
- Consumes: `syncFeedback: string | null` (existing).
- Produces: white-bg + green-border + ✓-prefixed card instead of solid green.

- [ ] **Step 1: Replace the toast block** (line 926-930):

Before:
```tsx
{syncFeedback && (
  <div className="fixed top-4 right-4 z-[100] bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-in slide-in-from-top-2">
    {syncFeedback}
  </div>
)}
```

After:
```tsx
{syncFeedback && (
  <div className="fixed top-4 right-4 z-[100] bg-white border border-emerald-200 px-4 py-3 rounded-xl shadow-lg text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
    <span className="inline-flex w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full items-center justify-center text-xs font-bold">✓</span>
    <span className="text-gray-700">{syncFeedback}</span>
  </div>
)}
```

- [ ] **Step 2: Type check**

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Manual verify**

Trigger a price sync (change price in channel A's expanded panel → click 保存). Toast appears top-right with white bg, green border, green ✓ check, dark text — auto-dismisses after 3s.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "style(channels): price-sync toast → light card with green check"
```

---

### Task 7: Export dialog + summary 4-color badges + `includeLatency` plumbing

**Files:**
- Modify: `src/app/dashboard/logs/page.tsx` (state + dialog JSX + summary markup + export trigger).
- Modify: `src/lib/billing.ts` (accept `includeLatency` parameter and dynamically build columns).

**Interfaces:**
- Consumes: existing `Modal`, `ConfirmDialog` components; existing `exportBillingExcel` signature.
- Produces: `exportBillingExcel(..., includeLatency: boolean)`; logs page passes the user's choice.

- [ ] **Step 1: Update `exportBillingExcel` signature in `src/lib/billing.ts`**

Find the function signature (likely `exportBillingExcel(records: ..., summary: ...)` or similar). Add a parameter:

```ts
export function exportBillingExcel(
  records: DetailRow[],
  summary: SummaryData,
  options: { includeLatency: boolean; modelSummary: ModelSummaryRow[] }
) {
  // ...
}
```

- [ ] **Step 2: Conditionally include the latency column** in the detail sheet's `CENTER_COLS` and `colDef1`:

```ts
const latencyCol = options.includeLatency
  ? [{ key: 'latency_ms' as const, header: '延迟 (ms)', width: 12, align: 'center' as const }]
  : [];

const detailCols: Array<{ key: keyof DetailRow; header: string; width: number; align: 'left' | 'center' | 'right' }> = [
  { key: 'time',        header: '时间',     width: 20, align: 'center' as const },
  { key: 'key_name',    header: 'Key',     width: 18, align: 'center' as const },
  { key: 'channel',     header: '渠道',     width: 14, align: 'center' as const },
  { key: 'model',       header: '模型',     width: 22, align: 'center' as const },
  { key: 'input_tokens',  header: '输入',  width: 12, align: 'center' as const },
  { key: 'output_tokens', header: '输出',  width: 12, align: 'center' as const },
  { key: 'cached_tokens', header: '缓存',  width: 12, align: 'center' as const },
  { key: 'cost',        header: '费用(元)', width: 12, align: 'center' as const },
  ...latencyCol, // <-- inserts or omits 延迟 (ms) column
  { key: 'status',      header: '状态',     width: 10, align: 'center' as const },
];
```

- [ ] **Step 3: Add export dialog state in `src/app/dashboard/logs/page.tsx`**

Add near the existing export-related state:

```ts
const [exportDialogOpen, setExportDialogOpen] = useState(false);
const [includeLatency, setIncludeLatency] = useState(true);
```

- [ ] **Step 4: Replace the export-button onClick** with `setExportDialogOpen(true)` instead of calling the export directly.

Before (likely):
```tsx
<button onClick={() => exportBillingExcel(...)}>导出账单</button>
```

After:
```tsx
<button onClick={() => setExportDialogOpen(true)}>导出账单</button>
```

- [ ] **Step 5: Add the Modal JSX** right after the existing `<Modal>` blocks:

```tsx
<Modal
  open={exportDialogOpen}
  onClose={() => setExportDialogOpen(false)}
  title="导出账单"
>
  <div className="space-y-3">
    <p className="text-xs text-gray-500">时间范围: {startDate} ~ {endDate} · 共 {totalRecords} 条记录</p>
    <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
      includeLatency ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'
    }`}>
      <input
        type="checkbox"
        checked={includeLatency}
        onChange={e => { setIncludeLatency(e.target.checked); }}
        className="mt-1 accent-indigo-600"
      />
      <div>
        <div className="text-sm font-semibold text-gray-900">包含延迟 (latency_ms) 列</div>
        <div className="text-xs text-gray-500 mt-0.5">每个请求耗时，便于排查慢调用</div>
      </div>
    </label>
    <label className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
      !includeLatency ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white'
    }`}>
      <input
        type="checkbox"
        checked={!includeLatency}
        onChange={e => { if (e.target.checked) setIncludeLatency(false); }}
        className="mt-1 accent-indigo-600"
      />
      <div>
        <div className="text-sm font-medium text-gray-700">不包含延迟列</div>
        <div className="text-xs text-gray-500 mt-0.5">表格更精简</div>
      </div>
    </label>
    <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
      <button onClick={() => setExportDialogOpen(false)}
        className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
        取消
      </button>
      <button onClick={() => {
        exportBillingExcel(records, summary, { includeLatency, modelSummary });
        setExportDialogOpen(false);
      }}
        className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
        确认导出
      </button>
    </div>
  </div>
</Modal>
```

- [ ] **Step 6: Replace the summary markup** (around line 200+ where the summary card lives) with the 4-color badge layout:

```tsx
<div className="flex flex-wrap gap-2.5">
  <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-md">
    <span className="text-xs text-blue-500 font-medium">总请求</span>
    <span className="text-sm text-blue-800 font-bold font-mono">{totalRequests.toLocaleString()}</span>
  </div>
  <div className="inline-flex items-center gap-1.5 bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-md">
    <span className="text-xs text-purple-500 font-medium">总 Tokens</span>
    <span className="text-sm text-purple-800 font-bold font-mono">{totalTokens.toLocaleString()}</span>
  </div>
  <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-md">
    <span className="text-xs text-emerald-500 font-medium">总费用</span>
    <span className="text-sm text-emerald-800 font-bold font-mono">¥ {totalCost.toFixed(4)}</span>
  </div>
  <div className="inline-flex items-center gap-1.5 bg-cyan-50 border border-cyan-200 px-2.5 py-1.5 rounded-md">
    <span className="text-xs text-cyan-500 font-medium">平均延迟</span>
    <span className="text-sm text-cyan-800 font-bold font-mono">{avgLatency}ms</span>
  </div>
</div>
```

- [ ] **Step 7: Type check**

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 8: Manual verify**

1. Click "导出账单" → dialog opens.
2. Toggle "包含延迟" / "不包含" → highlight swaps.
3. Click "确认导出" → XLSX downloads. Open it: with latency checked, the 延迟 (ms) column exists; unchecked, no such column.

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/logs/page.tsx src/lib/billing.ts
git commit -m "feat(logs): export dialog with includeLatency + 4-color summary badges"
```

---

### Task 8: Per-model summary sheet — drop alias column, smart display, centered

**Files:**
- Modify: `src/lib/billing.ts` — the "按模型汇总" sheet builder.

**Interfaces:**
- Consumes: `ModelSummaryRow[]` shape (probably `{ model_id, alias_name?, count, total_tokens, total_cost }`).
- Produces: 4-column sheet with `模型ID | 调用次数 | 总 Tokens | 总费用`, all centered, smart model-id display.

- [ ] **Step 1: Locate the per-model sheet builder** in `src/lib/billing.ts`. It currently has both `模型ID` and `模型别名` columns.

- [ ] **Step 2: Replace the model-summary sheet definition**

Before (likely):
```ts
const modelCols = [
  { key: 'model_id', header: '模型ID', width: 22 },
  { key: 'alias_name', header: '模型别名', width: 18 },
  { key: 'count', header: '调用次数', width: 12 },
  { key: 'total_tokens', header: '总 Tokens', width: 14 },
  { key: 'total_cost', header: '总费用', width: 12 },
];
```

After:
```ts
const modelCols = [
  { key: 'display_id', header: '模型ID', width: 22 },
  { key: 'count',       header: '调用次数', width: 12 },
  { key: 'total_tokens', header: '总 Tokens', width: 14 },
  { key: 'total_cost',  header: '总费用', width: 12 },
];
```

- [ ] **Step 3: Build display rows with smart model-id**

```ts
const modelSummaryData = modelSummary.map(m => ({
  display_id: m.alias_name || m.model_id,
  count: m.count,
  total_tokens: m.total_tokens.toLocaleString(),
  total_cost: `¥ ${m.total_cost.toFixed(4)}`,
}));
```

- [ ] **Step 4: Apply centered alignment to all cells** in this sheet:

```ts
const modelSheet = XLSX.utils.json_to_sheet(modelSummaryData);
const modelRange = XLSX.utils.decode_range(modelSheet['!ref']!);
for (let R = modelRange.s.r; R <= modelRange.e.r; R++) {
  for (let C = modelRange.s.c; C <= modelRange.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: C });
    if (!modelSheet[addr]) continue;
    modelSheet[addr].s = {
      ...modelSheet[addr].s,
      alignment: { horizontal: 'center', vertical: 'center' },
    };
  }
}
modelSheet['!cols'] = modelCols.map(c => ({ wch: c.width }));
```

- [ ] **Step 5: Optional color hint for aliased vs unaliased rows** — skip if it complicates code; center alignment is the main goal.

- [ ] **Step 6: Type check**

```bash
cd /d/project/mortal-api
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 7: Manual verify**

Export a billing file → open the "按模型汇总" sheet → confirm:
- Only 4 columns: 模型ID, 调用次数, 总 Tokens, 总费用.
- Header text "模型ID" appears in every export.
- Cells with an alias show the alias; cells without show the model_id.
- All cells centered.

- [ ] **Step 8: Commit**

```bash
git add src/lib/billing.ts
git commit -m "refactor(billing): per-model summary — drop alias column, smart display, centered"
```

---

### Task 9: Reverse priority values in DB (one-shot)

**Files:**
- Create: `scripts/reverse-channel-priorities.sql`.

**Interfaces:**
- Consumes: `channels.priority` (INTEGER).
- Produces: non-zero priorities negated, so existing data matches the new "bigger = higher" semantics.

- [ ] **Step 1: Write the reversal SQL**

Create `scripts/reverse-channel-priorities.sql`:

```sql
-- Run this once before deploying Task 2's code.
-- Reverses priority so that previously-small-now-big ordering matches.
-- 0 (auto) is preserved.

BEGIN TRANSACTION;

UPDATE channels
SET priority = -priority
WHERE priority != 0 AND priority > 0;

COMMIT;

-- Verify
SELECT id, name, priority FROM channels ORDER BY priority DESC;
```

- [ ] **Step 2: Document the run sequence in a comment** at the top of the file:

```sql
-- USAGE:
--   cd /d/project/mortal-api
--   sqlite3 data/relay.db < scripts/reverse-channel-priorities.sql
-- Run BEFORE deploying the code change from Task 2.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/reverse-channel-priorities.sql
git commit -m "chore(channels): one-shot SQL to reverse priority values"
```

- [ ] **Step 4: Manually run on dev DB** (optional, for verification)

```bash
cd /d/project/mortal-api
sqlite3 data/relay.db < scripts/reverse-channel-priorities.sql
```

Expected: prints the channel list ordered by descending priority.

---

## Self-Review (against spec)

| Spec Section | Covered By |
|---|---|
| ① Card layout (v8) | Task 1 |
| ② Priority inversion + SQL reversal | Tasks 2 + 9 |
| ③ Quick-delete on row | Task 3 |
| ④ Refresh pricingMap | Task 4 |
| ⑤ alert() → ConfirmDialog | Task 5 |
| ⑥ Toast → light card | Task 6 |
| ⑦ Export dialog + summary badges | Task 7 |
| ⑧ Per-model summary reshape | Task 8 |

No gaps. All section types (UI/logic/data) have at least one task. The drag-reorder change in Task 2 includes a hint that the implementer should look at the actual function name in `src/lib/channels.ts` (not assumed) — Task 1 has the same "find the function" pattern for `HealthBadge`. No placeholders. No type-name drift between tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-24-channels-billing-polish-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?