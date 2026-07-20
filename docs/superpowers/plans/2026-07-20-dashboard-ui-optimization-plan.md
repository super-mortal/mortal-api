# Dashboard & UI Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 UI optimization areas: dashboard layout, model plaza filters, channel management sidebar, call log cost display, and unified date picker.

**Architecture:** Each area modifies a separate page component or creates a new shared lib component. The side panel is built inline in the channels page using React state + CSS transitions. The date picker is a reusable lib component wrapping `react-day-picker` with Tailwind styling.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4, Recharts, react-day-picker v9, date-fns

## Global Constraints

- All icons must use Lucide Icons via `<InlineIcon name="...">` (local SVGs in `public/icons/`)
- Tailwind CSS v4 utilities only (no v3 deprecated classes)
- All components are `'use client'` — these are all interactive UI
- Permissions: npm install, file modifications under `src/`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`
- Run: `npm install`

- [ ] **Step 1: Install react-day-picker and date-fns**

```bash
npm install react-day-picker date-fns
```

- [ ] **Step 2: Verify installation**

Expected: `react-day-picker` and `date-fns` appear in `package.json` dependencies (not devDependencies).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-day-picker and date-fns dependencies"
```

---

### Task 2: Create Unified DatePicker Component

**Files:**
- Create: `src/lib/date-picker.tsx`

**Interfaces:**
- Consumes: `react-day-picker`, `date-fns`, existing `InlineIcon` component
- Produces: `<DatePicker>` — date-only picker with Tailwind-styled calendar popover
- Produces: `<DateTimePicker>` — date + time picker combining DatePicker with `<input type="time">`

- [ ] **Step 1: Create `src/lib/date-picker.tsx`**

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';
import { format, parse, isValid } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { createPortal } from 'react-dom';
import { InlineIcon } from './icon';

// ── DatePicker (date only) ─────────────────────────────────────

interface DatePickerProps {
  value: string;          // ISO date string e.g. "2026-07-20"
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  align?: 'left' | 'right';
}

