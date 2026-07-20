# Dashboard & UI Optimization Design

**Date:** 2026-07-20
**Status:** Approved Design

## Overview

This project consists of five UI optimization areas for the Mortal API admin dashboard: dashboard layout, model plaza filters, channel management sidebar, call log cost display, and date picker unified styling.

## 1. Dashboard Layout Optimization

### 1.1 Stat Cards — 4×4 Two Rows

- **Current:** 8 stat cards in one row (`lg:grid-cols-8`)
- **Issue:** Numbers truncate, hard to read
- **Change:** `lg:grid-cols-4` → 4 per row × 2 rows
- **Cards:** 总调用次数, 成功, 失败, 总 Tokens, 输出 Tokens, 命中缓存, 未命中缓存, 今日消费
- **Response:** Responsive: `grid-cols-2` (mobile) → `sm:grid-cols-4` (tablet/desktop)

### 1.2 Chart Layout

**Top 3 charts — each full width (unchanged style):**

| Order | Chart | Type | Notes |
|-------|-------|------|-------|
| 1 | 每日调用趋势 | Area chart (full width) | Unchanged from current |
| 2 | 每日 Token 消耗 | Stacked bar chart (full width) | Add horizontal scroll |
| 3 | 近 7 天消费趋势 | Area chart (full width) | Unchanged from current |

**Bottom 4 charts — 2 per row, 2 rows:**

| Row | Left (col-span-1) | Right (col-span-1) |
|-----|-------------------|-------------------|
| Row 4 | 模型调用分布 (pie) | 成功率 (donut) |
| Row 5 | Token 构成 (bar) | 按模型消费排行 (horizontal bar) |

**Implementation:**
- Remove current `lg:grid-cols-2` and `lg:grid-cols-4` chart grids
- Use individual full-width containers for top 3 charts
- Use `grid sm:grid-cols-2` for bottom 2 rows

### 1.3 Token Consumption Bar Chart — Horizontal Scroll

- **Keep:** `maxBarSize={36}` fixed bar width
- **Add:** Outer container `overflow-x: auto`, chart gets `min-width` proportional to data count
- **Behavior:** Few days → centered with no scroll. 30 days → scrollbar appears naturally
- **Implementation:**
  ```tsx
  <div className="overflow-x-auto">
    <div style={{ minWidth: data.dailyStats.length * 40 + 80 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.dailyStats} maxBarSize={36}>
          {/* ... */}
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
  ```

## 2. Model Plaza — Filter Dropdowns

**File:** `src/app/dashboard/models/page.tsx`

**Current:** 3 native `<select>` elements for channel/status/type filtering (lines 118-137)

**Change:** Replace all 3 native `<select>` with the global `<SelectFilter>` component from `src/lib/select-filter.tsx`

**Implementation:**
```tsx
<SelectFilter
  options={[
    { label: '全部渠道', value: 'all' },
    ...channels.filter(c => c.is_active).map(c => ({ label: c.name, value: c.name })),
  ]}
  value={filterChannel}
  onChange={setFilterChannel}
  placeholder="全部渠道"
/>
```

## 3. Channel Management — Right Side Panel

**File:** `src/app/dashboard/channels/page.tsx`

### 3.1 Interaction Flow

1. **Current:** Vertical expand (chevron) reveals models/aliases below the card
2. **New:** Each channel card keeps all action buttons **except** the expand chevron. A new **⚙️ 配置** button opens the side panel.
3. Side panel slides in from right, 1/3 screen width, full height (100vh)
4. Background gets semi-transparent overlay with blur
5. Close via: overlay click, ✕ button, or Escape key
6. Save/Cancel at the bottom

### 3.2 Side Panel Layout

**Components kept on the original channel card:**
- Connectivity check (◎)
- Toggle switch (on/off)
- Delete button (🗑)
- Health status bar

**Components moved INTO the side panel:**

