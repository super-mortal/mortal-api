# Dashboard Stats/Timezone/LogDetail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix timezone handling to use Beijing time, repair dashboard stats (today default + correct date range), and add expandable log detail rows.

**Architecture:** Store all `created_at` values as Beijing time strings in SQLite, update display functions to handle Beijing time input, fix SQL queries to use Beijing time, add auto-refresh to dashboard, and add row-expand to logs table.

**Tech Stack:** Next.js 16, TypeScript, SQLite via better-sqlite3, Recharts, Tailwind CSS v4

## Global Constraints

- All `created_at` defaults: `DEFAULT (datetime('now', '+8 hours'))`
- Migration must be idempotent via `_migrations` tracking table
- `toBeijing()` / `toBeijingFull()` must handle `"YYYY-MM-DD HH:MM:SS"` as Beijing time (no double-conversion)
- Dashboard "today" default: `activeDate` init to `'today'`, send `YYYY-MM-DD 00:00:00` to `YYYY-MM-DD 23:59:59`
- Log expand: single row at a time, `<td colspan={7}>` with detail card
- No new columns, no API format changes

---

### Task 1: DB Schema — Beijing Time Defaults & Migration

**Files:**
- Modify: `src/lib/db.ts`

**Interfaces:**
- Consumes: existing `initSchema()` function structure
- Produces: `_migrations` table (idempotent migration tracking), all `created_at` DEFAULTs changed to `datetime('now', '+8 hours')`, migration `v2_timezone_beijing` applies `+8 hours` to all existing timestamp data

- [ ] **Step 1: Update all `DEFAULT` values in `initSchema()`**

In `src/lib/db.ts`, find each `DEFAULT (datetime('now'))` and change to `DEFAULT (datetime('now', '+8 hours'))`. There are 6 occurrences across 3 tables:

Table `relay_keys`:
```sql
created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
```

Table `channels`:
```sql
created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
```

Table `channel_models`:
```sql
created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
```

Table `model_aliases`:
```sql
created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
```

Table `call_logs`:
```sql
created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
```

These `CREATE TABLE IF NOT EXISTS` statements only affect new tables, so existing tables need the migration in Step 3.

- [ ] **Step 2: Add `_migrations` table to schema**

Add this table creation inside `initSchema()` alongside the other CREATE statements:

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);
```

- [ ] **Step 3: Add Beijing-time data migration at end of `initSchema()`**

At the end of `initSchema()`, after all table and column migrations, add:

```typescript
// Migration: convert existing UTC timestamps to Beijing time (+8h)
const beijingMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v2_timezone_beijing'").get();
if (!beijingMigrated) {
  db.exec(`
    UPDATE relay_keys SET created_at = datetime(created_at, '+8 hours'), updated_at = datetime(updated_at, '+8 hours');
    UPDATE channels SET created_at = datetime(created_at, '+8 hours');
    UPDATE channel_models SET created_at = datetime(created_at, '+8 hours');
    UPDATE model_aliases SET created_at = datetime(created_at, '+8 hours');
    UPDATE call_logs SET created_at = datetime(created_at, '+8 hours');
    INSERT INTO _migrations (name) VALUES ('v2_timezone_beijing');
  `);
}
```

- [ ] **Step 4: Verify build succeeds**

```bash
cd "D:\project\mortal-api"
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors (or only pre-existing ones unrelated to our changes).

- [ ] **Step 5: Commit**

```bash
cd "D:\project\mortal-api"
git add src/lib/db.ts
git commit -m "fix: store created_at in Beijing time, add idempotent migration"
```

---

### Task 2: Date Display Functions — Handle Beijing Time Input

**Files:**
- Modify: `src/lib/date.ts`

**Interfaces:**
- Consumes: stored Beijing time strings (`"YYYY-MM-DD HH:MM:SS"`)
- Produces: `toBeijing(beijingDate: string): string` — formats without double-conversion by appending `+08:00` before parse
- Produces: `toBeijingFull(beijingDate: string): string` — same with seconds

