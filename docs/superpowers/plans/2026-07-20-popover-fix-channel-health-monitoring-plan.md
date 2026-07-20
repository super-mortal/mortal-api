# Popover 裁剪修复 + 渠道健康状态模型与监控 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Popover 下拉裁剪 + 重构渠道健康状态模型（区分额度冷却/真故障）+ 添加定时健康探测 + 优化渠道卡片 UI（单一状态徽标 + 健康状态条）。

**Architecture:** 四个相对独立的子系统：(A) Popover 组件改为 portal+fixed 定位；(B) 数据库扩充（cooldown_until, fail_count, channel_health_checks 表）+ 核心健康记录函数 + proxy 错误分类；(C) 进程内定时探测调度器；(D) 前端合并状态徽标 + UptimeRobot 式状态条 + 可用率展示。B→C→D 有依赖，A 完全独立。

**Tech Stack:** Next.js 16 App Router, SQLite (better-sqlite3), Tailwind CSS v4, React 19

## Global Constraints

- All `<InlineIcon name="...">` use kebab-case names from `src/lib/icon.tsx`; NO CDN, icons load from `public/icons/*.svg` or inline `icons` object.
- DB migrations use `_migrations` table with idempotent `INSERT INTO _migrations (name) VALUES ('...')` guard + `PRAGMA table_info('...')` column-existence check.
- All timestamps use Beijing time (UTC+8): `datetime('now', '+8 hours')`.
- No external cron dependencies — timer lives in-process via `globalThis` singleton.
- All probe HTTP calls use `AbortSignal.timeout(10000)` (10s timeout).
- Back-office pages are `'use client'` + Tailwind light theme (white/gray + indigo-500 primary).

---
## Files

| File | Status | Responsibility |
|---|---|---|
| `src/lib/popover.tsx` | MODIFY | Portal+fixed fix (Task 1) |
| `src/lib/db.ts` | MODIFY | Schema migration (Task 2) |
| `src/lib/proxy.ts` | MODIFY | Add `err.kind` to thrown errors (Task 2) |
| `src/lib/channels.ts` | MODIFY | `recordChannelSuccess`, `recordChannelFailure`, unified availability helper, `getChannelHealthSummary` (Task 2/3) |
| `src/app/v1/chat/completions/route.ts` | MODIFY | Converge to `recordChannel*` (Task 3) |
| `src/lib/health-monitor.ts` | CREATE | Process timer scheduler (Task 4) |
| `src/instrumentation.ts` | CREATE | Next.js startup hook (Task 4) |
| `src/lib/health-badge.tsx` | CREATE | Combined status badge + uptime bar component (Task 5) |
| `src/app/dashboard/channels/page.tsx` | MODIFY | UI — merged badge, status bar, layout (Task 5) |
| `src/app/admin/channels/route.ts` | MODIFY | Return health summary in GET (Task 5) |
| `src/app/admin/backup/route.ts` | MODIFY | Backup/restore new columns (Task 2) |

### Task Dependencies

```
Task 1 (Popover)    — independent, can run anytime
Task 2 (DB+records) — foundation for Tasks 3 & 4
Task 3 (availability+route converge) — depends on Task 2
Task 4 (monitor scheduler) — depends on Task 2
Task 5 (UI) — depends on Task 2 (schema) + Task 4 (history data)
```

---

### Task 1: Popover 组件 Portal+Fixed 改造

**Files:**
- Modify: `src/lib/popover.tsx`

**Interfaces:**
- No interface changes — retains `Popover({ trigger, children, open?, onOpenChange?, align?})` exactly as before.
- No consuming code changes.

- [ ] **Step 1: Update imports and add state/refs**

```tsx
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
```

After the existing `const [internalOpen, setInternalOpen] = useState(false);` line, add:

```tsx
const triggerRef = useRef<HTMLDivElement>(null);
const dropdownRef = useRef<HTMLDivElement>(null);
const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number; flip: boolean } | null>(null);
```

