# Key Pin / Dashboard Alignment / Refresh Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three independent issues — invisible refresh button, dashboard filter alignment, and pin-to-top toggle for keys.

**Architecture:** Three small, independent changes: (1) download missing Lucide icon, (2) CSS-only layout fix for the dashboard toolbar, (3) add `is_pinned` DB column with backend/frontend wiring for key ordering.

**Tech Stack:** Next.js 16 App Router, SQLite (better-sqlite3), Tailwind CSS v4, Lucide Icons, Recharts.

## Global Constraints

- All icons from Lucide Icons, downloaded locally to `public/icons/`, never from CDN
- Follow existing patterns in `src/lib/keys.ts` and `src/app/admin/keys/route.ts`
- CSS uses Tailwind v4 utility classes (no custom CSS files)
- Tests via manual verification (existing patterns) — no test framework is set up
- `Switch` component already exists at `@/lib/switch`

---

### Task 1: Download and register `refresh-cw` icon

**Files:**
- Modify: `scripts/download-lucide-icons.js`
- Create: `public/icons/refresh-cw.svg` (auto-generated)

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: `public/icons/refresh-cw.svg` available for `<InlineIcon name="refreshCw" />`

- [ ] **Step 1: Add `'refresh-cw'` to the icon download list**

In `scripts/download-lucide-icons.js`, insert `'refresh-cw'` into the `neededIcons` array. Place it alphabetically near other `r` entries:

```js
const neededIcons = [
  // ... existing icons ...
  'chart-line', 'chart-pie', 'chart-area', 'gauge',
  'activity', 'circle', 'circle-check', 'circle-x', 'circle-alert',
  'triangle-alert', 'info', 'toggle-left', 'toggle-right',
  'external-link', 'menu', 'home', 'hard-drive', 'cpu', 'globe',
  'settings', 'ellipsis-vertical', 'ban', 'funnel-x',
];
```

Add `'refresh-cw'` after `'list'`:

```js
  'list', 'log-out', 'check', 'x',
  'trash-2', 'plus', 'pencil', 'copy', 'refresh-cw',
```

- [ ] **Step 2: Run the download script**

```bash
cd D:/project/mortal-api && node scripts/download-lucide-icons.js
```

Expected output: The script runs and shows `.../40` or similar success count. Verify `public/icons/refresh-cw.svg` exists.

- [ ] **Step 3: Verify the icon renders on the keys page**

Run the dev server and open the Keys page. Confirm the refresh button (between copy and edit) shows a refresh icon instead of blank space.

```bash
cd D:/project/mortal-api && npm run dev
```

- [ ] **Step 4: Commit**

```bash
cd D:/project/mortal-api && git add scripts/download-lucide-icons.js public/icons/refresh-cw.svg && git commit -m "fix: download refresh-cw icon to fix invisible refresh button

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Dashboard key filter alignment

**Files:**
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: Dashboard toolbar with visually matched filter + date button groups

- [ ] **Step 1: Wrap SelectFilter in a matching container**

Current code (around line 143-152 of `src/app/dashboard/page.tsx`):

```tsx
          <SelectFilter
            options={[
              { label: '全部 Key', value: '' },
              ...keys.map(k => ({ label: k.name, value: k.id })),
            ]}
            value={selectedKeyId}
            onChange={setSelectedKeyId}
            placeholder="全部 Key"
            className="max-w-[160px]"
          />
```

Replace with:

```tsx
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
            <SelectFilter
              options={[
                { label: '全部 Key', value: '' },
                ...keys.map(k => ({ label: k.name, value: k.id })),
              ]}
              value={selectedKeyId}
              onChange={setSelectedKeyId}
              placeholder="全部 Key"
            />
          </div>
```

Changes made:
- Wrapped `<SelectFilter>` in `<div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">` — same container style as the date button group
- Removed `className="max-w-[160px]"` from SelectFilter

