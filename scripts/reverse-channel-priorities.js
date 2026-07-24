/**
 * Reverse every non-zero channel priority while preserving priority 0 (automatic).
 *
 * Usage:
 *   node scripts/reverse-channel-priorities.js
 *
 * This migration is intentionally involutive: running it again restores the
 * previous priorities, which makes it safe to re-run while deploying.
 */
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'relay.db');
const db = new Database(dbPath);

try {
  console.log('Before:');
  console.log(db.prepare('SELECT id, name, priority FROM channels ORDER BY priority DESC').all());

  const transaction = db.transaction(() => {
    db.prepare('UPDATE channels SET priority = -priority WHERE priority != 0').run();
  });
  transaction();

  console.log('\nAfter:');
  console.log(db.prepare('SELECT id, name, priority FROM channels ORDER BY priority DESC').all());
} finally {
  db.close();
}