- [ ] **Step 2: Add positioning useLayoutEffect**

After the existing outside-click `useEffect`, add:

```tsx
useLayoutEffect(() => {
  if (!isOpen) { setDropPos(null); return; }
  const update = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const dropH = dropdownRef.current?.offsetHeight ?? 200;
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom;
    const flip = spaceBelow < dropH + gap && r.top > spaceBelow;
    setDropPos({
      left: r.left,
      width: r.width,
      flip,
      top: flip ? r.top - Math.min(dropH, r.top - gap) - gap : r.bottom + gap,
    });
  };
  update();
  window.addEventListener('scroll', update, true);
  window.addEventListener('resize', update);
  return () => {
    window.removeEventListener('scroll', update, true);
    window.removeEventListener('resize', update);
  };
}, [isOpen]);
```

- [ ] **Step 3: Update outside-click handler**

Change the existing `useEffect` outside-click handler to also check `dropdownRef.current`:

```tsx
useEffect(() => {
  const handler = (e: MouseEvent) => {
    const t = e.target as Node;
    const triggerEl = ref.current?.querySelector('[data-popover-trigger]') || ref.current?.firstElementChild;
    if (triggerEl?.contains(t) || dropdownRef.current?.contains(t)) return;
    setIsOpen(false);
  };
  if (isOpen) {
    document.addEventListener('mousedown', handler);
  }
  return () => document.removeEventListener('mousedown', handler);
}, [isOpen, setIsOpen]);
```

- [ ] **Step 4: Add `data-popover-trigger` to the trigger wrapper**

Change the trigger div from:
```tsx
<div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
  {trigger}
</div>
```
to:
```tsx
<div data-popover-trigger onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
  {trigger}
</div>
```

- [ ] **Step 5: Replace the floating div with portal+fixed**

Replace the existing `{isOpen && (<div className="absolute z-50...">...</div>)}` block with:

