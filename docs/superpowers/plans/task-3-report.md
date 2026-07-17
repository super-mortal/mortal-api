# Task 3 Report: Align `datetime('now')` Queries to Beijing Time

## Changes Made

### `src/app/admin/stats/route.ts` (1 change)
- Line 33: `datetime('now', ?)` → `datetime('now', '+8 hours', ?)` in the relative date WHERE clause.

### `src/lib/logs.ts` — `getStats()` function (4 changes)
- Line 116: `datetime('now', ?)` → `datetime('now', '+8 hours', ?)` in stats query.
- Line 126: `datetime('now', ?)` → `datetime('now', '+8 hours', ?)` in dailyStats query.
- Line 137: `datetime('now', ?)` → `datetime('now', '+8 hours', ?)` in modelStats query.
- Line 151: `datetime('now', '-1 day')` → `datetime('now', '+8 hours', '-1 day')` in hourlyStats query.

## Verification
- `npx tsc --noEmit` passed with no errors.
- Committed as `807b22a` with message: `fix: align datetime('now') queries to Beijing time (+8h)`