| Section | Content | Source |
|---------|---------|--------|
| **Header** | Channel name + ✕ close button | — |
| **基本信息** | Name, Base URL, API Key, Priority, Notes | Current channel create/edit Modal |
| **模型与别名** | Collapsible model cards | Current expanded section |
| **上游可用模型** | Pulled models quick-add list | Current expanded section (details) |
| **Footer** | 💾 Save + 取消 | — |

### 3.3 Collapsible Model Cards

**Collapsed state (compact, always visible):**
```
deepseek-v4-pro  ──→  my-deepseek           ¥已定价  ▶
原始模型(左)           别名(右)              状态标签  展开箭头
```

If no alias set:
```
deepseek-v4-flash  ──→  未设置别名            未定价  ▶
```

**Expanded state (click to toggle):**
- Header row (same as collapsed)
- **Alias section:** `[原始模型] → [input field] [更新 button]`
- **Pricing section:** Three inline inputs (输入/输出/缓存输入) with `元/M` suffix, consistent with current pricing Modal appearance but inline
- **Delete model** button

### 3.4 Alias Display Rule

- Alias name in **left** position, bold orange (`text-amber-700`)
- Arrow separator (`──→`)
- Original model ID in **right** position, gray monospace
- No alias → gray italic "未设置别名" text
- Call logs record the alias name (not the original model ID) when a model has an alias

## 4. Call Logs — Total Cost in Token Stats

**File:** `src/app/dashboard/logs/page.tsx`

**Location:** Inside the expanded detail section (when `expandedLogId === log.id`), next to existing `TokenBadge` components (lines 432-438)

**Addition:** Add a `TokenBadge` for total cost:
```tsx
<TokenBadge label="费用" value={log.cost ? `¥${log.cost.toFixed(6)}` : '¥0'} color="purple" />
```

The `TokenBadge` component already supports the `purple` color variant.

## 5. Unified Date Picker

### 5.1 Current Problem

The project uses native `<input type="date">` and `<input type="datetime-local">` elements. The input field itself is styled with Tailwind, but the popup calendar panel is rendered by the browser's native date picker, which cannot be styled with CSS. This creates inconsistent visual appearance across different browsers and operating systems.

### 5.2 Solution

Replace all native date inputs with a custom `DatePicker` component built on `react-day-picker` v9 + Tailwind CSS.

**Why react-day-picker:**
- Entire calendar is rendered as DOM elements → fully stylable with Tailwind via `classNames` prop
- Well-maintained, 10k+ GitHub stars
- Already supports the project's needs (single date, date range)
- No external CSS needed — all styling via Tailwind utility classes

### 5.3 Implementation

**New component:** `src/lib/date-picker.tsx`

```tsx
import { DayPicker, getDefaultClassNames } from 'react-day-picker';
// styled with Tailwind via classNames prop
```

**Affected files:**
| File | Current usage | Replacement |
|------|--------------|-------------|
| `dashboard/page.tsx` | `DateRangePicker` with `<input type="date">` | New DatePicker component |
| `dashboard/logs/page.tsx` | `<input type="datetime-local">` x2 + `<input type="date">` x2 | New DatePicker component |

**Design approach:**
- Input field looks like current styled inputs (consistent border/radius/size)
- Click input → opens calendar popover positioned below
- Calendar uses Tailwind-styled: indigo-500 selected day, hover states, rounded corners
- Close on: day selection, click outside, Escape

### 5.4 Dependency

- `npm install react-day-picker date-fns`

## Files Changed

| File | Change |
|------|--------|
| `src/app/dashboard/page.tsx` | Stat cards 4×4, chart layout restructured, horizontal scroll for bar chart |
| `src/app/dashboard/models/page.tsx` | Replace native `<select>` with `SelectFilter` |
| `src/app/dashboard/channels/page.tsx` | Replace expand + Modal with right side panel, collapsible model cards, inline pricing |
| `src/app/dashboard/logs/page.tsx` | Add cost TokenBadge, replace date inputs with DatePicker |
| `src/lib/date-picker.tsx` | **New** — unified DatePicker component |
| `src/lib/date-range-picker.tsx` | Refactor to use new DatePicker |
| `package.json` | Add `react-day-picker` and `date-fns` dependencies |
