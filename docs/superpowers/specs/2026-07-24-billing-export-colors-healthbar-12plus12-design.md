# Billing Export Colors + HealthBar 12+12 Layout — Design

> **For agentic workers:** This is a focused 2-feature polish spec. Both changes are visually-driven, scoped to existing files, and validated via visual-companion screenshots (already confirmed by user 2026-07-24).

**Goal:**
1. Add per-field colors to the two summary rows at the top of the `明细` (Detail) sheet in the billing export Excel file — labels stay neutral gray, numbers carry semantic color.
2. Reflow the HealthBar in the channels page from one continuous 24-dot row to a 12 + 12 layout separated by a thin vertical divider, with the health badge, dot arrays, and stats all sharing a common baseline.

**Architecture:** Pure presentation-layer changes inside two existing files. No new modules, no schema, no API. Server-side ExcelJS rich-text runs become per-cell color; CSS-side layout becomes a flex row with a divider.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · ExcelJS (server) · better-sqlite3 (no DB changes).

---

## Global Constraints

- **Visual companion decisions are binding**: both solutions (color palette = "dashboard 4-color + red/green" for quality; HealthBar layout = 12 + 12 with 1px divider) were chosen by the user in the brainstorming session on 2026-07-24 and are not open for reinterpretation.
- **Dashboard billing page 4-color summary badges are removed entirely** — they will not move to the export, only the Excel file's existing 2 summary rows gain color. The badges currently shown above the 3-tab nav must be deleted from the page.
- **Existing color palette stays as-is**: `#3B82F6` blue, `#A855F7` purple, `#06B6D4` cyan, `#10B981` green, `#EF4444`/`#DC2626` red, `#047857` darker green for emphasis, `#6B7280` neutral gray for labels and pipes.
- **Tailwind utility classes only** — no inline styles for new code; existing inline-style colors stay (they are inside ExcelJS strings which are unaffected).
- **HealthBar colors stay**: success `#10B981`, quota-cooling `#FBBF24`, failure `#EF4444`, no-data `#9CA3AF`.
- **Mobile compact row stays as-is** — HealthBar 12+12 change is desktop-only (`hidden md:flex` block).

---

## Feature 1 — Billing Export: Color the Top Summary Rows

### Current State

`src/lib/billing.ts` already writes two summary rows above the detail header in the `明细` sheet:

```ts
// Row 2 — token + cost group
s1.value = `总输入Token: ${s.totalInput.toLocaleString()}  |  总缓存输入Token: ${s.totalCached.toLocaleString()}  |  总输出Token: ${s.totalOutput.toLocaleString()}  |  总费用: ¥${s.totalCost.toFixed(4)}`;
s1.font = { size: 10, color: { argb: 'FF6B7280' } };   // ← whole row gray

// Row 3 — call quality group
s2.value = `总调用次数: ${s.total.toLocaleString()}  |  成功: ${s.succ.toLocaleString()}  |  失败: ${s.fail.toLocaleString()}  |  成功率: ${s.rate}%`;
s2.font = { size: 10, color: { argb: 'FF6B7280' } };   // ← whole row gray
```

Each is a merged cell across all columns with a single uniform gray font.

### Target State

Same text, same merged-cell layout, but each label stays gray while each **value** uses a semantic color:

| Group | Field | Label color | Value color | Notes |
|---|---|---|---|---|
| Tokens & cost | 总输入Token | `#6B7280` | `#3B82F6` blue | |
| | 总缓存输入Token | `#6B7280` | `#A855F7` purple | |
| | 总输出Token | `#6B7280` | `#06B6D4` cyan | |
| | 总费用 | `#6B7280` | `#10B981` green, bold | emphasis via bold |
| Calls & quality | 总调用次数 | `#6B7280` | `#1F2937` neutral dark | count is just a number, no semantic |
| | 成功 | `#6B7280` | `#10B981` green | |
| | 失败 | `#6B7280` | `#EF4444` red | |
| | 成功率 | `#6B7280` | `#10B981` green, bold | bold for the headline metric |
| Pipes `\|` | (separator) | `#9CA3AF` lighter gray | — | thin visual separator |

ExcelJS supports rich text via arrays of `{ text, font? }` runs on a single cell. Implementation replaces the two `s1.value` / `s2.value` string assignments with an array of runs:

```ts
s1.value = [
  { text: '总输入Token: ', font: { size: 10, color: { argb: 'FF6B7280' } } },
  { text: s.totalInput.toLocaleString(), font: { size: 10, color: { argb: 'FF3B82F6' }, bold: false } },
  { text: '  |  ', font: { size: 10, color: { argb: 'FF9CA3AF' } } },
  // … continue
];
s1.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
```

### Dashboard Billing Page — Remove the 4 Summary Badges

`src/app/dashboard/billing/page.tsx` currently renders 4 color-coded summary cards above the 3-tab nav (总额 / 总Tokens / 总费用 / 平均延迟). These are the cards referenced in the brainstorming session as "总请求/总Tokens/总费用/平均延迟" — and were confirmed to be removed in this change.