```tsx
{isOpen && dropPos && createPortal(
  <div
    ref={dropdownRef}
    className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-lg py-2 px-3 min-w-[140px] max-h-60 overflow-y-auto"
    style={{
      top: dropPos.top,
      left: dropPos.left,
      width: dropPos.width,
    }}
    onClick={(e) => e.stopPropagation()}
  >
    {children}
  </div>,
  document.body
)}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 7: Commit**

```bash
git add src/lib/popover.tsx
git commit -m "fix: render Popover in portal with fixed positioning to escape overflow clipping"
```

---

### Task 2: DB 迁移 + 核心健康记录函数 + Proxy 错误分类

**Files:**
- Modify: `src/lib/db.ts` (migration)
- Modify: `src/lib/proxy.ts` (err.kind)
- Modify: `src/lib/channels.ts` (record functions)
- Modify: `src/app/admin/backup/route.ts` (backup/restore new columns)

**Interfaces:**
- Consumes: existing `updateChannelHealth`, `getChannelById`
- Produces:
  - `channels.ts`:
    - `recordChannelSuccess(channelId: string): void`
    - `recordChannelFailure(channelId: string, kind: 'quota' | 'failure'): void`
    - `isChannelAvailable(channel: { health_status: string; is_active: number; cooldown_until: string | null; last_health_check: string | null }): boolean` — pure function, SQL-compatible helper
    - `AVAILABLE_CHANNEL_SQL: string` — reusable SQL snippet
  - `proxy.ts`: thrown errors gain `err.kind: 'quota' | 'failure'`

**Migration name:** `v4_channel_cooldown`

- [ ] **Step 1: Add DB migration in `src/lib/db.ts`**

After the existing `v3_add_is_pinned` migration block (around line 166), add:

```typescript
// Migration: add cooldown_until, fail_count to channels + channel_health_checks table
const cooldownMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v4_channel_cooldown'").get();
if (!cooldownMigrated) {
  const chCols = db.prepare("PRAGMA table_info('channels')").all() as { name: string }[];
  if (!chCols.find(c => c.name === 'cooldown_until')) {
    db.exec("ALTER TABLE channels ADD COLUMN cooldown_until TEXT");
  }
  if (!chCols.find(c => c.name === 'fail_count')) {
    db.exec("ALTER TABLE channels ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_health_checks (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      checked_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      ok INTEGER NOT NULL,
      kind TEXT,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_health_checks_channel_time ON channel_health_checks(channel_id, checked_at DESC);
  `);
  db.prepare("INSERT INTO _migrations (name) VALUES ('v4_channel_cooldown')").run();
}
```

- [ ] **Step 2: Add `err.kind` to proxy error throws**

In `src/lib/proxy.ts`, in both `callUpstream` and `callUpstreamStreaming`, change the error-throwing block. After `err.status = res.status; err.body = text;` add:

```typescript
err.kind = res.status === 429 ? 'quota' : 'failure';
```

The code is identical in both functions (lines ~77 and ~121). Result in both:
```typescript
if (!res.ok) {
  const text = await res.text();
  const err: any = new Error(text);
  err.status = res.status;
  err.body = text;
  err.kind = res.status === 429 ? 'quota' : 'failure';
  throw err;
}
```

- [ ] **Step 3: Add recordChannelSuccess and recordChannelFailure to `src/lib/channels.ts`**

After `updateChannelHealth` (line 49), add:

```typescript
export function recordChannelSuccess(channelId: string) {
  const db = getDb();
  db.prepare(`
    UPDATE channels SET
      health_status = 'healthy',
      fail_count = 0,
      cooldown_until = NULL,
      last_health_check = datetime('now', '+8 hours')
    WHERE id = ?
  `).run(channelId);
}

export function recordChannelFailure(channelId: string, kind: 'quota' | 'failure') {
  const db = getDb();
  const ch = getChannelById(channelId);
  if (!ch) return;

  if (kind === 'quota') {
    // 额度上限 → 固定 6 小时冷却
    db.prepare(`
      UPDATE channels SET
        health_status = 'cooling_down',
        cooldown_until = datetime('now', '+8 hours', '+6 hours'),
        last_health_check = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(channelId);
  } else {
    // 真故障 → 指数退避（1→5→15→30 分钟封顶）
    const nextFailCount = (ch.fail_count || 0) + 1;
    const backoffMinutes = Math.min(30, [1, 5, 15][nextFailCount - 1] || 15);
    // If nextFailCount > 3, use 15 (nextFailCount=4→15, 5→30, 6→30, etc.)
    const finalBackoff = nextFailCount <= 1 ? 1 : nextFailCount <= 2 ? 5 : Math.min(30, nextFailCount <= 3 ? 15 : 15 * Math.ceil(nextFailCount / 3));
    db.prepare(`
      UPDATE channels SET
        health_status = 'unhealthy',
        fail_count = ?,
        cooldown_until = datetime('now', '+8 hours', '+' || ? || ' minutes'),
        last_health_check = datetime('now', '+8 hours')
      WHERE id = ?
    `).run(finalBackoff, finalBackoff, channelId);
  }
}
```

- [ ] **Step 4: Add unified availability helper**

After `recordChannelFailure`, add:

```typescript
export function isChannelAvailable(ch: { is_active: number; cooldown_until: string | null; health_status: string }): boolean {
  if (!ch.is_active) return false;
  if (ch.cooldown_until && ch.cooldown_until > new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)) {
    return false;
  }
  return true;
}

