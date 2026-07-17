# Task 3: SQL Queries — Align `datetime('now')` to Beijing Time

From the plan:

**Files:**
- Modify: `src/app/admin/stats/route.ts`
- Modify: `src/lib/logs.ts`

### Changes Needed

**In `stats/route.ts`** (1 change):

Find:
```typescript
where.push("created_at >= datetime('now', ?)");
params.push(`-${days} days`);
```

Change to:
```typescript
where.push("created_at >= datetime('now', '+8 hours', ?)");
params.push(`-${days} days`);
```

**In `src/lib/logs.ts`** — `getStats()` function (4 changes):

There are 4 occurrences of `datetime('now', ?)` in `getStats()` (at approx lines 116, 127, 138, 151). Change each to `datetime('now', '+8 hours', ?)`.

### Verification
- Run `npx tsc --noEmit` and confirm no new errors
