# Admin UI Optimizations V3 — Design Spec

**Date:** 2026-07-21
**Status:** Draft
**Scope:** 4 independent UI fixes across dashboard, keys, channels, and models pages

---

## 1. Dashboard Token Bar Chart: Reduce Spacing and Tooltip Width

**File:** `src/app/dashboard/page.tsx`

### Problem

The "每日 Token 消耗" stacked bar chart has:
1. **Bar spacing too wide:** `maxBarSize={36}` and each data point consumes `40px` in the min-width calculation, producing wide gaps between bars
2. **Tooltip too wide:** Default Recharts tooltip renders multi-line content with excessive padding

### Solution

| Parameter | Before | After |
|-----------|--------|-------|
| `maxBarSize` | 36 | 24 |
| minWidth per data point | 40px | 28px |
| Tooltip | Multi-line, wide | Single-line compact |

**Changes:**

1. `maxBarSize={36}` → `maxBarSize={24}` (for all BarChart instances, there are 2)
2. `minWidth: Math.max(data.dailyStats.length * 40 + 80, 400)` → `28` instead of `40`
3. Custom Tooltip content: render a single compact line per item instead of the default verbose format

**Custom Tooltip approach:**
```tsx
<Tooltip
  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px', padding: '6px 10px' }}
  formatter={(value: any, name: string) => [value.toLocaleString(), name]}
  labelFormatter={(label: string) => label.slice(5)}
/>
```

Also apply to the Token 构成 chart (smaller `maxBarSize` from 36→24).

---

## 2. Key Expiry DatePicker: Fix Right-Side Clipping

**File:** `src/app/dashboard/keys/page.tsx`, `src/lib/date-picker.tsx`

### Problem

The DatePicker's calendar popup uses `position: absolute` (relative to parent). The parent is inside a Modal with `overflow-hidden`, causing the calendar's right and bottom edges to be clipped.

### Solution

Refactor the DatePicker calendar popup to use `createPortal` + fixed positioning (same pattern as the existing `Popover` component), so it renders outside the modal and is never affected by parent overflow.

**Changes to `src/lib/date-picker.tsx`:**

1. Add `useRef` for trigger button
2. Use `createPortal` to render the calendar popup to `document.body`
3. Calculate position using `getBoundingClientRect()` on the trigger button
4. Position the popup below the button, left-aligned or adjust to fit viewport
5. Handle scroll/resize events to reposition

**Before (simplified):**
```tsx
{open && (
  <div className="absolute z-50 mt-1" style={{ left: 0 }}>
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4">
      <DayPicker ... />
    </div>
  </div>
)}
```

**After (simplified):**
```tsx
{open && dropPos && createPortal(
  <div
    className="fixed z-[9999] mt-1"
    style={{ left: dropPos.left, top: dropPos.top }}
  >
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4">
      <DayPicker ... />
    </div>
  </div>,
  document.body
)}
```

**State additions:**
```typescript
const [dropPos, setDropPos] = useState<{ left: number; top: number } | null>(null);
```

Position calculation via `useLayoutEffect` reading `btnRef.current.getBoundingClientRect()`.

---

## 3. Channel Side Panel: Model Grid + Quick Add/Remove

**File:** `src/app/dashboard/channels/page.tsx`

### Problem

The "上游可用模型" section (pulled models) displays models in a `flex-wrap` layout with inconsistent sizing. There's no quick way to add/remove models — each model click directly adds it without visual feedback.

### Solution

Restructure the pulled models display into a 3-column grid with compact model name and +/- buttons.

**New grid layout:**
```tsx
<div className="grid grid-cols-3 gap-1.5">
  {pulledModels[panelEditId].map(m => {
    const exists = modelsForChannel(panelEditId).some(mod => mod.model_id === m);
    return (
      <div key={m}
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-mono ${
          exists
            ? 'bg-gray-100 text-gray-600'
            : 'bg-white border border-gray-200 text-gray-700 hover:border-indigo-300'
        }`}
      >
        <span className="flex-1 truncate">{m}</span>
        <button onClick={() => {/* add or remove */}}
          className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-xs font-bold
            ${exists
              ? 'bg-red-100 text-red-500 hover:bg-red-200'
              : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200 opacity-0 group-hover:opacity-100'
            }`}
        >
          {exists ? '−' : '+'}
        </button>
      </div>
    );
  })}
</div>
```

**Behavior:**
- **Already added models:** Gray background (`bg-gray-100`), `−` button visible
- **Available models:** White background with border, `+` button visible on hover (`group-hover:opacity-100`)
- **Click `+`:** POST create channel-model → re-fetch data (same as current click behavior)
- **Click `−`:** DELETE channel-model → re-fetch data

**Additional interactions:**
- Apply the same grid layout to the `<summary>` collapse section

---

## 4. Model Plaza: Arrow Position & Hover Fix

**File:** `src/app/dashboard/models/page.tsx`

### Problem

1. **Arrow vertical misalignment:** The arrow button has `mt-1` offset, causing it to sit below the copy button's vertical center
2. **Inconsistent container:** Arrow is a separate flex item in the outer flex container, not grouped with the copy button
3. **Hover style broken:** Arrow hover transition behaves inconsistently

### Solution

**Layout restructure:** Group the copy button and arrow into a single flex container:

```tsx
{/* Before: separate flex items */}
<button className="ml-auto p-1 rounded ..."> {/* copy */} </button>
{group.channels.length > 1 ? (
  <Popover side="left" trigger={
    <span className="p-1 rounded ... mt-1"> {/* arrow - offset by mt-1 */} </span>
  }>
) : (
  <InlineIcon name="arrowLeft" className="... mt-1" />
)}

{/* After: grouped in same container */}
<div className="ml-auto flex items-center gap-0.5 shrink-0">
  <button onClick={() => copyToClipboard(group.displayName, copyKey)}
    className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
    title="复制模型名">
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
      {/* ...popover content unchanged... */}
    </Popover>
  ) : (
    <span className="p-1 rounded text-gray-300">
      <InlineIcon name="zap" className="w-3.5 h-3.5" />
    </span>
  )}
</div>
```

**Key changes:**
- Copy button moves from inside the `flex-1` div to the outer action container
- Arrow loses `mt-1` — same vertical center as copy button
- Both buttons use identical `p-1 rounded ... transition-all` classes
- Both wrapped in a `div.ml-auto.flex.items-center.gap-0.5.shrink-0`

**For single-channel non-alias models:** Replace the static `arrowLeft` icon with `zap` (unchanged from current), but wrap it in a matched-size container.

---

## Implementation Order

| Task | File(s) | Complexity | Dependency |
|------|---------|-----------|------------|
| 1. Dashboard bar chart spacing | dashboard/page.tsx | Simple | None |
| 2. DatePicker portal fix | date-picker.tsx, keys/page.tsx | Medium | None |
| 3. Channel model list grid | channels/page.tsx | Medium | None |
| 4. Model plaza arrow fix | models/page.tsx | Simple | None |

All tasks are independent and can be built in any order.

## Non-Goals

- No changes to the dashboard's data fetching, date filtering, or statistics logic
- No changes to the DatePicker's date selection logic or keyboard handling
- No changes to the channel side panel's basic info section or save flow
- No changes to the model plaza's data model, filtering, or popover content
- No changes to backend APIs
