# Task 1: DB Schema — Beijing Time Defaults & Migration

From the plan:

**Files:**
- Modify: `src/lib/db.ts`

### Changes Needed

1. **Update all `DEFAULT (datetime('now'))` to `DEFAULT (datetime('now', '+8 hours'))`** in the `initSchema()` function. Affects:
   - `relay_keys.created_at` and `relay_keys.updated_at`
   - `channels.created_at`
   - `channel_models.created_at`
   - `model_aliases.created_at`
   - `call_logs.created_at`

2. **Add `_migrations` table** to schema (for idempotent migration tracking):
   ```sql
   CREATE TABLE IF NOT EXISTS _migrations (
     name TEXT PRIMARY KEY,
     applied_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
   );
   ```

3. **Add Beijing-time data migration** at end of `initSchema()`:
   ```typescript
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

### Verification
- Run `npx tsc --noEmit` and confirm no new errors
