# Task 1: DB Schema — Beijing Time Defaults & Migration

## What Was Implemented

1. **Updated all `DEFAULT (datetime('now'))` to `DEFAULT (datetime('now', '+8 hours'))`** in the `initSchema()` function for the following columns:
   - `relay_keys.created_at`
   - `relay_keys.updated_at`
   - `channels.created_at`
   - `channel_models.created_at`
   - `model_aliases.created_at`
   - `model_aliases_migrated.created_at` (in the existing unique-constraint migration)
   - `call_logs.created_at`

2. **Added `_migrations` table** to the schema for idempotent migration tracking, with `applied_at` defaulting to Beijing time.

3. **Added Beijing-time data migration** at the end of `initSchema()` that:
   - Checks if the migration has already been applied via `_migrations` table.
   - If not, adds 8 hours to all existing `created_at`/`updated_at` values across all affected tables.
   - Inserts a record into `_migrations` to mark completion.

## Testing

- `npx tsc --noEmit` passes with zero errors.

## Files Changed

- `D:\project\mortal-api\src\lib\db.ts` — all modifications.

## Self-Review Findings

- The `model_aliases_migrated` CREATE TABLE inside the existing unique-constraint migration block was also updated to use Beijing time, ensuring consistency if that migration runs after this change.
- The `_migrations` table is created with `CREATE TABLE IF NOT EXISTS`, so it won't fail on re-run.
- The data migration checks if the `v2_timezone_beijing` migration already exists before executing, making it idempotent.
- The commit also included five `docs/superpowers/plans/` brief files that were in the working tree (pre-existing); they were committed as part of `git add -A`.

## Concerns

None.

## Fix: Explicit Beijing Timezone in INSERT/UPDATE Statements

### Problem

`CREATE TABLE IF NOT EXISTS` does not update existing tables' column DEFAULT values. So even though the schema now declares `DEFAULT (datetime('now', '+8 hours'))`, existing databases keep the old UTC default (`datetime('now')`). Every INSERT that omits `created_at` still gets UTC timestamps.

### Solution

Explicitly set `created_at` to `datetime('now', '+8 hours')` in every INSERT statement, and fix `datetime('now')` to `datetime('now', '+8 hours')` in all UPDATE statements.

### Files Changed

- `D:\project\mortal-api\src\lib\logs.ts` — `createCallLog()`: added `created_at` column with `datetime('now', '+8 hours')` in VALUES.
- `D:\project\mortal-api\src\lib\keys.ts` — `createRelayKey()`: added `created_at` column with `datetime('now', '+8 hours')` in VALUES.
- `D:\project\mortal-api\src\lib\keys.ts` — `updateRelayKey()`: changed `datetime('now')` to `datetime('now', '+8 hours')`.
- `D:\project\mortal-api\src\lib\channels.ts` — `createChannel()`: added `created_at` column with `datetime('now', '+8 hours')` in VALUES.
- `D:\project\mortal-api\src\lib\channels.ts` — `createChannelModel()`: added `created_at` column with `datetime('now', '+8 hours')` in VALUES.
- `D:\project\mortal-api\src\lib\channels.ts` — `createModelAlias()`: added `created_at` column with `datetime('now', '+8 hours')` in VALUES.
- `D:\project\mortal-api\src\lib\channels.ts` — `updateChannelHealth()`: changed `datetime('now')` to `datetime('now', '+8 hours')`.

### Test Results

- `npx tsc --noEmit` passes with zero errors.

## Additional Fix (cef554c)
- Fixed `addUsedTokens()` in keys.ts: `updated_at = datetime('now', '+8 hours')`
- Fixed `getModelsForAuto()` in channels.ts: `datetime(c.last_health_check, '+8 hours') < datetime('now', '+8 hours')`
