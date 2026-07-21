# Admin UI Optimizations V3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 independent UI issues across dashboard, keys, channels, and models pages

**Architecture:** All changes are frontend-only in Next.js App Router page components and a shared utility component. Each task modifies 1 file and is independently testable via `npm run build` + visual verification.

**Tech Stack:** Next.js 16 + TypeScript + Tailwind CSS v4 + Recharts (dashboard) + react-day-picker (DatePicker) + Lucide Icons

## Global Constraints

- All icons must use `<InlineIcon name="..." />` from `@/lib/icon` — no hardcoded SVG, no emoji replacements
- Colors use Tailwind v4 classes, no hardcoded hex values unless specified in spec
- All changes are frontend-only — no backend API changes
- Run `npm run build` before committing to verify no compilation errors
- All button hover effects must have `transition-all` for smooth animation

---

### Task 1: Dashboard Bar Chart Spacing & Tooltip

**Files:**
- Modify: `src/app/dashboard/page.tsx:206-219` (Token 消耗 chart)
- Modify: `src/app/dashboard/page.tsx:294-301` (Token 构成 chart)

**Interfaces:**
- No interfaces consumed or produced — standalone visual change to Recharts props

- [ ] **Step 1: Reduce maxBarSize and minWidth for 每日 Token 消耗 chart**

Replace the `BarChart` and `Tooltip` in the Token 消耗 section (around line 206-219):

```tsx
{/* Before */}
<div style={{ minWidth: Math.max(data.dailyStats.length * 40 + 80, 400) }}>
  <ResponsiveContainer width="100%" height={260}>
    <BarChart data={data.dailyStats} maxBarSize={36}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
      <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
      ...
```

```tsx
{/* After */}
<div style={{ minWidth: Math.max(data.dailyStats.length * 28 + 80, 400) }}>
  <ResponsiveContainer width="100%" height={260}>
    <BarChart data={data.dailyStats} maxBarSize={24}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
      <Tooltip
        contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', padding: '6px 10px' }}
        formatter={(value: any, name: string) => [value.toLocaleString(), name]}
        labelFormatter={(label: string) => label.slice(5)}
      />
      ...
```

- [ ] **Step 2: Apply same changes to Token 构成 chart**

Replace the `BarChart` and `Tooltip` in the Token 构成 section (around line 294-301):

```tsx
{/* Before */}
<BarChart data={data.dailyStats} maxBarSize={36}>
  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={26} />
  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
  ...
```

```tsx
{/* After */}
<BarChart data={data.dailyStats} maxBarSize={24}>
  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={26} />
  <Tooltip
    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', padding: '6px 10px' }}
    formatter={(value: any, name: string) => [value.toLocaleString(), name]}
    labelFormatter={(label: string) => label.slice(5)}
  />
  ...
```

- [ ] **Step 3: Build and verify**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -5
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
cd /d/project/mortal-api && git add src/app/dashboard/page.tsx && git commit -m "fix: reduce dashboard bar chart spacing and compact tooltip"
```

---

### Task 2: DatePicker Portal Fix

**Files:**
- Modify: `src/lib/date-picker.tsx` (full file)

**Interfaces:**
- `DatePicker` component interface unchanged — maintains `{ value: string; onChange: (date: string) => void; placeholder?: string; className?: string; }`
- Consumers (`keys/page.tsx`, `dashboard/page.tsx`) require no changes

- [ ] **Step 1: Refactor DatePicker to use portal + fixed positioning**

Replace the entire DatePicker component in `src/lib/date-picker.tsx`:

Add imports at top (after existing imports):
```tsx
import { createPortal } from 'react-dom';
```

Add state and refs inside component (replace the existing `const` block from line 55-57):
```tsx
const [open, setOpen] = useState(false);
const [dropPos, setDropPos] = useState<{ left: number; top: number } | null>(null);
const ref = useRef<HTMLDivElement>(null);
const btnRef = useRef<HTMLButtonElement>(null);