- [ ] **Step 1: Update `toBeijing()` to handle Beijing time input**

Replace the current function:

```typescript
export function toBeijing(beijingDate: string): string {
  const d = new Date(beijingDate.replace(' ', 'T') + '+08:00');
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
```

- [ ] **Step 2: Update `toBeijingFull()` to handle Beijing time input**

```typescript
export function toBeijingFull(beijingDate: string): string {
  const d = new Date(beijingDate.replace(' ', 'T') + '+08:00');
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
```

- [ ] **Step 3: Verify build succeeds**

```bash
cd "D:\project\mortal-api"
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
cd "D:\project\mortal-api"
git add src/lib/date.ts
git commit -m "fix: update toBeijing() to handle stored Beijing time strings"
```

---

### Task 3: SQL Queries — Align `datetime('now')` to Beijing Time

**Files:**
- Modify: `src/app/admin/stats/route.ts`
- Modify: `src/lib/logs.ts`

**Interfaces:**
- Consumes: `created_at` now stores Beijing time strings
- Log route date filters unchanged (both sides already Beijing time)
- Stats route: `datetime('now', ?)` → `datetime('now', '+8 hours', ?)` on all callers

- [ ] **Step 1: Update `stats/route.ts` — replace all `datetime('now', ...)` with `datetime('now', '+8 hours', ...)`**

Current code at line 33:
```typescript
where.push("created_at >= datetime('now', ?)");
params.push(`-${days} days`);
```

Change to:
```typescript
where.push("created_at >= datetime('now', '+8 hours', ?)");
params.push(`-${days} days`);
```

This is the only `datetime('now')` usage in this file.

- [ ] **Step 2: Update `logs.ts` — `getStats()` function, replace `datetime('now', ...)`**

Current code at lines 116, 127, 138, 151:
```typescript
WHERE created_at >= datetime('now', ?)
```

Change all 4 occurrences to:
```typescript
WHERE created_at >= datetime('now', '+8 hours', ?)
```

Specifically lines 116, 127, 138, and 151 in `src/lib/logs.ts`.

- [ ] **Step 3: Verify build succeeds**

```bash
cd "D:\project\mortal-api"
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
cd "D:\project\mortal-api"
git add src/app/admin/stats/route.ts src/lib/logs.ts
git commit -m "fix: align datetime('now') queries to Beijing time (+8h)"
```

---

### Task 4: Dashboard Page — Default Today, Date Fix, Auto-Refresh

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `activeDate` state (previously `'7d'` → now `'today'`), `buildUrl()` constructs query params
- Wire protocol: `GET /admin/stats?start_date=YYYY-MM-DD%2000:00:00&end_date=YYYY-MM-DD%2023:59:59` for "today" mode

- [ ] **Step 1: Change default `activeDate` from `'7d'` to `'today'`**

Find line around 32:
```typescript
const [activeDate, setActiveDate] = useState('7d');
```

Change to:
```typescript
const [activeDate, setActiveDate] = useState('today');
```

- [ ] **Step 2: Fix `buildUrl()` today branch to send proper date range**

Find around line 46:
```typescript
if (activeDate === 'today') {
  const d = new Date();
  params.set('start_date', d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
```

Replace with:
```typescript
if (activeDate === 'today') {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  params.set('start_date', `${y}-${m}-${d} 00:00:00`);
  params.set('end_date', `${y}-${m}-${d} 23:59:59`);
}
```

- [ ] **Step 3: Add auto-refresh timer (60s interval) for today mode**

After the existing `useEffect(() => { fetchStats(); }, [fetchStats]);` around line 70, add:

```typescript
// Auto-refresh every 60s when viewing today
useEffect(() => {
  if (activeDate !== 'today') return;
  const timer = setInterval(() => { fetchStats(); }, 60000);
  return () => clearInterval(timer);
}, [activeDate, fetchStats]);
```

- [ ] **Step 4: Verify build succeeds**

