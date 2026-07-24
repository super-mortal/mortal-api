# Billing Export Colors + HealthBar 12+12 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Color the two summary rows at the top of the billing export's `明细` sheet (labels gray, values semantic color); remove the 4 summary badge cards from the dashboard billing page; split the channels HealthBar into a 12+12 layout with a thin vertical divider.

**Architecture:** Pure presentation-layer changes inside 3 existing files. Server-side ExcelJS rich-text runs replace single-string cells. CSS flex row layout splits one dot array into two with a divider span. No schema, no API, no new modules.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · ExcelJS (server) · better-sqlite3 (no DB changes).

## Global Constraints

- **Visual companion decisions are binding** (2026-07-24 brainstorm session):
  - Billing row 2 colors: 总输入Token `#3B82F6` blue · 总缓存输入Token `#A855F7` purple · 总输出Token `#06B6D4` cyan · 总费用 `#10B981` green + bold.
  - Billing row 3 colors: 总调用次数 `#1F2937` neutral dark · 成功 `#10B981` green · 失败 `#EF4444` red · 成功率 `#10B981` green + bold.
  - All labels and the `|` separator use gray: labels `#6B7280`, separator `#9CA3AF`.
  - HealthBar layout: 12 + 12 with `w-px h-4 bg-gray-300` vertical divider between the two halves.
- **Dashboard billing page 4 summary badges are deleted entirely** (the cards above the filter / export button card). The filter card and the export Modal must continue to work.
- **Tailwind utility classes only for new code.** Existing inline-style colors inside ExcelJS cell.font objects stay (those are server-side string literals).
- **HealthBar dot colors stay**: success `#10B981`, quota-cooling `#FBBF24`, failure `#EF4444`, no-data `#9CA3AF`. Dot order stays oldest-left → newest-right.
- **HealthBar 12+12 change is desktop-only** (inside the `hidden md:flex` block). Mobile compact row at line ~551 stays as-is.
- **ExcelJS rich-text runs** — use the array form `cell.value = [{ text, font? }, ...]` (NOT a single string). Per-field colors come from each run's `font.color.argb`. The `|` separator is also its own run (lighter gray).
- **Verification standard** — `npx tsc --noEmit` exits 0 after each task. Final whole-branch review covers cross-file consistency.
- **Commit per task** with the messages specified in each task.

---

## File Structure

| File | Role | Change |
|---|---|---|
| `src/lib/billing.ts` | Excel generation | Replace 2 `cell.value =` strings with rich-text runs |
| `src/app/dashboard/billing/page.tsx` | Dashboard billing UI | Delete 4 summary badge cards + any now-unused state/imports |
| `src/app/dashboard/channels/page.tsx` | Dashboard channels UI | Split 24-dot row into 2 × 12-dot halves with divider |

3 files touched, no files created.

---

### Task 1: Billing Export — Color the Top Summary Rows

**Files:**
- Modify: `src/lib/billing.ts` (only)

**Interfaces:**
- Consumes: existing `computeSummary(detail)` return shape `{ totalInput, totalCached, totalOutput, totalCost, succ, fail, total, rate }` — unchanged.
- Produces: same `generateExcel()` signature `Promise<{ buffer: Buffer; filename: string }>` — unchanged. Internal behavior: row 2 (`A2`) and row 3 (`A3`) of the `明细` sheet render with rich-text runs.

**Color tokens (ARGB, prefix `FF`):**
- Label gray: `FF6B7280`
- Pipe separator: `FF9CA3AF`
- Total input token: `FF3B82F6`
- Cached input token: `FFA855F7`
- Total output token: `FF06B6D4`
- Total cost (emphasis): `FF10B981` + `bold: true`
- Total calls (neutral count): `FF1F2937`
- Success: `FF10B981`
- Failure: `FFEF4444`
- Success rate (emphasis): `FF10B981` + `bold: true`

- [ ] **Step 1: Locate the 2 cells to modify in `src/lib/billing.ts`**

Read `src/lib/billing.ts` lines 230–247 (the "Summary block" section in `generateExcel`). Confirm the existing strings match exactly:

```ts
s1.value = `总输入Token: ${s.totalInput.toLocaleString()}  |  总缓存输入Token: ${s.totalCached.toLocaleString()}  |  总输出Token: ${s.totalOutput.toLocaleString()}  |  总费用: ¥${s.totalCost.toFixed(4)}`;
s2.value = `总调用次数: ${s.total.toLocaleString()}  |  成功: ${s.succ.toLocaleString()}  |  失败: ${s.fail.toLocaleString()}  |  成功率: ${s.rate}%`;
```

- [ ] **Step 2: Replace row 2 (`s1`) with rich-text runs**

In `src/lib/billing.ts`, replace the two assignments to `s1.value` and `s1.font` (and the now-redundant `s1.alignment` block) with the following. Keep `wrapText` true so the row stays on one visual line in Excel:

```ts
s1.value = [
  { text: '总输入Token: ', font: { size: 10, color: { argb: 'FF6B7280' } } },
  { text: s.totalInput.toLocaleString(), font: { size: 10, color: { argb: 'FF3B82F6' } } },
  { text: '  |  ', font: { size: 10, color: { argb: 'FF9CA3AF' } } },
  { text: '总缓存输入Token: ', font: { size: 10, color: { argb: 'FF6B7280' } } },
  { text: s.totalCached.toLocaleString(), font: { size: 10, color: { argb: 'FFA855F7' } } },
  { text: '  |  ', font: { size: 10, color: { argb: 'FF9CA3AF' } } },
  { text: '总输出Token: ', font: { size: 10, color: { argb: 'FF6B7280' } } },
  { text: s.totalOutput.toLocaleString(), font: { size: 10, color: { argb: 'FF06B6D4' } } },
  { text: '  |  ', font: { size: 10, color: { argb: 'FF9CA3AF' } } },
  { text: '总费用: ', font: { size: 10, color: { argb: 'FF6B7280' } } },
  { text: `¥${s.totalCost.toFixed(4)}`, font: { size: 10, color: { argb: 'FF10B981' }, bold: true } },
];
s1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
```

Delete the original `s1.font = { size: 10, color: { argb: 'FF6B7280' } };` line — the runs carry per-segment font now.

- [ ] **Step 3: Replace row 3 (`s2`) with rich-text runs**

Replace the two assignments to `s2.value` and `s2.font` with:

```ts
s2.value = [
  { text: '总调用次数: ', font: { size: 10, color: { argb: 'FF6B7280' } } },
  { text: s.total.toLocaleString(), font: { size: 10, color: { argb: 'FF1F2937' } } },
  { text: '  |  ', font: { size: 10, color: { argb: 'FF9CA3AF' } } },
  { text: '成功: ', font: { size: 10, color: { argb: 'FF6B7280' } } },
  { text: s.succ.toLocaleString(), font: { size: 10, color: { argb: 'FF10B981' } } },
  { text: '  |  ', font: { size: 10, color: { argb: 'FF9CA3AF' } } },
  { text: '失败: ', font: { size: 10, color: { argb: 'FF6B7280' } } },
  { text: s.fail.toLocaleString(), font: { size: 10, color: { argb: 'FFEF4444' } } },
  { text: '  |  ', font: { size: 10, color: { argb: 'FF9CA3AF' } } },
  { text: '成功率: ', font: { size: 10, color: { argb: 'FF6B7280' } } },
  { text: `${s.rate}%`, font: { size: 10, color: { argb: 'FF10B981' }, bold: true } },
];
s2.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
```

Delete the original `s2.font = { size: 10, color: { argb: 'FF6B7280' } };` line.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exits with code 0, no output.

If errors mention ExcelJS rich-text types, ensure each run object literal is exactly `{ text: string, font: { size: number, color: { argb: string }, bold?: boolean } }` — no extra fields.

- [ ] **Step 5: Commit**

```bash
cd D:/project/mortal-api
git add src/lib/billing.ts
git commit -m "feat(billing): color summary rows in export detail sheet"
```

Expected commit on `main`. No push yet.

---

