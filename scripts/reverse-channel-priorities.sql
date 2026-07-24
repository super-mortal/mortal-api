-- USAGE:
--   cd /d/project/mortal-api
--   sqlite3 data/relay.db < scripts/reverse-channel-priorities.sql
-- Run BEFORE deploying the code change from Task 2.

-- Run this once before deploying Task 2's code.
-- Reverses priority so that previously-small-now-big ordering matches.
-- 0 (auto) is preserved.

BEGIN TRANSACTION;

UPDATE channels
SET priority = -priority
WHERE priority != 0 AND priority > 0;

COMMIT;

-- Verify
SELECT id, name, priority FROM channels ORDER BY priority DESC;