const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
const displayText = value || placeholder;
```

Replace the mouse handler `useEffect` (lines 62-72) — the event handler stays the same but add new scroll handler inside:
```tsx
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  };
  const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); } };
  if (open) { document.addEventListener('mousedown', handler); document.addEventListener('keydown', keyHandler); }
  return () => {
    document.removeEventListener('mousedown', handler);
    document.removeEventListener('keydown', keyHandler);
  };
}, [open]);
```

Add position calculation `useLayoutEffect` (after the mouse handler useEffect, before the `defaultCls` line):
```tsx
useLayoutEffect(() => {
  if (!open) { setDropPos(null); return; }
  const update = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setDropPos({ left: r.left, top: r.bottom + 4 });
  };
  update();
  window.addEventListener('scroll', update, true);
  window.addEventListener('resize', update);
  return () => {
    window.removeEventListener('scroll', update, true);
    window.removeEventListener('resize', update);
  };
}, [open]);
```

Replace the calendar popup JSX (lines 88-123) — change from absolute div to portal:
```tsx
{open && dropPos && createPortal(
  <div
    className="fixed z-[9999]"
    style={{ left: dropPos.left, top: dropPos.top }}
    onClick={(e) => e.stopPropagation()}
  >
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4">
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={(day) => {
          if (day && isValid(day)) {
            onChange(format(day, 'yyyy-MM-dd'));
            setOpen(false);
          }
        }}
        locale={zhCN}
        components={{ Nav: CustomNav }}
        classNames={{
          root: `${defaultCls.root} w-fit`,
          chevron: `${defaultCls.chevron} fill-indigo-500`,
          month_caption: 'text-sm font-semibold text-gray-900 text-center mb-2',
          weekday: 'hidden',
          week: 'flex',
          day: 'p-0',
          day_button: 'w-9 h-9 text-sm rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors',
          today: 'font-semibold text-indigo-600',
          selected: 'bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-semibold',
          outside: 'text-gray-300',
          nav: 'hidden',
        }}
        formatters={{
          formatCaption: (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月`,
        }}
      />
    </div>
  </div>,
  document.body
)}
```

- [ ] **Step 2: Build and verify**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -5
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd /d/project/mortal-api && git add src/lib/date-picker.tsx && git commit -m "fix: use portal+fixed positioning for DatePicker calendar to prevent modal clipping"
```

---

### Task 3: Channel Model Grid + Quick Add/Remove

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx:558-576`

**Interfaces:**
- No interfaces consumed or produced — standalone UI change within the existing side panel

- [ ] **Step 1: Replace the pulled models section with 3-column grid**

Replace the `{pulledModels[panelEditId]?.length > 0 && (...)}` block (around lines 558-576) with:

```tsx
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
```

- [ ] **Step 2: Build and verify**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -5
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd /d/project/mortal-api && git add src/app/dashboard/channels/page.tsx && git commit -m "fix: 3-column model grid with +/- quick add/remove buttons"
```

---

### Task 4: Model Plaza Arrow Position & Hover Fix

**Files:**
- Modify: `src/app/dashboard/models/page.tsx` (card layout section, around lines 197-252)

**Interfaces:**
- No interfaces consumed or produced — standalone layout restructure within the existing card

- [ ] **Step 1: Restructure card layout — group copy button and arrow into one container**

Current structure (inside the card `<div key={copyKey}>`, lines 200-252):
```tsx
<div className="flex items-start justify-between gap-2">
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-1.5 mb-0.5">
      <code className="text-sm font-semibold text-gray-900 font-mono truncate">{group.displayName}</code>
      {group.type === 'alias' ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0">别名</span>
      ) : (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 shrink-0">原生</span>
      )}
      <button onClick={() => copyToClipboard(group.displayName, copyKey)}
        className="ml-auto p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all shrink-0" title="复制模型名">
        {copied === copyKey
          ? <InlineIcon name="check" className="w-3.5 h-3.5 text-emerald-500" />
          : <InlineIcon name="copy" className="w-3.5 h-3.5" />}
      </button>
    </div>
    {group.type === 'alias' && (
      <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
        <span className="text-gray-300">实际请求: </span>{group.actualModel}
      </div>
    )}
    {/* 主渠道显示 */}
    <div className="flex items-center gap-1.5 mt-1.5">
      {healthDot(bestChannel.health)}
      <span className="text-xs text-gray-500 truncate">{bestChannel.name}</span>
      {!bestChannel.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">停用</span>}
      <span className="text-[10px] text-gray-400">{bestChannel.uptimePct}% 可用率</span>
    </div>
  </div>
  {/* 左侧箭头 */}
  {group.channels.length > 1 ? (
    <Popover side="left" trigger={
      <span className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0 mt-1">
        <InlineIcon name="arrowLeft" className="w-3.5 h-3.5" />
      </span>
    }>...
  ) : (
    <InlineIcon name={group.type === 'alias' ? 'arrowLeft' : 'zap'} className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-1" />
  )}
</div>
```

Replace with new structure — copy button moves into the action container, arrow loses `mt-1`:

```tsx
<div className="flex items-start justify-between gap-2">
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-1.5 mb-0.5">
      <code className="text-sm font-semibold text-gray-900 font-mono truncate">{group.displayName}</code>
      {group.type === 'alias' ? (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shrink-0">别名</span>
      ) : (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 shrink-0">原生</span>
      )}
      <div className="ml-auto flex items-center gap-0.5 shrink-0">
        <button onClick={() => copyToClipboard(group.displayName, copyKey)}
          className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all" title="复制模型名">
          {copied === copyKey
            ? <InlineIcon name="check" className="w-3.5 h-3.5 text-emerald-500" />
            : <InlineIcon name="copy" className="w-3.5 h-3.5" />}
        </button>
        {group.channels.length > 1 ? (
          <Popover side="left" trigger={
            <span className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer">
              <InlineIcon name="arrowLeft" className="w-3.5 h-3.5" />
            </span>
          }>
            {/* Popover content unchanged */}
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
          <span className="p-1 rounded text-gray-300">
            <InlineIcon name={group.type === 'alias' ? 'arrowLeft' : 'zap'} className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </div>
    {group.type === 'alias' && (
      <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
        <span className="text-gray-300">实际请求: </span>{group.actualModel}
      </div>
    )}
    {/* 主渠道显示 */}
    <div className="flex items-center gap-1.5 mt-1.5">
      {healthDot(bestChannel.health)}
      <span className="text-xs text-gray-500 truncate">{bestChannel.name}</span>
      {!bestChannel.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">停用</span>}
      <span className="text-[10px] text-gray-400">{bestChannel.uptimePct}% 可用率</span>
    </div>
  </div>
</div>
```

Key structural changes:
1. Copy button moves from `flex-1` inner div to new `div.ml-auto.flex.items-center.gap-0.5.shrink-0` container
2. Arrow `Popover` trigger and fallback icon are inside the same container
3. Arrow `mt-1` removed — both buttons at same vertical center
4. Fallback single-channel icon wrapped in `span.p-1.rounded` for same-size container

- [ ] **Step 2: Build and verify**

```bash
cd /d/project/mortal-api && npm run build 2>&1 | tail -5
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd /d/project/mortal-api && git add src/app/dashboard/models/page.tsx && git commit -m "fix: realign model plaza arrow with copy button, fix hover styles"
```

---

## Self-Review

**Spec coverage:**
- Task 1 covers spec §1: Dashboard bar chart spacing & tooltip (all 3 changes)
- Task 2 covers spec §2: DatePicker portal fix (all requirements)
- Task 3 covers spec §3: Channel model grid + quick add/remove (all requirements)
- Task 4 covers spec §4: Model plaza arrow fix (all 3 problems addressed)

**Placeholder scan:** No TBD, TODO, or placeholders. All code blocks are complete.

**Type consistency:** No shared interfaces between tasks — each is fully independent. `DatePicker` interface unchanged, no consumer changes needed.