### Task 2: Dashboard Billing Page — Remove 4 Summary Badges

**Files:**
- Modify: `src/app/dashboard/billing/page.tsx` (only)

**Interfaces:**
- Consumes: existing page state and props — unchanged.
- Produces: same exported `default function BillingPage()` — unchanged. Internal: the 4 summary cards JSX block and any now-unused state/imports are removed. Filter card and export Modal still work.

**Removal scope:**
- The 4 color-coded summary cards rendered above the filter card (总请求 / 总 Tokens / 总费用 / 平均延迟).
- Any `summary` state, `useEffect`/`useCallback` that fetches it, and the `BillingSummary` import if it becomes unused.
- The `queryBillingSummary` function in `src/lib/billing.ts` is **NOT removed** — it's still imported by `src/app/admin/billing/route.ts`. Check before deleting any imports.

- [ ] **Step 1: Locate the 4 summary cards and their feeding state**

Read `src/app/dashboard/billing/page.tsx` top-to-bottom. Identify:
1. The 4 cards' JSX block (rendered above the filter / export button card).
2. Any `summary` state (`useState<BillingSummary | null>` or similar).
3. Any `fetchSummary` / `useEffect(() => { fetchSummary(); }, [...])` block.
4. Any imports that become unused after removal (`BillingSummary` type, `queryBillingSummary` if it's only used for this card).

- [ ] **Step 2: Verify `queryBillingSummary` is still used elsewhere**

Run: `grep -rn "queryBillingSummary" D:/project/mortal-api/src`
Expected: at least one match in `src/app/admin/billing/route.ts`. If no match exists, you can also remove the function — but in practice the route file uses it.

If the only call site is `billing/page.tsx`, ask the user before deleting the function. By default, **do NOT delete** the function — it's an exported helper.

- [ ] **Step 3: Delete the 4 summary cards JSX block**

Remove the entire JSX block rendering the 4 cards (typically a `<div>` with grid layout wrapping 4 card divs). Keep the filter card and export Modal intact immediately below where the cards were.

Before-and-after sanity check: open the file in your editor and confirm the page still has:
- Page header (title)
- Export Modal (opened by the "导出账单" button)
- Filter card (密钥筛选, 时间范围 preset buttons, 自定义 date pickers, 导出按钮)
- History card (conditional on `history.length > 0`)

- [ ] **Step 4: Delete now-unused state and effects**

If the `summary` state and its fetching effect/callback are only used to feed the deleted cards, remove them. If they feed anything else, keep them.

Also remove any now-unused imports:
- `BillingSummary` type (if no longer referenced)
- `queryBillingSummary` (if no longer called from this file)

Leave other imports alone.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exits with code 0.

If TS reports unused-import or unused-variable errors, delete those imports/locals. If TS reports `BillingSummary` / `queryBillingSummary` still referenced, you missed a call site — re-check before deleting.

- [ ] **Step 6: Commit**

```bash
cd D:/project/mortal-api
git add src/app/dashboard/billing/page.tsx
git commit -m "refactor(billing): remove 4 summary badges from dashboard page"
```

Expected commit on `main`. No push yet.

---

### Task 3: Channels HealthBar — 12 + 12 Layout

**Files:**
- Modify: `src/app/dashboard/channels/page.tsx` (only)

**Interfaces:**
- Consumes: existing channel card render and HealthBar JSX block — unchanged props.
- Produces: same component tree. Inside the desktop HealthBar (`hidden md:flex`), the single 24-dot flex row becomes two 12-dot flex rows with a thin vertical divider between them. Mobile compact row untouched.

**Layout:**
- HealthBadge (leftmost)
- 12-dot flex (oldest of the 24, indices 0–11)
- `<span className="w-px h-4 bg-gray-300" aria-hidden="true" />` divider
- 12-dot flex (newest of the 24, indices 12–23)
- Stats block `96% | 320ms` (rightmost)

- [ ] **Step 1: Locate the dot array source and the desktop HealthBar block**

Read `src/app/dashboard/channels/page.tsx` lines 532–548. The relevant block is:

```tsx
<div className="hidden md:flex md:order-2 items-center gap-3 absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
  <HealthBadge health_status={ch.health_status} is_active={ch.is_active} cooldown_until={ch.cooldown_until} />
  <div className="flex gap-[2px]">
    {[...24 dots in one row].map(...)}
  </div>
  <div className="flex items-center gap-1.5 text-[11px] font-mono whitespace-nowrap">
    <span className="text-emerald-600 font-semibold">{ch.uptime_pct ?? 100}%</span>
    <span className="text-gray-300">|</span>
    <span className="text-gray-700 font-semibold">{ch.avg_latency_ms ? `${ch.avg_latency_ms}ms` : '—'}</span>
  </div>
</div>
```

- [ ] **Step 2: Refactor the dot flex into two 12-dot halves with a divider**

Extract the 24-dot array to a local variable for readability, then split it into `slice(0, 12)` and `slice(12, 24)`. Replace the single `<div className="flex gap-[2px]">{...}</div>` with the 3-element sequence below. The rest of the wrapper stays the same:

```tsx
<div className="hidden md:flex md:order-2 items-center gap-3 absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
  <HealthBadge health_status={ch.health_status} is_active={ch.is_active} cooldown_until={ch.cooldown_until} />
  <div className="flex gap-[2px]">
    {dots.slice(0, 12).map((c, i) => (
      <span
        key={i}
        className="inline-block w-[4px] h-[16px] rounded-[1px]"
        style={{ background: c.ok === 1 ? '#10b981' : c.ok === 0 && c.kind === 'quota' ? '#fbbf24' : c.ok === 0 ? '#ef4444' : '#9ca3af' }}
      />
    ))}
  </div>
  <span className="w-px h-4 bg-gray-300" aria-hidden="true" />
  <div className="flex gap-[2px]">
    {dots.slice(12, 24).map((c, i) => (
      <span
        key={i}
        className="inline-block w-[4px] h-[16px] rounded-[1px]"
        style={{ background: c.ok === 1 ? '#10b981' : c.ok === 0 && c.kind === 'quota' ? '#fbbf24' : c.ok === 0 ? '#ef4444' : '#9ca3af' }}
      />
    ))}
  </div>
  <div className="flex items-center gap-1.5 text-[11px] font-mono whitespace-nowrap">
    <span className="text-emerald-600 font-semibold">{ch.uptime_pct ?? 100}%</span>
    <span className="text-gray-300">|</span>
    <span className="text-gray-700 font-semibold">{ch.avg_latency_ms ? `${ch.avg_latency_ms}ms` : '—'}</span>
  </div>
</div>
```

The `dots` variable holds the existing 24-element array (the `slice(-24)` + padding expression that currently lives inline in the JSX). Move it to a local `const` just above the JSX inside the `.map(ch => { ... })` callback:

```ts
const dots = [
  ...(ch.recent_checks || []).slice(-24),
  ...Array.from({ length: Math.max(0, 24 - (ch.recent_checks || []).length) }, () => ({ ok: null, kind: null })),
].slice(0, 24);
```

- [ ] **Step 3: Confirm mobile compact row is untouched**

Read lines 551–556. The mobile-only `<div className="flex md:hidden basis-full order-2 ...">` block stays as-is (badge + uptime + pipe + latency, no dots, no divider). Do not modify it.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exits with code 0.

- [ ] **Step 5: Commit**

```bash
cd D:/project/mortal-api
git add src/app/dashboard/channels/page.tsx
git commit -m "refactor(channels): healthbar 12+12 with thin vertical divider"
```

Expected commit on `main`. No push yet.

---

### Task 4 (cleanup, post-review): Remove Dead Summary Code Path

**Files:**
- Modify: `src/app/dashboard/billing/page.tsx`
- Modify: `src/app/admin/billing/route.ts`
- Modify: `src/lib/billing.ts`

**Why:** After Task 2 removed the 4 dashboard summary cards, the only remaining consumer of `queryBillingSummary` is the dashboard's hidden Modal text "共 N 条记录". The backend `GET /admin/billing` route was the only other call site. Whole-branch review flagged this as dead code.

**Interfaces:**
- Consumes: existing `BillingPage` component, existing `POST /admin/billing` handler — unchanged.
- Produces: same module signatures. Internal: `BillingSummary` interface + `EMPTY_SUMMARY` + `summary` state + the `useEffect` that fetches `/admin/billing` are removed from the frontend page; the Modal text reverts to plain `时间范围: {startDate} ~ {endDate}` (no count); the backend `GET /admin/billing` handler and its import of `queryBillingSummary` are removed; `queryBillingSummary` and the `BillingSummary` interface are removed from `src/lib/billing.ts`.

- [ ] **Step 1: Delete from `src/app/dashboard/billing/page.tsx`**

Remove (in this order):
1. `interface BillingSummary { ... }`
2. `const EMPTY_SUMMARY: BillingSummary = { ... };`
3. `const [summary, setSummary] = useState<BillingSummary>(EMPTY_SUMMARY);`
4. The `useEffect` that fetches `/admin/billing` and calls `setSummary(...)` (the one with `[endDate, selectedKeyId, startDate]` deps).
5. Modal text change: `<p>时间范围: {startDate} ~ {endDate} · 共 {summary.totalRequests.toLocaleString()} 条记录</p>` → `<p>时间范围: {startDate} ~ {endDate}</p>`.

React imports (`useEffect`, `useState`, `useCallback`) all stay — still used elsewhere.

- [ ] **Step 2: Delete from `src/app/admin/billing/route.ts`**

1. Remove `queryBillingSummary` from the `import { ... } from '@/lib/billing'` statement.
2. Delete the entire `export async function GET(request: NextRequest) { ... }` handler.

The `POST` handler is untouched.

- [ ] **Step 3: Delete from `src/lib/billing.ts`**

1. Delete `interface BillingSummary { ... }`.
2. Delete `export function queryBillingSummary(q: ExportQuery): BillingSummary { ... }`.

All other exports (`ExportQuery`, `DetailRow`, `DailySummaryRow`, `ModelSummaryRow`, `getRelayKeyName`, `queryDetail`, `queryDailySummary`, `queryModelSummary`, `computeSummary`, `applyCenter`, `applyHeaderStyle`, `generateExcel`) are untouched.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `grep -rn "queryBillingSummary\|BillingSummary\|EMPTY_SUMMARY" D:/project/mortal-api/src`
Expected: no matches.

Run: `grep -n "summary" D:/project/mortal-api/src/app/dashboard/billing/page.tsx`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
cd D:/project/mortal-api
git add src/app/dashboard/billing/page.tsx src/app/admin/billing/route.ts src/lib/billing.ts
git commit -m "refactor(billing): remove dead summary state + GET handler + queryBillingSummary"
```

Expected commit on `main`. No push yet. (Final push happens once all tasks + spec-doc fix land together.)

---

## Self-Review

1. **Spec coverage:**
   - Feature 1 (color summary rows) → Task 1 ✓
   - Feature 1b (delete 4 dashboard badges) → Task 2 ✓
   - Feature 2 (HealthBar 12+12) → Task 3 ✓
   - Cleanup (remove dead summary path) → Task 4 ✓ (added post-review)
   - All 9 color tokens in spec appear in Task 1's run definitions ✓
   - Divider class `w-px h-4 bg-gray-300` matches spec exactly ✓

2. **Placeholder scan:**
   - No TBD/TODO/"implement later" anywhere
   - All color values are concrete hex codes
   - All JSX is given verbatim (implementer can paste)
   - No "similar to Task N" cross-references

3. **Type consistency:**
   - `computeSummary(detail)` return shape — used only internally, unchanged
   - `generateExcel(detail, daily, model, options?)` signature — unchanged across Task 1
   - `BillingSummary` type — deleted everywhere (Task 2 frontend, Task 4 backend + library) consistently
   - HealthBar JSX props (`health_status`, `is_active`, `cooldown_until`) — unchanged

No issues found; plan is ready.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-24-billing-export-colors-healthbar-12plus12-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.