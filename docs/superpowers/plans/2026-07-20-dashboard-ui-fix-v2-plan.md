# Dashboard UI Fix V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix DatePicker month navigation bug, remove duplicate dashboard chart, restore channel Modal editing, improve error reporting

**Architecture:** Four changes — (1) DatePicker core fix (portal→absolute, custom nav arrows, hide weekday); (2) dashboard layout cleanup (remove duplicate chart + inline custom date pickers); (3) channel management (add/edit Modal + side panel co-exist); (4) upstream error fallback improvement. Task 2 depends on Task 1's DatePicker fixes. Task 3 and 4 are independent.

**Tech Stack:** Next.js 16, react-day-picker v10, Tailwind CSS v4, Lucide icons (local SVG)

## Global Constraints

- All icons must use `<InlineIcon name="..." />` component (local SVGs)
- New icons must be added to `scripts/download-lucide-icons.js` `neededIcons` array first, then `node scripts/download-lucide-icons.js`
- Side panel width: `w-1/2 min-w-[480px] max-w-[640px]`
- DatePicker: no `createPortal`, use `position: absolute` within relative parent
- DatePicker nav: 4 buttons (`chevronsLeft` = prev year, `chevronLeft` = prev month, `chevronRight` = next month, `chevronsRight` = next year); use `react-day-picker`'s `useDayPicker` hook and `goToMonth()` method
- DatePicker weekday row: hidden
- Modal and side panel channel editing must use independent state objects

---

### Task 1: Fix DatePicker — portal→absolute, custom nav arrows, hide weekday

**Files:**
- Modify: `src/lib/date-picker.tsx`
- Modify: `scripts/download-lucide-icons.js`
- Run: `node scripts/download-lucide-icons.js`

**Interfaces:**
- Consumes: existing `<DatePicker>` and `<DateTimePicker>` component API (props unchanged)
- Produces: fixed DatePicker with working nav, hidden weekdays

**Overview:**
The core bug is that `createPortal` renders the calendar popup to `document.body`, outside the div that the click-outside handler guards. Clicking any calendar element (including navigation arrows) fires the mousedown listener and calls `setOpen(false)`. Fix: remove `createPortal`, use `position: absolute` inside the relative parent. Also add double-arrow year navigation and hide the weekday row.

- [ ] **Step 1: Check required Lucide icons**

Edit `scripts/download-lucide-icons.js`. Find the `neededIcons` array and add `chevronsLeft` and `chevronsRight` if not already present:

Run: `grep -n "chevronsLeft\|chevronsRight" scripts/download-lucide-icons.js`

If either is missing, add them inside the array:
```js
'chevronsLeft',
'chevronsRight',
```

Then run:
```bash
node scripts/download-lucide-icons.js
```

- [ ] **Step 2: Rewrite DatePicker to remove createPortal and use absolute positioning**

Replace the calendar popup portion of `src/lib/date-picker.tsx`. The `day_button`, `weekday`, `nav`, `button_previous`, and `button_next` classNames need to still be present. Key changes:

1. Remove the `createPortal` import
2. Change the popup wrapper from `createPortal(...)` to a plain div positioned absolutely
3. Add four nav buttons for month/year navigation

The full file after changes:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { DayPicker, getDefaultClassNames, useDayPicker } from 'react-day-picker';
import { format, parse, isValid, addMonths, subMonths, addYears, subYears } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { InlineIcon } from './icon';

// ── Custom Nav component ────────────────────────────────────

function CustomNav() {
  const { goToMonth, currentMonth } = useDayPicker();

  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => goToMonth(subYears(currentMonth, 1))}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors" title="上一年">
          <InlineIcon name="chevronsLeft" className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => goToMonth(subMonths(currentMonth, 1))}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors" title="上一月">
          <InlineIcon name="chevronLeft" className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => goToMonth(addMonths(currentMonth, 1))}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors" title="下一月">
          <InlineIcon name="chevronRight" className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => goToMonth(addYears(currentMonth, 1))}
          className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors" title="下一年">
          <InlineIcon name="chevronsRight" className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── DatePicker (date only) ─────────────────────────────────────

interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  align?: 'left' | 'right';
}

export function DatePicker({
  value, onChange, placeholder = '选择日期',
  className = '',
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
    const keyHandler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    if (open) { document.addEventListener('mousedown', handler); document.addEventListener('keydown', keyHandler); }
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open]);

  const defaultCls = getDefaultClassNames();

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        <InlineIcon name="calendar" className="w-3.5 h-3.5 text-gray-400" />
        <span className={value ? 'font-medium' : 'text-gray-400'}>{displayText}</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1" style={{ left: 0 }}>
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
              components={{
                Nav: CustomNav,
              }}
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
                nav: 'hidden', // Hide default nav, using CustomNav
              }}
              formatters={{
                formatCaption: (date: Date) => `${date.getFullYear()}年${date.getMonth() + 1}月`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── DateTimePicker (date + time) ───────────────────────────────

interface DateTimePickerProps {
  value: string;
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

- [ ] **Step 3: Verify TypeScript build passes for date-picker.tsx**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: no errors related to src/lib/date-picker.tsx, CustomNav, or `useDayPicker`.

- [ ] **Step 4: Commit**

```bash
git add scripts/download-lucide-icons.js src/lib/date-picker.tsx public/icons/chevronsLeft.svg public/icons/chevronsRight.svg
git commit -m "fix: DatePicker portal→absolute, custom nav arrows, hide weekday"
```

---

### Task 2: Dashboard — custom date inline + remove duplicate chart

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `DatePicker` from `@/lib/date-picker` (already imported via `DateRangePicker`, now imported directly)
- Consumes: `fetchStats` callback (for custom date confirm → refresh)

**Overview:**
Two changes to the dashboard page:
1. Replace the nested `DateRangePicker` popover with direct inline `DatePicker` instances when custom date is selected
2. Remove the duplicate "Token 构成" bar chart from the Row 5 grid

- [ ] **Step 1: Add direct DatePicker import**

At the top of `src/app/dashboard/page.tsx`, add `DatePicker` alongside the existing `DateRangePicker` import:

```tsx
import { DatePicker } from '@/lib/date-picker';
import { DateRangePicker } from '@/lib/date-range-picker';
```
Note: Keep the `DateRangePicker` import as it may be used elsewhere. But actually after this change it won't be used — remove the import.

Old:
```tsx
import { DateRangePicker } from '@/lib/date-range-picker';
```

New:
```tsx
import { DatePicker } from '@/lib/date-picker';
```

Also remove `DateRangePicker` import — keep `DatePicker` only.

- [ ] **Step 2: Replace custom date popover with inline DatePickers**

Find this block (around line 133-141):

```tsx
          {showCustom && (
            <DateRangePicker
              startDate={startMonth}
              endDate={endMonth}
              onStartChange={setStartMonth}
              onEndChange={setEndMonth}
              onConfirm={() => { setShowCustom(false); fetchStats(); }}
              onCancel={() => setShowCustom(false)}
            />
          )}
```

Replace with:

```tsx
          {showCustom && (
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker value={startMonth} onChange={(v) => { setStartMonth(v); fetchStats(); }} />
              <span className="text-gray-400 text-sm">→</span>
              <DatePicker value={endMonth} onChange={(v) => { setEndMonth(v); fetchStats(); }} />
              <button onClick={() => { setActiveDate('today'); setShowCustom(false); setStartMonth(''); setEndMonth(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">清除</button>
            </div>
          )}
```

- [ ] **Step 3: Remove duplicate "Token 构成" chart from Row 5**

Find the Row 5 section (around lines 343-394):

```tsx
      {/* Row 5: Token Composition + Model Cost Ranking — 2 cols */}
      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Token 构成</h3>
          <p className="text-xs text-gray-400 mb-4">输出 / 缓存输入 / 未缓存输入</p>
          {data.dailyStats.length > 0 ? (
            <div className="h-44 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dailyStats} maxBarSize={36}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={26} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="uncached_tokens" name="未缓存输入" fill="#f59e0b" stackId="a" />
                  <Bar dataKey="cached_tokens" name="缓存输入" fill="#22c55e" stackId="a" />
                  <Bar dataKey="completion_tokens" name="输出" fill="#a78bfa" stackId="a" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-44 sm:h-48 flex items-center justify-center text-sm text-gray-400">暂无数据</div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 sm:mt-3 text-[10px] sm:text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#f59e0b]" /> 未缓存</span>
            <span className="font-mono text-gray-700">{data.stats.total_uncached_input_tokens.toLocaleString()}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#22c55e]" /> 缓存</span>
            <span className="font-mono text-gray-700">{data.stats.total_cached_input_tokens.toLocaleString()}</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#a78bfa]" /> 输出</span>
            <span className="font-mono text-gray-700">{data.stats.total_completion_tokens.toLocaleString()}</span>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
```

Replace the entire Row 5 grid section. The Token 构成 div (the first child of the grid) must be replaced with the "成功率" chart (moved from Row 4), and the second child (model cost ranking) stays.

Actually, the simpler approach: keep the Row 4 grid with `[模型调用分布, Token构成]` and Row 5 with `[成功率, 按模型消费排行]`.

So replace the entire Row 5 block with:

```tsx
      {/* Row 5: Success Rate + Model Cost Ranking — 2 cols */}
      <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">成功率</h3>
          <p className="text-xs text-gray-400 mb-4">调用健康度概览</p>
          <div className="flex flex-col items-center justify-center h-44 sm:h-48">
            <div className="relative w-28 h-28 sm:w-32 sm:h-32">
              <svg className="w-28 h-28 sm:w-32 sm:h-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                <circle cx="60" cy="60" r="52" fill="none" stroke="#22c55e" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - Math.min(Number(successRate) / 100, 1))}`}
                  className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className="text-xl sm:text-2xl font-bold text-gray-900">{successRate}%</span>
                <span className="text-[9px] sm:text-[10px] text-gray-400">成功率</span>
              </div>
            </div>
            <div className="flex gap-3 sm:gap-4 mt-2 sm:mt-3 text-[10px] sm:text-xs text-gray-500">
              <span className="flex items-center gap-1"><InlineIcon name="check" className="w-3 h-3 text-emerald-500" /> {data.stats.success_calls}</span>
              <span className="flex items-center gap-1"><InlineIcon name="x" className="w-3 h-3 text-red-400" /> {data.stats.fail_calls}</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">按模型消费排行</h3>
          <p className="text-xs text-gray-400 mb-4">各模型消费金额</p>
          {data.modelStats.length > 0 ? (
            <div className="h-44 sm:h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.modelStats.slice(0, 10)} layout="vertical" maxBarSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="model" width={80} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value: any) => [`¥${Number(value).toFixed(4)}`, '消费']} />
                  <Bar dataKey="total_cost" fill="#6366f1" name="消费(元)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-44 sm:h-48 flex items-center justify-center text-sm text-gray-400">暂无数据</div>
          )}
        </div>
      </div>
```

- [ ] **Step 4: Remove unused `DateRangePicker` import and `showCustom` state toggle**

The `showCustom` state is still used for conditionally rendering the inline DatePickers, so keep it. The `onConfirm` and `onCancel` callbacks from the old DateRangePicker are gone, so remove the `DateRangePicker` import.

Old import:
```tsx
import { DateRangePicker } from '@/lib/date-range-picker';
```

New (only if DateRangePicker is not used elsewhere in the file — it isn't):
Remove the import line entirely.

- [ ] **Step 5: Verify TypeScript build**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: inline DatePicker in dashboard custom date, remove duplicate token chart"
```

---

### Task 3: Channel — restore add/edit Modal + side panel co-exist

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx`

**Interfaces:**
- Consumes: existing `<Modal>` from `@/lib/modal`
- Produces: two independent channel editing paths — Modal (simple info editing) and side panel (info + model management)

**Overview:**
Restore the Modal-based channel creation and editing as the primary editing interface. Keep the side panel as a secondary entry (for model/alias/pricing management), but change its trigger from the ⚙️ config button to a dedicated chevron button on the right. The panel width increases to w-1/2. Modal and side panel use independent form states.

- [ ] **Step 1: Add Modal state variables**

After the existing state declarations (around line 53), add:

```tsx
// Modal state (independent from side panel)
const [chModal, setChModal] = useState(false);
const [modalForm, setModalForm] = useState({ name: '', base_url: '', api_key: '', priority: 0, notes: '' });
const [modalEditId, setModalEditId] = useState<string | null>(null);
```

- [ ] **Step 2: Add Modal save handler**

After the existing `saveChannel` function (around line 78), add:

```tsx
const saveModalChannel = async () => {
  const isEdit = !!modalEditId;
  const body: Record<string, any> = isEdit ? { id: modalEditId, ...modalForm } : modalForm;
  if (isEdit && !body.api_key) delete body.api_key;
  const res = await apiFetch('/admin/channels', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) });
  if (res.ok) { setChModal(false); fetchAll(); }
};
```

- [ ] **Step 3: Update the "新建渠道" button**

Find the "新建渠道" button (around line 178):

```tsx
<button onClick={() => openSidePanel()}
```

Change to open the Modal instead:

```tsx
<button onClick={() => { setModalForm({ name: '', base_url: '', api_key: '', priority: 0, notes: '' }); setModalEditId(null); setChModal(true); }}
```

- [ ] **Step 4: Add the ✏️ edit button to channel cards**

In the channel card actions row (around line 237-256), add a pencil edit button before the health check button:

```tsx
<div className="flex items-center gap-0.5 shrink-0">
  {/* ✏️ edit button - NEW */}
  <span className="group relative">
    <button onClick={() => { setModalForm({ name: ch.name, base_url: ch.base_url, api_key: '', priority: ch.priority, notes: ch.notes }); setModalEditId(ch.id); setChModal(true); }}
      className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all border border-transparent hover:border-blue-200"><InlineIcon name="pencil" className="w-4 h-4" /></button>
    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">编辑</span>
  </span>
  {/* 连通检测 — unchanged */}
  <span className="group relative">
    <button onClick={() => openCheckModal(ch)}
      className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all border border-transparent hover:border-emerald-200"><InlineIcon name="activity" className="w-4 h-4" /></button>
    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">连通检测</span>
  </span>
  {/* ▼ side panel button — NEW (repurposed from config) */}
  <span className="group relative">
    <button onClick={() => { setPanelForm({ name: ch.name, base_url: ch.base_url, api_key: '', priority: ch.priority, notes: ch.notes }); setPanelEditId(ch.id); setModelChannelId(ch.id); setSidePanelOpen(true); }}
      className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-200"><InlineIcon name="chevronDown" className="w-4 h-4" /></button>
    <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none z-50 delay-500">展开</span>
  </span>
  <Switch ... />
  ...