- [ ] **Step 2: Add right padding to the inner toolbar container**

Find the `flex flex-wrap items-center gap-2` div (the one that contains both the date group and the filter, around line 119):

Current:
```tsx
<div className="flex flex-wrap items-center gap-2">
```

Change to:
```tsx
<div className="flex flex-wrap items-center gap-2 pr-1">
```

- [ ] **Step 3: Verify the layout**

Check the dashboard page at various widths:
- At `lg:` breakpoint (≥1024px): the SelectFilter outer container visually matches the date button group (same border, rounded, padding, height)
- The filter isn't flush with the right edge of the page
- At smaller widths, both wrap correctly (no horizontal overflow)

- [ ] **Step 4: Commit**

```bash
cd D:/project/mortal-api && git add src/app/dashboard/page.tsx && git commit -m "fix: align dashboard key filter with date button group

Wrap SelectFilter in matching container and add right padding.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add pin-to-top toggle for keys

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/keys.ts`
- Modify: `src/app/admin/keys/route.ts`
- Modify: `src/app/dashboard/keys/page.tsx`

**Interfaces:**
- DB: adds `is_pinned INTEGER NOT NULL DEFAULT 0` to `relay_keys`
- Backend: `createRelayKey(name, balance, expiresAt, allowedModels, allowedChannels, isPinned?)` — optional 6th param
- Backend: `updateRelayKey` supports `data.is_pinned?: number`
- Backend: `listRelayKeys` sorts `ORDER BY is_pinned DESC, created_at DESC`
- Frontend: create/edit modals get `<Switch>` toggle next to name input

- [ ] **Step 1: Add database migration in `src/lib/db.ts`**

After the last migration block (around line 156, `v2_fix_last_health_check`), add:

```typescript
  // Migration: add is_pinned column to relay_keys
  const keyCols = db.prepare("PRAGMA table_info('relay_keys')").all() as { name: string }[];
  const hasIsPinned = keyCols.find(c => c.name === 'is_pinned');
  if (!hasIsPinned) {
    const pinnedMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v3_add_is_pinned'").get();
    if (!pinnedMigrated) {
      db.exec("ALTER TABLE relay_keys ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");
      db.prepare("INSERT INTO _migrations (name) VALUES ('v3_add_is_pinned')").run();
    }
  }
```

Wait — since the migration pattern in this codebase uses `_migrations` for tracking, I should use the existing pattern. But I need to also check if the column already exists with `PRAGMA table_info`, and only migrate if it doesn't. Let me follow the same pattern as the existing migrations (check `_migrations` table + `PRAGMA table_info`):

```typescript
  // Migration: add is_pinned column to relay_keys
  const relayKeyCols = db.prepare("PRAGMA table_info('relay_keys')").all() as { name: string }[];
  if (!relayKeyCols.find(c => c.name === 'is_pinned')) {
    db.exec("ALTER TABLE relay_keys ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");
    db.prepare("INSERT INTO _migrations (name) VALUES ('v3_add_is_pinned')").run();
  }
```

- [ ] **Step 2: Update `RelayKey` type in `src/lib/types.ts`**

Add `is_pinned` after `is_active`:

```typescript
  is_active: number;
  is_pinned: number;
```

- [ ] **Step 3: Update backend functions in `src/lib/keys.ts`**

**3a. Update `createRelayKey` signature and INSERT:**