export function DatePicker({
  value, onChange, placeholder = '选择日期',
  className = '', align = 'left',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const displayText = value || placeholder;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        <InlineIcon name="calendar" className="w-3.5 h-3.5 text-gray-400" />
        <span className={value ? 'font-medium' : 'text-gray-400'}>{displayText}</span>
      </button>

      {open && createPortal(
        <div
          className="fixed z-[9999]"
          style={{
            top: (btnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
            left: align === 'right'
              ? (btnRef.current?.getBoundingClientRect().right ?? 0) - 280
              : (btnRef.current?.getBoundingClientRect().left ?? 0),
          }}
        >
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3">
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
              classNames={{
                root: 'w-fit',
                months: 'relative',
                month: 'flex flex-col gap-2',
                nav: 'flex items-center justify-between mb-1',
                button_previous: 'p-1 rounded-md hover:bg-gray-100 text-gray-600',
                button_next: 'p-1 rounded-md hover:bg-gray-100 text-gray-600',
                month_caption: 'text-sm font-semibold text-gray-900 text-center',
                caption_label: 'text-sm font-medium',
                weekdays: 'flex',
                weekday: 'flex-1 text-xs text-gray-400 text-center py-1',
                week: 'flex',
                day: 'flex-1 p-0 text-center text-sm text-gray-700',
                day_button: 'w-8 h-8 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors mx-auto',
                selected: 'font-semibold',
                today: 'font-semibold',
                outside: 'text-gray-300',
                disabled: 'text-gray-300 opacity-50',
              }}
              formatters={{
                formatCaption: (date) => `${date.getFullYear()}年${date.getMonth() + 1}月`,
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── DateTimePicker (date + time) ───────────────────────────────

interface DateTimePickerProps {
  value: string;          // datetime-local compatible: "2026-07-20T00:00"
  onChange: (date: string) => void;
  className?: string;
}

export function DateTimePicker({ value, onChange, className = '' }: DateTimePickerProps) {
  const [dateVal, timeVal] = value ? value.split('T') : ['', ''];

  const handleDateChange = (d: string) => {
    onChange(`${d}T${timeVal || '00:00'}`);
  };

  const handleTimeChange = (t: string) => {
    onChange(`${dateVal || new Date().toISOString().slice(0, 10)}T${t}`);
  };

  return (
    <div className={`flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 px-3 py-1.5 ${className}`}>
      <InlineIcon name="clock" className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <DatePicker
        value={dateVal}
        onChange={handleDateChange}
        className="[&>button]:border-0 [&>button]:px-0 [&>button]:py-0 [&>button]:text-xs"
      />
      <span className="text-gray-300 shrink-0">—</span>
      <input
        type="time"
        value={timeVal}
        onChange={(e) => handleTimeChange(e.target.value)}
        className="text-xs border-0 bg-transparent focus:outline-none focus:ring-0 p-0 text-gray-700 w-20"
      />
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: No type errors in `src/lib/date-picker.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/date-picker.tsx
git commit -m "feat: add DatePicker and DateTimePicker components"
```

---

### Task 3: Model Plaza — Replace Native Selects with SelectFilter

**Files:**
- Modify: `src/app/dashboard/models/page.tsx` (lines 118-137)

- [ ] **Step 1: Replace the 3 native `<select>` elements**

In `src/app/dashboard/models/page.tsx`, add `SelectFilter` import if not already present. Then replace:

Old code (lines 117-138):
```tsx
{/* 右侧筛选 — 仅桌面 */}
<div className="hidden md:flex items-center gap-2 ml-auto">
  <select value={filterChannel} onChange={e => setFilterChannel(e.target.value)}
    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white">
    <option value="all">全部渠道</option>
    {channels.filter(c => c.is_active).map(c => (
      <option key={c.id} value={c.name}>{c.name}</option>
    ))}
  </select>
  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white">
    <option value="all">全部状态</option>
    <option value="正常">正常</option>
    <option value="异常">异常</option>
    <option value="停用">停用</option>
  </select>
  <select value={filterType} onChange={e => setFilterType(e.target.value)}
    className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white">
    <option value="all">全部类型</option>
    <option value="原生">原生模型</option>
    <option value="别名">别名映射</option>
  </select>
</div>
```

New code:
```tsx
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
      { label: '正常', value: '正常', color: 'green' },
      { label: '异常', value: '异常', color: 'red' },
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
```

Remove the `hidden md:flex` wrapper — `<SelectFilter>` already handles responsive display.

- [ ] **Step 2: Verify no regressions**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/models/page.tsx
git commit -m "fix: replace native select with SelectFilter in model plaza"
```

---

### Task 4: Call Logs — Add Cost TokenBadge

**Files:**
- Modify: `src/app/dashboard/logs/page.tsx` (lines 431-438)

- [ ] **Step 1: Add the cost TokenBadge**

In the expanded detail section, after the existing TokenBadge components (after line 438), add:

```tsx
<TokenBadge label="费用" value={log.cost ? `¥${log.cost.toFixed(6)}` : '¥0'} color="purple" />
```

The full tokens line becomes:
```tsx
<div className="flex flex-wrap gap-4 text-xs">
  <TokenBadge label="输入" value={log.prompt_tokens} />
  <TokenBadge label="输出" value={log.completion_tokens} />
  {log.cached_input_tokens > 0 && (
    <TokenBadge label="缓存输入" value={log.cached_input_tokens} color="emerald" />
  )}
  <TokenBadge label="未缓存输入" value={Math.max(0, log.prompt_tokens - (log.cached_input_tokens || 0))} color="amber" />
  <TokenBadge label="总 Token" value={log.total_tokens} color="indigo" />
  <TokenBadge label="费用" value={log.cost ? `¥${log.cost.toFixed(6)}` : '¥0'} color="purple" />
</div>
```

- [ ] **Step 2: Build check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/logs/page.tsx
git commit -m "feat: add cost badge to call log token stats"
```

---

### Task 5: Dashboard — Stat Cards 4×4 + Chart Layout Restructure + Horizontal Scroll

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Change stat cards grid from `lg:grid-cols-8` to `sm:grid-cols-4`**

Find: `className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3"`
Replace: `className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3"`

This changes 8-in-1-row to 4×4 two rows on tablet/desktop.

- [ ] **Step 2: Restructure chart layout**

**Before:** Charts are wrapped in:
```tsx
<div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
  {/* Daily Call Trends + Daily Token Consumption */}
</div>

{/* Cost Trends full width */}

<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
  {/* Model Distribution | Token Composition | Success Rate | Cost Ranking */}
</div>
```

**After:**

```tsx
{/* Row 1: Daily Call Trends — full width */}
<div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
  {/* ... existing content ... */}
</div>

{/* Row 2: Daily Token Consumption — full width + horizontal scroll */}
<div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
  {/* ... existing content but wrapped in scroll container ... */}
</div>

{/* Row 3: Cost Trends — full width */}
<div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
  {/* ... existing content ... */}
</div>

{/* Row 4: Model Distribution + Success Rate — 2 cols */}
<div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
  <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
    {/* Model Distribution — existing pie chart */}
  </div>
  <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
    {/* Success Rate — existing donut chart */}
  </div>
</div>

{/* Row 5: Token Composition + Cost Ranking — 2 cols */}
<div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
  <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
    {/* Token Composition — existing bar chart */}
  </div>
  <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
    {/* Cost Ranking — existing horizontal bar */}
  </div>
</div>
```

Move the chart content from the old grid into this new flat structure. The chart components themselves (AreaChart, BarChart, PieChart etc.) stay the same — only their container layout changes.

- [ ] **Step 3: Add horizontal scroll to Daily Token Consumption**

Wrap the BarChart for Daily Token Consumption in a scrollable container:

```tsx
{data.dailyStats.length > 0 ? (
  <div className="h-52 sm:h-64">
    <div className="overflow-x-auto w-full">
      <div style={{ minWidth: Math.max(data.dailyStats.length * 40 + 80, 400) }}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.dailyStats} maxBarSize={36}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
            <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
            <Bar dataKey="uncached_tokens" name="未缓存输入" fill="#f59e0b" stackId="a" />
            <Bar dataKey="cached_tokens" name="缓存输入" fill="#22c55e" stackId="a" />
            <Bar dataKey="completion_tokens" name="输出" fill="#8b5cf6" stackId="a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="flex items-center gap-3 sm:gap-4 mt-3 text-[10px] sm:text-xs text-gray-500">
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#f59e0b]" /> 未缓存输入</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#22c55e]" /> 缓存输入</span>
      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#8b5cf6]" /> 输出</span>
    </div>
  </div>
) : (
  <div className="h-52 sm:h-64 flex items-center justify-center text-sm text-gray-400">暂无数据</div>
)}
```

Key changes:
- `minWidth` is calculated as `data.dailyStats.length * 40 + 80` (40px per bar group + padding)
- `overflow-x-auto` on the outer div enables horizontal scroll
- At 7 days: `minWidth = 360px` — fits within normal container, unlikely to scroll
- At 30 days: `minWidth = 1280px` — scrollbar appears naturally

- [ ] **Step 4: Build check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: restructure dashboard layout and add horizontal scroll to bar chart"
```

---

### Task 6: Channel Management — Right Side Panel

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx`

This is the largest change. It touches:
1. Replace the expand chevron with a ⚙️ config button that opens the side panel
2. Remove existing expand/collapse model section (`expandedId` state and its JSX)
3. Remove existing Modal-based channel edit (the create/edit `chModal`)
4. Add new `SidePanel` component for right-side slide-out
5. Add collapsible model cards with inline alias + pricing editing
6. Keep all other buttons on the channel card unchanged

- [ ] **Step 1: Remove unused state and add side panel state**

Remove state:
- `expandedId` → remove
- `pullingId` → keep (used in panel)
- `pulledModels` → keep (used in panel)
- `modelModal` → remove (replaced by inline model management)
- `aliasModal` → remove (replaced by inline alias editing)
- `priceModal` → remove (replaced by inline pricing)
- `modelErrModal` → remove (not needed)

Keep:
- `chModal` → repurpose as `sidePanelOpen` (boolean)
- `editId` → keep
- `chForm` → keep

Add new state:
```tsx
const [sidePanelOpen, setSidePanelOpen] = useState(false);
```

- [ ] **Step 2: Replace expand chevron with config button**

In the channel card actions row, find the expand button (around line 343-348):

Old:
```tsx
<span className="group relative">
  <button onClick={() => setExpandedId(expanded ? null : ch.id)}
    className={'p-2 rounded-lg transition-all border ' + (expanded ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 border-transparent hover:border-gray-200')}>
    <InlineIcon name="chevronDown" className={'w-4 h-4 transition-transform ' + (expanded ? 'rotate-180' : '')} /></button>
  <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">{expanded ? '收起' : '展开'}</span>
</span>
```

New (after the Switch and before delete):
```tsx
<span className="group relative">
  <button onClick={() => { setChForm({ name: ch.name, base_url: ch.base_url, api_key: '', priority: ch.priority, notes: ch.notes }); setEditId(ch.id); setSidePanelOpen(true); }}
    className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-200"
    title="配置">
    <InlineIcon name="settings" className="w-4 h-4" /></button>
  <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">配置</span>
</span>
```

- [ ] **Step 3: Remove the expanded section JSX**

Remove the entire block:
```tsx
{expanded && (
  <div className="border-t border-gray-100 bg-gray-50/30 px-5 sm:px-6 py-5 space-y-4">
    {/* model management content */}
  </div>
)}
```

This content (model/alias management, pricing, pull models) will be moved into the side panel.

- [ ] **Step 4: Add the SidePanel component**

Before the component's return statement (or at the bottom of the file as a separate component), add:

```tsx
function SidePanel({
  open, onClose, title, children,
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-1/3 min-w-[380px] max-w-[520px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <InlineIcon name="x" className="w-4 h-4" />
          </button>
        </div>
        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
```

Add the import for `createPortal`:
```tsx
import { createPortal } from 'react-dom';
```

- [ ] **Step 5: Add SidePanel JSX in the return, at the end (before closing `</div>`)**

```tsx
<SidePanel open={sidePanelOpen} onClose={() => setSidePanelOpen(false)} title={`编辑渠道 - ${chForm.name}`}>
  {/* 基本信息 */}
  <div className="mb-6">
    <h4 className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
      <InlineIcon name="fileText" className="w-3.5 h-3.5" /> 基本信息
    </h4>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">名称</label>
        <input value={chForm.name} onChange={e => setChForm({...chForm, name: e.target.value})}
          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
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
        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" />
    </div>
    <div className="mt-3">
      <label className="block text-xs text-gray-500 mb-1">API Key <span className="text-gray-400">（加密存储）</span></label>
      <input type="password" value={chForm.api_key} onChange={e => setChForm({...chForm, api_key: e.target.value})}
        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder={editId ? '留空保持不变' : 'sk-...'} />
    </div>
    <div className="mt-3">
      <label className="block text-xs text-gray-500 mb-1">备注</label>
      <input value={chForm.notes} onChange={e => setChForm({...chForm, notes: e.target.value})}
        className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
    </div>
  </div>

  {/* 模型与别名 */}
  <div className="mb-6">
    <h4 className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
      <InlineIcon name="bot" className="w-3.5 h-3.5" /> 模型与别名
    </h4>
    {/* ... model cards, will be populated based on modelsForChannel(ch.id) */}
  </div>

  {/* Footer actions */}
  <div className="sticky bottom-0 bg-white pt-4 border-t border-gray-100">
    <div className="flex gap-3">
      <button onClick={saveChannel}
        className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
        💾 保存
      </button>
      <button onClick={() => setSidePanelOpen(false)}
        className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
        取消
      </button>
    </div>
  </div>
</SidePanel>
```

- [ ] **Step 6: Add collapsible model cards inside the side panel**

Inside the model section of the SidePanel, iterate over `modelsForChannel(editId || '')`:

```tsx
{modelsForChannel(editId || '').map(m => {
  const als = aliasesForModel(m.id);
  const alias = als.length > 0 ? als[0] : null;
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const isExpanded = expandedModel === m.id;
  
  return (
    <div key={m.id} className="border border-gray-200 rounded-xl overflow-hidden mb-2">
      {/* Collapsed header — always visible */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpandedModel(isExpanded ? null : m.id)}
      >
        {/* Original model */}
        <code className="text-sm font-semibold text-gray-800 font-mono truncate">{m.model_id}</code>
        <span className="text-gray-300 text-xs shrink-0">──→</span>
        {/* Alias */}
        {alias ? (
          <code className="text-sm font-semibold text-amber-700 font-mono truncate">{alias.alias_name}</code>
        ) : (
          <span className="text-xs text-gray-400 italic truncate">未设置别名</span>
        )}
        {/* Status tags */}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {(alias || pricingMap[m.model_id]) && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pricingMap[m.model_id] ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
              {pricingMap[m.model_id] ? '¥' : '未定价'}
            </span>
          )}
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
                    // Update existing alias — delete then create
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
                  <input
                    type="number" step="0.001"
                    defaultValue={pricingMap[m.model_id]?.prompt_price ?? ''}
                    id={`price-prompt-${m.id}`}
                    className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0"
                  />
                  <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 mb-0.5">输出</div>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <input
                    type="number" step="0.001"
                    defaultValue={pricingMap[m.model_id]?.completion_price ?? ''}
                    id={`price-completion-${m.id}`}
                    className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0"
                  />
                  <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-1.5 shrink-0">元/M</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 mb-0.5">缓存输入</div>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <input
                    type="number" step="0.001"
                    defaultValue={pricingMap[m.model_id]?.cached_prompt_price ?? ''}
                    id={`price-cached-${m.id}`}
                    className="w-full px-2 py-1.5 text-sm font-mono text-right border-0 focus:outline-none focus:ring-0"
                  />
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
          <button
            onClick={() => deleteModel(m.id)}
            className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
          >
            <InlineIcon name="trash2" className="w-3 h-3" /> 删除此模型
          </button>
        </div>
      )}
    </div>
  );
})}
```

Use `useState` inside the map — since this is inside the component, define this state change differently. Actually the model expand state should be a single string state in the parent, similar to the existing `expandedId` but renamed:

```tsx
const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
```

Then use `expandedModelId === m.id` instead of local state.

- [ ] **Step 7: Remove old unused Modals**

Remove these Modal JSX blocks from the return:
- Channel Create/Edit Modal (`chModal`)
- Add Model Modal (`modelModal`)
- Alias Modal (`aliasModal`)
- Pricing Modal (`priceModal`)

Keep:
- Health Check Modal (`checkModal`)
- ConfirmDialog for delete (`deleteConfirm`)
- ConfirmDialog for model error (`modelErrModal`) — or remove if models are managed inline

- [ ] **Step 8: Build check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/channels/page.tsx
git commit -m "feat: replace channel expand with right side panel"
```

---

### Task 7: Integrate DatePicker into Dashboard DateRangePicker and Logs Page

**Files:**
- Modify: `src/lib/date-range-picker.tsx`
- Modify: `src/app/dashboard/logs/page.tsx`

- [ ] **Step 1: Refactor `DateRangePicker` to use new `DatePicker`**

In `src/lib/date-range-picker.tsx`, replace the native `<input type="date">` with `<DatePicker>`:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { InlineIcon } from './icon';
import { DatePicker } from './date-picker';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DateRangePicker({
  startDate, endDate,
  onStartChange, onEndChange,
  onConfirm, onCancel,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleCancel();
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, localStart, localEnd]);

  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate]);

  const handleConfirm = () => {
    onStartChange(localStart);
    onEndChange(localEnd);
    onConfirm();
    setOpen(false);
  };

  const handleCancel = () => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
    onCancel();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all bg-indigo-600 text-white shadow-sm"
      >
        <InlineIcon name="calendar" className="w-3 h-3" />
        自定义
        <InlineIcon name="chevronDown" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 right-0 bg-white border border-gray-200 rounded-xl shadow-lg p-4 min-w-[260px]">
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">开始日期</label>
              <DatePicker
                value={localStart}
                onChange={(d) => setLocalStart(d)}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 mb-1">结束日期</label>
              <DatePicker
                value={localEnd}
                onChange={(d) => setLocalEnd(d)}
                className="w-full"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleConfirm}
                disabled={!localStart}
                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                确认
              </button>
              <button onClick={handleCancel}
                className="px-4 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace date inputs in logs page**

In `src/app/dashboard/logs/page.tsx`, replace the `<input type="datetime-local">` custom date filter with `DateTimePicker` and the `<input type="date">` batch delete dates with `DatePicker`.

For the custom date filter (around lines 281-290):
```tsx
{activeDate === 'custom' && (
  <div className="flex items-center gap-1.5 px-1">
    <DateTimePicker value={startMonth} onChange={(v) => { setStartMonth(v); setPage(0); }} />
  </div>
)}
```

For the batch delete modal dates (around lines 216-226):
```tsx
<div className="grid grid-cols-2 gap-3">
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1.5">开始日期</label>
    <DatePicker value={deleteDateFrom} onChange={setDeleteDateFrom} className="w-full" />
  </div>
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1.5">结束日期</label>
    <DatePicker value={deleteDateTo} onChange={setDeleteDateTo} className="w-full" />
  </div>
</div>
```

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/date-range-picker.tsx src/app/dashboard/logs/page.tsx
git commit -m "feat: integrate DatePicker into date-range-picker and logs page"
```

---

### Appendix — Changed Files Summary

| File | Change | Task |
|------|--------|------|
| `package.json` | Add `react-day-picker`, `date-fns` | 1 |
| `src/lib/date-picker.tsx` | **Create** — DatePicker + DateTimePicker | 2 |
| `src/app/dashboard/models/page.tsx` | Replace native `<select>` with SelectFilter | 3 |
| `src/app/dashboard/logs/page.tsx` | Add cost TokenBadge, replace date inputs | 4, 7 |
| `src/app/dashboard/page.tsx` | Stat cards 4×4, chart layout restructure, horizontal scroll | 5 |
| `src/app/dashboard/channels/page.tsx` | Right side panel, collapsible model cards, inline pricing | 6 |
| `src/lib/date-range-picker.tsx` | Refactor to use DatePicker | 7 |