export const AVAILABLE_CHANNEL_SQL = `(
  c.is_active = 1
  AND (
    c.cooldown_until IS NULL
    OR c.cooldown_until <= datetime('now', '+8 hours')
  )
)`;
```

Note: The `cooldown_until` stores Beijing-time strings, so `datetime('now', '+8 hours')` comparison is correct.

- [ ] **Step 5: Add `getChannelHealthSummary`**

After `isChannelAvailable`, add:

```typescript
export function getChannelHealthSummary(channelIds: string[]): Record<string, { recent_checks: any[]; uptime_pct: number; avg_latency_ms: number }> {
  if (channelIds.length === 0) return {};
  const db = getDb();

  // Get up to 30 most recent checks per channel via correlated subquery approach
  const results: Record<string, { recent_checks: any[]; uptime_pct: number; avg_latency_ms: number }> = {};

  for (const chId of channelIds) {
    const checks = db.prepare(`
      SELECT checked_at, ok, kind, latency_ms, error FROM channel_health_checks
      WHERE channel_id = ?
      ORDER BY checked_at DESC LIMIT 30
    `).all(chId) as any[];

    const recent = checks.reverse(); // chrono order for UI
    const successCount = checks.filter((c: any) => c.ok === 1).length;
    const totalLatency = checks.reduce((s: number, c: any) => s + (c.latency_ms || 0), 0);

    results[chId] = {
      recent_checks: recent,
      uptime_pct: checks.length > 0 ? Math.round((successCount / checks.length) * 100) : 100,
      avg_latency_ms: checks.length > 0 ? Math.round(totalLatency / checks.length) : 0,
    };
  }

  return results;
}
```

Note: For small channel counts (< 100) this N+1 pattern is fine. If scale becomes an issue, convert to a single SQL window query later.

- [ ] **Step 6: Update `src/app/admin/backup/route.ts` backup query to include new columns**

Find the `INSERT INTO channels` in the backup route (line 50). The channel INSERT already includes `cooldown_until` and `fail_count` only if the backup data has them. Add these columns to the SELECT:

In the backup query (around line 45-55), ensure the SELECT includes `cooldown_until`, `fail_count`. The INSERT already lists those columns² — just make sure the SELECT query fetches them:

```typescript
// Within backup INSERT loop — read the INSERT line (around line 50)
// The INSERT already has cooldown_until positions (it's after health_status etc.)
// but the SELECT needs to include them. Change the SELECT to:
const channels = db.prepare('SELECT id, name, base_url, api_key, priority, notes, is_active, health_status, cooldown_until, fail_count, last_health_check, created_at FROM channels').all() as any[];
```

Also ensure the INSERT uses default/coalesce for values that may be NULL:
The current INSERT:
```typescript
insertCh.run(c.id, c.name, baseUrl, reEncrypted, c.priority || 0, notes, c.is_active, c.health_status || 'unknown', c.last_health_check || null, c.created_at);
```
should have `c.cooldown_until || null` and `c.fail_count || 0` appended/addressed. Actually looking at line 50, the INSERT already has 10 placeholders. Need to add 2 more for cooldown_until and fail_count.

Let me check the exact current INSERT:
```
50:     const insertCh = db.prepare('INSERT INTO channels (id, name, base_url, api_key, priority, notes, is_active, health_status, last_health_check, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
55:     insertCh.run(c.id, c.name, baseUrl, reEncrypted, c.priority || 0, notes, c.is_active, c.health_status || 'unknown', c.last_health_check || null, c.created_at);
```

Change to:
```typescript
const insertCh = db.prepare('INSERT INTO channels (id, name, base_url, api_key, priority, notes, is_active, health_status, cooldown_until, fail_count, last_health_check, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
insertCh.run(c.id, c.name, baseUrl, reEncrypted, c.priority || 0, notes, c.is_active, c.health_status || 'unknown', c.cooldown_until || null, c.fail_count || 0, c.last_health_check || null, c.created_at);
```

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 8: Commit**

```bash
git add src/lib/db.ts src/lib/proxy.ts src/lib/channels.ts src/app/admin/backup/route.ts
git commit -m "feat: add cooldown_until, fail_count, channel_health_checks & recordChannelSuccess/Failure"
```

---

### Task 3: 统一可用性判断 + route.ts 收敛

**Files:**
- Modify: `src/lib/channels.ts` (resolveModel, getModelsForAuto → use AVAILABLE_CHANNEL_SQL)
- Modify: `src/app/v1/chat/completions/route.ts` (converge to record functions)

**Interfaces:**
- Consumes: `recordChannelSuccess`, `recordChannelFailure`, `AVAILABLE_CHANNEL_SQL` from Task 2
- No new external interfaces

- [ ] **Step 1: Fix `getModelsForAuto` to use `AVAILABLE_CHANNEL_SQL`**

In `src/lib/channels.ts`, replace the current `getModelsForAuto` function (lines 170-182) with:

```typescript
export function getModelsForAuto(): { modelId: string; channel: Channel }[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT cm.model_id, c.* FROM channel_models cm
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE cm.is_active = 1 AND ${AVAILABLE_CHANNEL_SQL}
  `).all() as any[];
  return rows.map(r => ({ modelId: r.model_id, channel: r as Channel }));
}
```

This removes the old hardcoded 6h check (`datetime('now', '+8 hours', '-6 hours')`) — now it uses the unified `cooldown_until`-based check from Task 2, which works for both quota (6h) and failure (backoff) channels.

- [ ] **Step 2: Fix `resolveModel` to use `AVAILABLE_CHANNEL_SQL` for true exclusion**

In `src/lib/channels.ts`, find both SQL queries inside `resolveModel` (lines 124-137 and 142-154 and 158-164). Each has `c.is_active = 1` in the WHERE clause. Append the `AVAILABLE_CHANNEL_SQL` condition.

For the first alias query (allowed channels, line 124-137), change:
```sql
WHERE ma.alias_name = ? AND ma.is_active = 1 AND c.is_active = 1
```
to:
```sql
WHERE ma.alias_name = ? AND ma.is_active = 1 AND ${AVAILABLE_CHANNEL_SQL}
```

For the second alias query (fallback, line 146), same change.

For the direct model query (line 158-164), add `AND ${AVAILABLE_CHANNEL_SQL.replace(/c\./g, '')}` but note it uses `c.is_active as ch_active`. The `AVAILABLE_CHANNEL_SQL` uses `c.` prefix which is fine since the query aliases channels as `c` via `LEFT JOIN channels c`.

- [ ] **Step 3: Converge `route.ts` to use `recordChannelSuccess`/`recordChannelFailure`**

In `src/app/v1/chat/completions/route.ts`:

1. Add import:
```typescript
import { recordChannelSuccess, recordChannelFailure } from '@/lib/channels';
```

2. Replace ALL calls to `updateChannelHealth(id, 'healthy')` with `recordChannelSuccess(id)`.

There are about 5-6 such calls:
- Line 114: `updateChannelHealth(autoChannel.id, 'healthy');` → `recordChannelSuccess(autoChannel.id);`
- Line 277: `updateChannelHealth(channel.id, 'healthy');` → `recordChannelSuccess(channel.id);`
- Line 327: `updateChannelHealth(channel.id, 'healthy');` → `recordChannelSuccess(channel.id);`

Replace these carefully.

3. Replace `updateChannelHealth(id, 'cooling_down')` with `recordChannelFailure(id, 'quota')`:

- Line 171: `updateChannelHealth(autoChannel.id, isRateLimit ? 'cooling_down' : 'unhealthy');` → this needs to be split. Replace with:
```typescript
if (isRateLimit) {
  recordChannelFailure(autoChannel.id, 'quota');
} else {
  recordChannelFailure(autoChannel.id, 'failure');
}
```

- Line 338: `updateChannelHealth(channel.id, 'cooling_down');` → `recordChannelFailure(channel.id, 'quota');`

4. Replace `updateChannelHealth(id, 'unhealthy')` with `recordChannelFailure(id, 'failure')`:
- Line 68: `updateChannelHealth(autoChannel.id, 'unhealthy');` → `recordChannelFailure(autoChannel.id, 'failure');`
- Line 164: `updateChannelHealth(autoChannel.id, 'healthy');` → `recordChannelSuccess(autoChannel.id);`
- Line 225: `updateChannelHealth(channel.id, 'unhealthy');` → `recordChannelFailure(channel.id, 'failure');`
- Line 347: `updateChannelHealth(channel.id, lastError.status === 429 ? 'cooling_down' : 'unhealthy');` → `recordChannelFailure(channel.id, lastError?.status === 429 ? 'quota' : 'failure');`

5. Remove the now-unused `updateChannelHealth` import (keep if still used elsewhere, or let the linter handle it).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/lib/channels.ts src/app/v1/chat/completions/route.ts
git commit -m "fix: unify channel availability (resolveModel + getModelsForAuto) & converge route.ts to recordChannel*"
```

---

### Task 4: 健康探测调度器 + instrumentation.ts

**Files:**
- Create: `src/lib/health-monitor.ts`
- Create: `src/instrumentation.ts`

**Interfaces:**
- Consumes: `recordChannelSuccess`, `recordChannelFailure` from Task 2, `listChannels` from `channels.ts`
- Produces: `startHealthMonitor()` (auto-called from instrumentation.ts)

- [ ] **Step 1: Create `src/lib/health-monitor.ts`**

```typescript
// ============================================================
// Channel health monitor — periodic probing + history recording
// ============================================================
import { getDb } from './db';
import { listChannels } from './channels';
import { getChatUrl } from './proxy';
import { recordChannelSuccess, recordChannelFailure } from './channels';
import { nanoid } from 'nanoid';

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const PROBE_TIMEOUT_MS = 10000;

let started = false;

export function startHealthMonitor(): void {
  if (started) return;
  started = true;

  // Run one round immediately on startup
  runHealthCheck().catch(() => {});

  // Schedule recurring rounds
  setInterval(() => {
    runHealthCheck().catch(() => {});
  }, INTERVAL_MS);
}

export async function runHealthCheck(): Promise<void> {
  const channels = listChannels().filter(c => c.is_active);
  for (const ch of channels) {
    try {
      await probeChannel(ch);
    } catch {
      // Individual channel probe failure shouldn't stop others
    }
  }
}

export async function probeChannel(ch: {
  id: string; name: string; base_url: string; api_key: string;
}): Promise<{ ok: boolean; kind: string | null; latency_ms: number; error: string | null }> {
  const db = getDb();
  const start = Date.now();

  try {
    // Find first active model for this channel
    const modelRow = db.prepare(`
      SELECT model_id FROM channel_models WHERE channel_id = ? AND is_active = 1 LIMIT 1
    `).get(ch.id) as { model_id: string } | undefined;

    const url = getChatUrl(ch.base_url);
    const body = modelRow
      ? { model: modelRow.model_id, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }
      : undefined;

    // If no model, fall back to GET /models endpoint
    if (!body) {
      const modelsUrl = url.replace(/\/chat\/completions$/, '/models');
      const res = await fetch(modelsUrl, {
        headers: { Authorization: `Bearer ${ch.api_key || ''}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const latency = Date.now() - start;
      if (res.ok) {
        recordChannelSuccess(ch.id);
        insertHealthCheck(ch.id, 1, null, latency, null);
        return { ok: true, kind: null, latency_ms: latency, error: null };
      }
      const kind = res.status === 429 ? 'quota' : 'failure';
      recordChannelFailure(ch.id, kind);
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      insertHealthCheck(ch.id, 0, kind, latency, errText.slice(0, 300));
      return { ok: false, kind, latency_ms: latency, error: errText.slice(0, 300) };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ch.api_key || ''}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const latency = Date.now() - start;

    if (res.ok) {
      recordChannelSuccess(ch.id);
      insertHealthCheck(ch.id, 1, null, latency, null);
      return { ok: true, kind: null, latency_ms: latency, error: null };
    }

    const kind = res.status === 429 ? 'quota' : 'failure';
    recordChannelFailure(ch.id, kind);
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    insertHealthCheck(ch.id, 0, kind, latency, errText.slice(0, 300));
    return { ok: false, kind, latency_ms: latency, error: errText.slice(0, 300) };
  } catch (e: any) {
    const latency = Date.now() - start;
    const error = e?.message || e?.code || 'Probe failed';
    recordChannelFailure(ch.id, 'failure');
    insertHealthCheck(ch.id, 0, 'failure', latency, error.slice(0, 300));
    return { ok: false, kind: 'failure', latency_ms: latency, error: error.slice(0, 300) };
  }
}

function insertHealthCheck(channelId: string, ok: number, kind: string | null, latencyMs: number, error: string | null) {
  const db = getDb();
  db.prepare(`
    INSERT INTO channel_health_checks (id, channel_id, checked_at, ok, kind, latency_ms, error)
    VALUES (?, ?, datetime('now', '+8 hours'), ?, ?, ?, ?)
  `).run(nanoid(16), channelId, ok, kind, latencyMs, error);
}
```

- [ ] **Step 2: Create `src/instrumentation.ts`**

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startHealthMonitor } = await import('@/lib/health-monitor');
    startHealthMonitor();
  }
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add src/lib/health-monitor.ts src/instrumentation.ts
git commit -m "feat: add periodic health probe scheduler and Next.js instrumentation hook"
```

---

### Task 5: 渠道卡片 UI（单一状态徽标 + 状态条 + 可用率）

**Files:**
- Create: `src/lib/health-badge.tsx`
- Modify: `src/app/dashboard/channels/page.tsx`
- Modify: `src/app/admin/channels/route.ts`

**Interfaces:**
- Consumes: `getChannelHealthSummary` from Task 2, `channel_health_checks` table data
- New component: `HealthBadge({ health_status, is_active, cooldown_until? })` — renders merged badge
- New component: `HealthBar({ recent_checks, uptime_pct, avg_latency_ms })` — renders status bar

- [ ] **Step 1: Create `src/lib/health-badge.tsx`**

```tsx
'use client';

interface HealthBadgeProps {
  health_status: string;
  is_active: number;
  cooldown_until?: string | null;
}

interface CheckItem {
  checked_at: string;
  ok: number;
  kind: string | null;
  latency_ms: number;
  error?: string | null;
}

interface HealthBarProps {
  recent_checks: CheckItem[];
  uptime_pct: number;
  avg_latency_ms: number;
}

const badgeConfig: Record<string, { cls: string; label: string; tooltip: string }> = {
  healthy:    { cls: 'bg-emerald-50 text-emerald-600',        label: '正常',      tooltip: '最近请求成功，渠道正常工作中' },
  cooling_down: { cls: 'bg-amber-50 text-amber-600',          label: '额度冷却',  tooltip: '因额度/限流原因暂不可用，按冷却时间自动恢复' },
  unhealthy: { cls: 'bg-red-50 text-red-500',                label: '异常',      tooltip: '渠道出现故障，正在按退避策略重试' },
  unknown:   { cls: 'bg-gray-100 text-gray-500',             label: '未检测',    tooltip: '尚未进行过健康检测' },
};

export function HealthBadge({ health_status, is_active, cooldown_until }: HealthBadgeProps) {
  if (!is_active) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-400" title="该渠道已被管理员停用">
        已停用
      </span>
    );
  }

  const cfg = badgeConfig[health_status] || badgeConfig.unknown;
  let tip = cfg.tooltip;
  if (health_status === 'cooling_down' && cooldown_until) {
    tip += ` — 预计 ${cooldown_until} 后恢复（管理员可手动检测提前恢复）`;
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.cls}`} title={tip}>
      {cfg.label}
    </span>
  );
}

export function HealthBar({ recent_checks, uptime_pct, avg_latency_ms }: HealthBarProps) {
  if (recent_checks.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="w-2 h-3 rounded-[2px] bg-gray-100" />
          ))}
        </div>
        <span className="text-[10px] text-gray-400">暂无数据</span>
      </div>
    );
  }

  const dotColor = (check: CheckItem) => {
    if (!check.ok) {
      if (check.kind === 'quota') return 'bg-amber-400';
      return 'bg-red-400';
    }
    return 'bg-emerald-400';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5 items-end">
        {recent_checks.map((check, i) => (
          <div
            key={i}
            className={`w-2 h-3 rounded-[2px] ${dotColor(check)}`}
            title={`${check.checked_at?.slice(0, 16) || '?'} · ${check.ok ? '成功' : (check.kind === 'quota' ? '额度上限' : '失败')} · ${check.latency_ms}ms${check.error ? ' · ' + check.error : ''}`}
          />
        ))}
      </div>
      <span className="text-[10px] text-gray-500 whitespace-nowrap">
        {uptime_pct}% · <span title="平均响应时间">{avg_latency_ms}ms</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Update `src/app/admin/channels/route.ts` to return health summary**

In the GET handler (around line 28), after getting channels, fetch and attach health summary:

```typescript
import { getChannelHealthSummary } from '@/lib/channels';

// Inside GET, after `const channels = listChannels()...`
const healthSummary = getChannelHealthSummary(channels.map(c => c.id));
const channelsWithHealth = channels.map(c => ({
  ...c,
  recent_checks: healthSummary[c.id]?.recent_checks || [],
  uptime_pct: healthSummary[c.id]?.uptime_pct ?? 100,
  avg_latency_ms: healthSummary[c.id]?.avg_latency_ms ?? 0,
}));
return NextResponse.json({ channels: channelsWithHealth });
```

- [ ] **Step 3: Update `src/app/dashboard/channels/page.tsx`**

3a. Update the Channel interface to include new fields:

```typescript
interface Channel {
  id: string; name: string; base_url: string; api_key: string;
  priority: number; notes: string; is_active: number;
  health_status: string; last_health_check: string | null;
  cooldown_until?: string | null;
  recent_checks?: Array<{ checked_at: string; ok: number; kind: string | null; latency_ms: number; error?: string | null }>;
  uptime_pct?: number;
  avg_latency_ms?: number;
}
```

3b. Replace the `healthBadge` function (lines 25-31) with imports:

Remove the entire `const healthBadge = (s: string) => {...}` function block. Add import:

```typescript
import { HealthBadge, HealthBar } from '@/lib/health-badge';
```

3c. Replace the two status badges (lines 283-284) with the single merged badge:

Change from:
```tsx
{healthBadge(ch.health_status)}
<span className={`text-[10px] px-2 py-0.5 rounded-full ${ch.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>{ch.is_active ? '活跃' : '停用'}</span>
```

To:
```tsx
<HealthBadge health_status={ch.health_status} is_active={ch.is_active} cooldown_until={ch.cooldown_until} />
```

3d. Insert the health bar between the info row and the action buttons:

After the info row (line 291, `</div>`) and before the actions div (line 293, `<div className="flex items-center gap-0.5 shrink-0">`), add:

```tsx
{ch.recent_checks && ch.recent_checks.length > 0 && (
  <div className="mt-2 md:mt-0 md:mx-3 md:flex-1 hidden md:block">
    <HealthBar recent_checks={ch.recent_checks} uptime_pct={ch.uptime_pct ?? 100} avg_latency_ms={ch.avg_latency_ms ?? 0} />
  </div>
)}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add src/lib/health-badge.tsx src/app/dashboard/channels/page.tsx src/app/admin/channels/route.ts
git commit -m "feat: merged health badge + uptime status bar on channel cards"
```