</div>
```

- [ ] **Step 5: Add the Channel Modal JSX**

Before the Closing `</div>` of the root (or before the ConfirmDialog), add:

```tsx
      {/* Channel Create/Edit Modal */}
      <Modal open={chModal} onClose={() => setChModal(false)} title={modalEditId ? '编辑渠道' : '新建渠道'}>
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
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Base URL</label>
            <input value={modalForm.base_url} onChange={e => setModalForm({...modalForm, base_url: e.target.value})}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder="https://api.deepseek.com" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">API Key <span className="text-gray-400">（加密存储）</span></label>
            <input type="password" value={modalForm.api_key} onChange={e => setModalForm({...modalForm, api_key: e.target.value})}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono" placeholder={modalEditId ? '留空保持不变' : 'sk-...'} />
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
```

- [ ] **Step 6: Rename old chForm → panelForm, editId → panelEditId**

The existing `chForm` and `editId` were used by the side panel. To make the two editing paths independent, rename them:

Find and replace:
- `const [editId, setEditId]` → `const [panelEditId, setPanelEditId]`
- `const [chForm, setChForm]` → `const [panelForm, setPanelForm]`

Also update all references:
- All `editId` in the side panel JSX → `panelEditId`
- All `chForm` in the side panel JSX → `panelForm`
- The `openSidePanel` function param and its setter calls

The `openSidePanel` function currently sets both `chForm/editId` and `modelChannelId`. Rename to:

```tsx
const openSidePanel = (ch?: Channel) => {
  if (ch) {
    setPanelForm({ name: ch.name, base_url: ch.base_url, api_key: '', priority: ch.priority, notes: ch.notes });
    setPanelEditId(ch.id);
    setModelChannelId(ch.id);
  } else {
    setPanelForm({ name: '', base_url: '', api_key: '', priority: 0, notes: '' });
    setPanelEditId(null);
    setModelChannelId('');
  }
  setExpandedModelId(null);
  setNewModelId('');
  setSidePanelOpen(true);
};
```

Note: `openSidePanel()` with no args is now only used potentially for "new from side panel" which we're removing. The side panel is now only opened via the chevron button (which passes a Channel). So we can simplify — but keep the function with the optional param for safety.

- [ ] **Step 7: Update side panel references and width**

In the side panel JSX (around line 270), change width:

```tsx
<div className="absolute right-0 top-0 bottom-0 w-1/2 min-w-[480px] max-w-[640px] bg-white shadow-2xl flex flex-col">
```

Update all `editId` → `panelEditId` and `chForm` → `panelForm` strings in the side panel section.

Update `saveChannel` to use panel state:

```tsx
const saveChannel = async () => {
  const isEdit = !!panelEditId;
  const body: Record<string, any> = isEdit ? { id: panelEditId, ...panelForm } : panelForm;
  if (isEdit && !body.api_key) delete body.api_key;
  const res = await apiFetch('/admin/channels', { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) });
  if (res.ok) { setSidePanelOpen(false); fetchAll(); }
};
```

- [ ] **Step 8: Check if "pencil" icon exists**

Run: `ls -la public/icons/pencil.svg` and `ls -la public/icons/chevronsLeft.svg`

If missing, add to `scripts/download-lucide-icons.js` `neededIcons` array and run the download script:
```bash
node scripts/download-lucide-icons.js
```

- [ ] **Step 9: Verify TypeScript build**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/app/dashboard/channels/page.tsx scripts/download-lucide-icons.js public/icons/pencil.svg public/icons/chevronsLeft.svg public/icons/chevronsRight.svg
git commit -m "feat: restore channel add/edit modal, keep side panel at w-1/2"
```

