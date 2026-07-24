// Manual fixture test for v6 migration PK-safety fix.
//
// Case A: identical alias name on multi-channel (the actual PK violation case)
//   proves INSERT OR IGNORE collapses duplicates → exactly 1 row, no error.
//
// Case B: distinct alias names on multi-channel (user's specified scenario)
//   proves INSERT OR IGNORE doesn't break the common case (both rows kept, no error).
//
// Case C (regression): same input as A without OR IGNORE → PK violation thrown.
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function makeDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v6-fixture-'));
  const dbPath = path.join(tmpDir, 'fixture.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    );
    CREATE TABLE model_pricing (
      model_id TEXT PRIMARY KEY,
      prompt_price REAL NOT NULL DEFAULT 0,
      completion_price REAL NOT NULL DEFAULT 0,
      cached_prompt_price REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    );
    CREATE TABLE channel_models (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      model_id TEXT NOT NULL
    );
    CREATE TABLE model_aliases (
      id TEXT PRIMARY KEY,
      channel_model_id TEXT NOT NULL,
      alias_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);
  return { db, tmpDir };
}

function seedFixture(db, aliasA, aliasB) {
  db.prepare(`INSERT INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price) VALUES (?, ?, ?, ?)`).run('gpt-4o', 1.25, 5.00, 0.50);
  db.prepare(`INSERT INTO channel_models (id, channel_id, model_id) VALUES (?, ?, ?)`).run('cm_a', 'channel_A', 'gpt-4o');
  db.prepare(`INSERT INTO channel_models (id, channel_id, model_id) VALUES (?, ?, ?)`).run('cm_b', 'channel_B', 'gpt-4o');
  db.prepare(`INSERT INTO model_aliases (id, channel_model_id, alias_name, is_active) VALUES (?, ?, ?, ?)`).run('ma_a', 'cm_a', aliasA, 1);
  db.prepare(`INSERT INTO model_aliases (id, channel_model_id, alias_name, is_active) VALUES (?, ?, ?, ?)`).run('ma_b', 'cm_b', aliasB, 1);
}

const SQL_FIXED = `
  CREATE TABLE IF NOT EXISTS model_pricing_backup AS SELECT * FROM model_pricing;
  DROP TABLE model_pricing;
  CREATE TABLE model_pricing (
    model_id TEXT PRIMARY KEY,
    prompt_price REAL NOT NULL DEFAULT 0,
    completion_price REAL NOT NULL DEFAULT 0,
    cached_prompt_price REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
  );
  INSERT OR IGNORE INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)
  SELECT
    COALESCE(ma.alias_name, cm.model_id) AS public_name,
    p.prompt_price, p.completion_price, p.cached_prompt_price, p.updated_at
  FROM model_pricing_backup p
  JOIN channel_models cm ON cm.model_id = p.model_id
  LEFT JOIN model_aliases ma ON ma.channel_model_id = cm.id AND ma.is_active = 1;
  INSERT OR IGNORE INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)
  SELECT p.model_id, p.prompt_price, p.completion_price, p.cached_prompt_price, p.updated_at
  FROM model_pricing_backup p
  WHERE NOT EXISTS (
    SELECT 1 FROM channel_models cm WHERE cm.model_id = p.model_id
  );
  DROP TABLE model_pricing_backup;
  INSERT INTO _migrations (name) VALUES ('v6_pricing_public_name');
`;

const SQL_BUGGY = SQL_FIXED.replace(
  /INSERT OR IGNORE INTO model_pricing \(model_id, prompt_price, completion_price, cached_prompt_price, updated_at\)\s+SELECT\s+COALESCE/,
  'INSERT INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)\n    SELECT\n      COALESCE'
);

function run(label, aliasA, aliasB, sql, expectRows) {
  const { db, tmpDir } = makeDb();
  seedFixture(db, aliasA, aliasB);
  let threw = false;
  let errMsg = '';
  try { db.exec(sql); } catch (e) { threw = true; errMsg = (e && e.message) || String(e); }
  const rows = db.prepare(`SELECT model_id FROM model_pricing ORDER BY model_id`).all();
  const migRows = db.prepare(`SELECT name FROM _migrations WHERE name = 'v6_pricing_public_name'`).all();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const actualModelIds = rows.map(r => r.model_id).sort();
  const expectedModelIds = expectRows.slice().sort();
  const ok =
    !threw &&
    actualModelIds.length === expectedModelIds.length &&
    actualModelIds.every((v, i) => v === expectedModelIds[i]) &&
    migRows.length === 1;
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${label}: rows=${JSON.stringify(actualModelIds)} mig=${migRows.length === 1 ? 'yes' : 'no'} threw=${threw}${threw ? ' err=' + errMsg : ''}`);
  return ok;
}

// --- Case C: regression — buggy SQL on duplicate-alias fixture (must throw) ---
const cOk = (() => {
  const { db, tmpDir } = makeDb();
  seedFixture(db, 'codex', 'codex');
  let threw = false;
  let errMsg = '';
  try { db.exec(SQL_BUGGY); } catch (e) { threw = true; errMsg = (e && e.message) || String(e); }
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  const ok = threw && /UNIQUE constraint failed/i.test(errMsg);
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] regression (buggy SQL on duplicate aliases): threw=${threw} err="${errMsg}"`);
  return ok;
})();

// --- Case A: duplicate alias ("codex","codex") → INSERT OR IGNORE keeps first row only ---
const aOk = run('A: duplicate alias names', 'codex', 'codex', SQL_FIXED, ['codex']);

// --- Case B: distinct aliases ("codex","chatgpt") → both rows kept, no error ---
const bOk = run('B: distinct alias names', 'codex', 'chatgpt', SQL_FIXED, ['chatgpt', 'codex']);

if (!aOk || !bOk || !cOk) {
  console.error('[fixture] OVERALL FAIL');
  process.exit(1);
}
console.log('[fixture] OVERALL PASS: INSERT OR IGNORE prevents PK violation across all edge cases');