```bash
cd "D:\project\mortal-api"
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
cd "D:\project\mortal-api"
git add src/app/dashboard/page.tsx
git commit -m "fix: default stats to today, fix date range, add 60s auto-refresh"
```

---

### Task 5: Log Page — Inline Row Expand for Details

**Files:**
- Modify: `src/app/dashboard/logs/page.tsx`

**Interfaces:**
- Consumes: `CallLog` type with fields `{ id, relay_key_name, relay_key_id, model, channel_name, prompt_tokens, completion_tokens, total_tokens, cached_input_tokens, cost, status, error_message, ip, created_at }`
- Produces: expanded detail row via `expandedLogId` state (string | null)

- [ ] **Step 1: Add `expandedLogId` state and toggle handler**

After the existing state declarations around line 20-34, add:

```typescript
const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

const toggleExpand = (id: string) => {
  setExpandedLogId(prev => prev === id ? null : id);
};
```

- [ ] **Step 2: Add click handler to table rows and expandable detail row**

Find the `<tr>` around line 198 and add `onClick` and cursor style. Replace the opening `<tr>` tag:

Current:
```tsx
<tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
```

Change `className` to add cursor pointer, and add `onClick`:
```tsx
<tr key={log.id}
  className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
  onClick={() => toggleExpand(log.id)}
>
```

After each closing `</tr>` tag for a log row, add the expanded detail row:

```tsx
{expandedLogId === log.id && (
  <tr key={`detail-${log.id}`} className="bg-gray-50/50 border-b border-gray-100">
    <td colSpan={7} className="px-4 sm:px-6 py-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <DetailField label="时间" value={toBeijingFull(log.created_at)} />
          <DetailField label="Key" value={log.relay_key_name} />
          <DetailField label="渠道" value={log.channel_name || '-'} />
          <DetailField label="模型" value={log.model} />
          <DetailField label="费用" value={log.cost ? log.cost.toFixed(6) : '0'} />
          <DetailField label="IP" value={log.ip || '-'} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <TokenBadge label="输入" value={log.prompt_tokens} />
          <TokenBadge label="输出" value={log.completion_tokens} />
          {log.cached_input_tokens > 0 && (
            <TokenBadge label="缓存输入" value={log.cached_input_tokens} color="emerald" />
          )}
          <TokenBadge label="未缓存输入" value={Math.max(0, log.prompt_tokens - (log.cached_input_tokens || 0))} color="amber" />
          <TokenBadge label="总 Token" value={log.total_tokens} color="indigo" />
        </div>
        {log.status === 'fail' && log.error_message && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <InlineIcon name="triangleAlert" className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-medium text-red-600">错误信息</span>
            </div>
            <p className="text-xs text-red-600 break-all whitespace-pre-wrap leading-relaxed">{log.error_message}</p>
          </div>
        )}
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <InlineIcon name="clock" className="w-3 h-3" />
          <span>日志 ID: {log.id}</span>
          <span className="text-gray-200">|</span>
          <span>{log.channel_name || '-'}</span>
        </div>
      </div>
    </td>
  </tr>
)}
```

- [ ] **Step 3: Add helper components at the bottom of the file (before export, or inside the component)**

Add these helper render functions before the component return, or as internal components:

```tsx
function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-gray-400 block">{label}</span>
      <span className="text-xs text-gray-800 font-medium">{value}</span>
    </div>
  );
}

function TokenBadge({ label, value, color = 'gray' }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium ${colorMap[color] || colorMap.gray}`}>
      <span className="opacity-60">{label}:</span>
      <span>{value.toLocaleString()}</span>
    </span>
  );
}
```

- [ ] **Step 4: Verify build succeeds**

```bash
cd "D:\project\mortal-api"
npx tsc --noEmit 2>&1 | head -20
```

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
cd "D:\project\mortal-api"
git add src/app/dashboard/logs/page.tsx
git commit -m "feat: add inline row expand for log detail (tokens, error msg, metadata)"
```