---

### Task 4: Improve error fallback messages (4 locations)

**Files:**
- Modify: `src/app/v1/chat/completions/route.ts`

**Overview:**
The current fallback `'Upstream error'` appears when the caught error is neither an Error instance nor has a `.body` property. Four locations use similar fallback patterns. Update all to handle `typeof err === 'string'` and use Chinese fallback text.

- [ ] **Step 1: Find and update all 4 error_message lines**

The 4 locations in `src/app/v1/chat/completions/route.ts`:

| Line | Current fallback | Change to |
|------|-----------------|-----------|
| 156 | `err instanceof Error ? err.message : 'Stream error'` | `err instanceof Error ? err.message : typeof err === 'string' ? err : '流式连接中断'` |
| 199 | `err.body \|\| (err instanceof Error ? err.message : 'Upstream error')` | `err.body \|\| (err instanceof Error ? err.message : typeof err === 'string' ? err : '上游连接异常')` |
| 340 | `err instanceof Error ? err.message : 'Stream error'` | `err instanceof Error ? err.message : typeof err === 'string' ? err : '流式连接中断'` |
| 393 | `lastError?.body \|\| (lastError instanceof Error ? lastError.message : 'Upstream error')` | `lastError?.body \|\| (lastError instanceof Error ? lastError.message : typeof lastError === 'string' ? lastError : '上游连接异常')` |

For each line, replace the old text with the new text using Edit tool.

- [ ] **Step 2: Verify TypeScript build**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/v1/chat/completions/route.ts
git commit -m "fix: improve upstream error fallback messages"
```

---

### Final: Build check & push

- [ ] **Run full build**

```bash
npm run build 2>&1 | tail -20
```
Expected: `✓ Build completed` or similar success message.

- [ ] **Push to remote**

```bash
git push origin main
```