**Action:** delete the JSX block rendering those 4 cards (and the `summary` state / `queryBillingSummary` call that fed them, if they're now unused). The page must still render the 3 tabs (`明细` / `按天汇总` / `按模型汇总`) and the export dialog button.

### Files Touched

- **Modify:** `src/lib/billing.ts` — convert row 2 and row 3 to rich-text runs with per-field colors.
- **Modify:** `src/app/dashboard/billing/page.tsx` — remove the 4 summary badge JSX block and any now-unused summary state/imports.

### Behavior Preserved

- Row text content is byte-identical (same labels, same separators, same number formatting).
- Cell merging across all columns stays.
- Center alignment stays.
- The 3 sheets (`明细` / `按天汇总` / `按模型汇总`) are otherwise unchanged.
- `includeLatency` option (the checkbox from the prior spec) is untouched.

---

## Feature 2 — HealthBar 12 + 12 Layout

### Current State

`src/app/dashboard/channels/page.tsx` line 532–548 renders the desktop HealthBar as a single flex row of badge → 24 dots → stats:

```tsx
<div className="hidden md:flex md:order-2 items-center gap-3 absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
  <HealthBadge ... />
  <div className="flex gap-[2px]">
    {[...24 dots in one row].map(...)}
  </div>
  <div className="flex items-center gap-1.5 text-[11px] font-mono whitespace-nowrap">
    <span className="text-emerald-600 font-semibold">{uptime}%</span>
    <span className="text-gray-300">|</span>
    <span className="text-gray-700 font-semibold">{latency}ms</span>
  </div>
</div>
```

The 24 dots render as one continuous row with `gap-[2px]`. Health badge, dots, and stats are all on the same flex baseline.

### Target State

Split the 24-dot row into two 12-dot halves separated by a thin vertical divider (`w-px h-4 bg-gray-300`). Layout order:

1. **HealthBadge** (leftmost)
2. **First 12 dots** (oldest of the 24)
3. **Vertical divider** — `<span className="w-px h-4 bg-gray-300" />`
4. **Last 12 dots** (newest of the 24)
5. **Stats** `96% | 320ms` (rightmost)

Dot ordering is preserved (oldest-left → newest-right) — only the visual gap is added in the middle.

```tsx
<div className="hidden md:flex md:order-2 items-center gap-3 absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2">
  <HealthBadge ... />
  <div className="flex gap-[2px]">
    {dots.slice(0, 12).map(...)}
  </div>
  <span className="w-px h-4 bg-gray-300" aria-hidden="true" />
  <div className="flex gap-[2px]">
    {dots.slice(12, 24).map(...)}
  </div>
  <div className="flex items-center gap-1.5 text-[11px] font-mono whitespace-nowrap">
    <span className="text-emerald-600 font-semibold">{uptime}%</span>
    <span className="text-gray-300">|</span>
    <span className="text-gray-700 font-semibold">{latency}ms</span>
  </div>
</div>
```

### Baseline Alignment

The wrapper `items-center` (Tailwind class on the outer flex) already aligns all children to their center. The added divider is `h-4` (16px), matching the dot height, so the visual baseline of badge / dots-divider / stats remains consistent. No additional alignment class is required.

### Mobile Compact Row — Untouched

The mobile-only block at line 551–556 (badge + uptime + pipe + latency, no dots) stays as-is. The 12+12 change only applies inside `hidden md:flex` block.

### Files Touched

- **Modify:** `src/app/dashboard/channels/page.tsx` — split the 24-dot flex into two 12-dot halves with a divider span between them. The `dots` array source (the `slice(-24)` + padding) is unchanged.

### Behavior Preserved

- Dot color logic (success / quota-cooling / failure / no-data) is unchanged.
- Dot order (oldest to newest, left to right) is unchanged.
- Health badge props and rendering are unchanged.
- Stats block content and colors are unchanged.
- Absolute positioning (centered) is unchanged.

---

## Error Handling

Neither change introduces a new failure mode:

- Excel rich-text runs: if ExcelJS rejects the array form, the writeBuffer call will throw and the existing 500 path in `src/app/admin/billing/route.ts` will surface it to the caller.
- HealthBar layout: pure JSX, no runtime behavior change; React rendering errors would be visible in dev mode.

No new error paths, no new tests required beyond `npx tsc --noEmit` exit 0.

---

## Verification

1. **Type check:** `npx tsc --noEmit` exits 0.
2. **Export render check (manual):** trigger a billing export from the admin page, open the resulting `.xlsx` in Excel/LibreOffice/Sheets. Row 2 shows 4 colored numbers (blue / purple / cyan / green-bold), row 3 shows 3 colored numbers (dark / green / red) plus green-bold success rate. Pipes are lighter gray.
3. **Dashboard page check (manual):** open `/dashboard/billing`. The 4 summary cards above the tabs are gone. Tabs and export dialog still work.
4. **Channels page check (manual, desktop):** each channel card shows the HealthBar as `[Badge] [12 dots] | [12 dots] [96% | 320ms]` on one line, all baseline-aligned. **Mobile check:** the compact row (no dots, no divider) still renders below the name block.
5. **HealthBar colors unchanged:** yellow quota dots, red failure dots, gray no-data dots, green success dots all render in their respective halves as before.

---

## Out of Scope

- Other channels-page UI changes (already addressed in prior polish spec).
- The `a` (aliased pricing refresh) and `c` (per-model export alias join) review findings remain open per earlier user direction.
- Dashboard stats page (`/dashboard`) — those chart cards are unrelated to this spec.
- Any new analytics endpoints, new DB columns, or new admin pages.

---

## Files Changed Summary

| File | Change |
|---|---|
| `src/lib/billing.ts` | Replace 2 gray `cell.value =` strings with rich-text run arrays; per-field colors. |
| `src/app/dashboard/billing/page.tsx` | Delete 4 summary badge cards + unused summary state/imports. |
| `src/app/dashboard/channels/page.tsx` | Split 24-dot row into two 12-dot halves with `w-px h-4 bg-gray-300` divider. |