Old:
```typescript
export function createRelayKey(name: string, balance: number, expiresAt?: string | null, allowedModels?: string, allowedChannels?: string): RelayKey {
  const db = getDb();
  const id = nanoid(16);
  const key = generateRelayKey();
  db.prepare(`
    INSERT INTO relay_keys (id, key, name, balance, expires_at, allowed_models, allowed_channels, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', '+8 hours'))
  `).run(id, key, name, balance, expiresAt || null, allowedModels || '', allowedChannels || '');
  return getRelayKeyById(id)!;
}
```

New:
```typescript
export function createRelayKey(name: string, balance: number, expiresAt?: string | null, allowedModels?: string, allowedChannels?: string, isPinned?: number): RelayKey {
  const db = getDb();
  const id = nanoid(16);
  const key = generateRelayKey();
  db.prepare(`
    INSERT INTO relay_keys (id, key, name, balance, expires_at, allowed_models, allowed_channels, is_active, is_pinned, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now', '+8 hours'))
  `).run(id, key, name, balance, expiresAt || null, allowedModels || '', allowedChannels || '', isPinned ?? 0);
  return getRelayKeyById(id)!;
}
```

**3b. Update `updateRelayKey` to handle `is_pinned`:**

Old type:
```typescript
  data: { name?: string; balance?: number; is_active?: number; expires_at?: string | null; allowed_models?: string; allowed_channels?: string }
```

New:
```typescript
  data: { name?: string; balance?: number; is_active?: number; is_pinned?: number; expires_at?: string | null; allowed_models?: string; allowed_channels?: string }
```

Add the `is_pinned` condition in the function body:
```typescript
  if (data.is_pinned !== undefined) { sets.push('is_pinned = ?'); params.push(data.is_pinned); }
```

**3c. Update `listRelayKeys` sort order:**

Old:
```typescript
  return db.prepare('SELECT * FROM relay_keys ORDER BY created_at DESC').all() as RelayKey[];
```

New:
```typescript
  return db.prepare('SELECT * FROM relay_keys ORDER BY is_pinned DESC, created_at DESC').all() as RelayKey[];
```

- [ ] **Step 4: Update API route in `src/app/admin/keys/route.ts`**

**4a. POST handler:** Pass `is_pinned` to `createRelayKey`:

Old:
```typescript
    const key = createRelayKey(body.name || 'New Key', body.balance || 0, body.expires_at || null, body.allowed_models || '', body.allowed_channels || '');
```

New:
```typescript
    const key = createRelayKey(body.name || 'New Key', body.balance || 0, body.expires_at || null, body.allowed_models || '', body.allowed_channels || '', body.is_pinned ? 1 : 0);
```

**4b. PATCH handler:** Add `is_pinned` to the update body:

In the `updateRelayKey` call, the body already spreads known fields. Add `is_pinned: body.is_pinned`:

Old:
```typescript
    const updated = updateRelayKey(body.id, {
      name: body.name,
      balance: body.balance,
      is_active: body.is_active,
      expires_at: body.expires_at,
      allowed_models: body.allowed_models,
      allowed_channels: body.allowed_channels,
    });
```

New:
```typescript
    const updated = updateRelayKey(body.id, {
      name: body.name,
      balance: body.balance,
      is_active: body.is_active,
      is_pinned: body.is_pinned,
      expires_at: body.expires_at,
      allowed_models: body.allowed_models,
      allowed_channels: body.allowed_channels,
    });
```

- [ ] **Step 5: Update keys page frontend in `src/app/dashboard/keys/page.tsx`**

**5a. Update local `RelayKey` interface (line 12-16):**

Add `is_pinned`:
```typescript
interface RelayKey {
  id: string; key: string; name: string; balance: number;
  used_tokens: number; is_active: number; is_pinned: number;
  expires_at: string | null; allowed_models: string; allowed_channels: string; created_at: string;
}
```

**5b. Add `newIsPinned` state (after line 40, `newExpiryDays`):**

```typescript
const [newIsPinned, setNewIsPinned] = useState(false);
```

**5c. Update create modal — name row + pin toggle:**

Replace the existing name label + input section (lines 247-251):

```tsx
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">名称</label>
            <div className="flex items-center gap-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" placeholder="My Key" />
              <label className="flex items-center gap-2 text-xs text-gray-600 shrink-0 cursor-pointer">
                <span>置顶</span>
                <Switch
                  checked={newIsPinned}
                  onChange={setNewIsPinned}
                  size="sm"
                />
              </label>
            </div>
          </div>
```

**5d. Update `handleCreate` to send `is_pinned`:**

Old body (around line 146-151):
```typescript
      body: JSON.stringify({
        name: newName || 'New Key', balance: newBalance,
        expires_at: calcExpiresAt(newExpiryDays),
        allowed_models: newAllowedModels.join(','),
        allowed_channels: newAllowedChannels.join(','),
      }),
```

New:
```typescript
      body: JSON.stringify({
        name: newName || 'New Key', balance: newBalance,
        expires_at: calcExpiresAt(newExpiryDays),
        allowed_models: newAllowedModels.join(','),
        allowed_channels: newAllowedChannels.join(','),
        is_pinned: newIsPinned ? 1 : 0,
      }),
```

**5e. Add reset for `newIsPinned` in `handleCreate` success handler:**

Old (around line 155-157):
```typescript
      setNewName(''); setNewBalance(0); setNewExpiryDays('');
      setNewAllowedChannels([]); setNewAllowedModels([]);
```

New:
```typescript
      setNewName(''); setNewBalance(0); setNewExpiryDays(''); setNewIsPinned(false);
      setNewAllowedChannels([]); setNewAllowedModels([]);
```

**5f. Update edit modal — name row + pin toggle:**

Replace the existing name label + input section (around lines 334-337):

Old:
```tsx
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">名称</label>
              <input value={showEdit.name} onChange={(e) => setShowEdit({...showEdit, name: e.target.value})}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            </div>
```

New:
```tsx
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">名称</label>
              <div className="flex items-center gap-3">
                <input value={showEdit.name} onChange={(e) => setShowEdit({...showEdit, name: e.target.value})}
                  className="flex-1 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                <label className="flex items-center gap-2 text-xs text-gray-600 shrink-0 cursor-pointer">
                  <span>置顶</span>
                  <Switch
                    checked={!!showEdit.is_pinned}
                    onChange={(checked) => setShowEdit({...showEdit, is_pinned: checked ? 1 : 0})}
                    size="sm"
                  />
                </label>
              </div>
            </div>
```

- [ ] **Step 6: Verify the pin-to-top feature**

1. Start the dev server: `npm run dev`
2. Open the Keys management page
3. Create a new Key with "置顶" enabled → verify it appears at the top of the list
4. Create another Key without "置顶" → verify it appears below pinned keys
5. Edit an existing Key, toggle "置顶" on → verify it moves to the top
6. Toggle "置顶" off → verify it returns to time-based position
7. Check that existing keys without `is_pinned` default to 0 (not pinned) and maintain their existing order

- [ ] **Step 7: Commit**

```bash
cd D:/project/mortal-api && git add src/lib/db.ts src/lib/types.ts src/lib/keys.ts src/app/admin/keys/route.ts src/app/dashboard/keys/page.tsx && git commit -m "feat: add pin-to-top toggle for API keys

Add is_pinned column, backend support, and UI toggle in create/edit modals.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Summary of all file changes

| File | Task | Change |
|------|------|--------|
| `scripts/download-lucide-icons.js` | 1 | Add `'refresh-cw'` to `neededIcons` |
| `public/icons/refresh-cw.svg` | 1 | Auto-generated by script |
| `src/app/dashboard/page.tsx` | 2 | Wrap SelectFilter in matching div, add `pr-1` |
| `src/lib/db.ts` | 3 | Add `v3_add_is_pinned` migration |
| `src/lib/types.ts` | 3 | Add `is_pinned` field to `RelayKey` |
| `src/lib/keys.ts` | 3 | Update `createRelayKey`, `updateRelayKey`, `listRelayKeys` |
| `src/app/admin/keys/route.ts` | 3 | Pass `is_pinned` in POST/PATCH |
| `src/app/dashboard/keys/page.tsx` | 3 | Add toggle in create/edit modals, update state |
