// ============================================================
// Database module - SQLite via better-sqlite3
// New schema: channels have no model/rate/provider, models are separate
// ============================================================
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || 'data/relay.db';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS relay_keys (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      used_tokens INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      allowed_models TEXT NOT NULL DEFAULT '',
      allowed_channels TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      health_status TEXT NOT NULL DEFAULT 'unknown',
      last_health_check TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    );

    CREATE TABLE IF NOT EXISTS channel_models (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_channel_models_channel ON channel_models(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_models_model ON channel_models(model_id);

    CREATE TABLE IF NOT EXISTS model_aliases (
      id TEXT PRIMARY KEY,
      alias_name TEXT NOT NULL,
      channel_model_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
      FOREIGN KEY (channel_model_id) REFERENCES channel_models(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_model_aliases_alias ON model_aliases(alias_name);

    CREATE TABLE IF NOT EXISTS call_logs (
      id TEXT PRIMARY KEY,
      relay_key_id TEXT,
      relay_key_name TEXT,
      model TEXT NOT NULL,
      channel_id TEXT,
      channel_name TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_call_logs_relay_key_id ON call_logs(relay_key_id);
    CREATE INDEX IF NOT EXISTS idx_call_logs_model ON call_logs(model);
    CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(status);
  `);

  // _migrations table for idempotent migration tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    );
  `);

  // Migration: add cost column to call_logs if missing
  const cols = db.prepare("PRAGMA table_info('call_logs')").all() as { name: string }[];
  if (!cols.find(c => c.name === 'cost')) {
    db.exec("ALTER TABLE call_logs ADD COLUMN cost REAL");
  }

  // Migration: remove UNIQUE constraint from model_aliases.alias_name
  const aliasIndexes = db.prepare("PRAGMA index_list('model_aliases')").all() as any[];
  const hasUniqueOnAlias = aliasIndexes.some((idx: any) => idx.unique === 1 && idx.origin === 'u');
  if (hasUniqueOnAlias) {
    db.exec(`
      CREATE TABLE model_aliases_migrated (
        id TEXT PRIMARY KEY,
        alias_name TEXT NOT NULL,
        channel_model_id TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
        FOREIGN KEY (channel_model_id) REFERENCES channel_models(id) ON DELETE CASCADE
      );
      INSERT INTO model_aliases_migrated SELECT * FROM model_aliases;
      DROP TABLE model_aliases;
      ALTER TABLE model_aliases_migrated RENAME TO model_aliases;
      CREATE INDEX IF NOT EXISTS idx_model_aliases_alias ON model_aliases(alias_name);
    `);
  }

  // Migration: add cached_input_tokens column to call_logs
  if (!cols.find(c => c.name === 'cached_input_tokens')) {
    db.exec("ALTER TABLE call_logs ADD COLUMN cached_input_tokens INTEGER NOT NULL DEFAULT 0");
  }

  // Migration: convert existing UTC timestamps to Beijing time (UTC+8)
  const beijingMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v2_timezone_beijing'").get();
  if (!beijingMigrated) {
    db.exec(`
      UPDATE relay_keys SET created_at = datetime(created_at, '+8 hours'), updated_at = datetime(updated_at, '+8 hours');
      UPDATE channels SET created_at = datetime(created_at, '+8 hours'), last_health_check = datetime(last_health_check, '+8 hours');
      UPDATE channel_models SET created_at = datetime(created_at, '+8 hours');
      UPDATE model_aliases SET created_at = datetime(created_at, '+8 hours');
      UPDATE call_logs SET created_at = datetime(created_at, '+8 hours');
      INSERT INTO _migrations (name) VALUES ('v2_timezone_beijing');
    `);
  }

  // Migration: fix last_health_check for databases that ran v2_timezone_beijing before it included last_health_check
  const lastHealthMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v2_fix_last_health_check'").get();
  if (!lastHealthMigrated) {
    db.exec(`
      UPDATE channels SET last_health_check = datetime(last_health_check, '+8 hours') WHERE last_health_check IS NOT NULL;
      INSERT INTO _migrations (name) VALUES ('v2_fix_last_health_check');
    `);
  }

  // Migration: add is_pinned column to relay_keys
  const pinnedMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v3_add_is_pinned'").get();
  if (!pinnedMigrated) {
    const relayKeyCols = db.prepare("PRAGMA table_info('relay_keys')").all() as { name: string }[];
    if (!relayKeyCols.find(c => c.name === 'is_pinned')) {
      db.exec("ALTER TABLE relay_keys ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0");
    }
    db.prepare("INSERT INTO _migrations (name) VALUES ('v3_add_is_pinned')").run();
  }

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

  // Migration: model_pricing table + relay_keys spend_limit/total_spent
  const pricingMigrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v5_model_pricing'").get();
  if (!pricingMigrated) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS model_pricing (
        model_id TEXT PRIMARY KEY,
        prompt_price REAL NOT NULL DEFAULT 0,
        completion_price REAL NOT NULL DEFAULT 0,
        cached_prompt_price REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
      );
    `);

    const relayKeyCols = db.prepare("PRAGMA table_info('relay_keys')").all() as { name: string }[];
    if (!relayKeyCols.find(c => c.name === 'spend_limit')) {
      db.exec("ALTER TABLE relay_keys ADD COLUMN spend_limit REAL NOT NULL DEFAULT 0");
    }
    if (!relayKeyCols.find(c => c.name === 'total_spent')) {
      db.exec("ALTER TABLE relay_keys ADD COLUMN total_spent REAL NOT NULL DEFAULT 0");
    }

    // Reset old balance/used_tokens values to safe defaults (spend_limit=0 means no limit)
    db.exec("UPDATE relay_keys SET spend_limit = 0, total_spent = 0 WHERE balance > 0 OR used_tokens > 0");

    db.prepare("INSERT INTO _migrations (name) VALUES ('v5_model_pricing')").run();
  }

  // Migration v6: rewrite model_pricing.model_id from upstream model_id to public_name
  const pricingV6Migrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v6_pricing_public_name'").get();
  if (!pricingV6Migrated) {
    db.exec(`
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
    `);
  }

  // Migration v7: rewrite relay_keys.allowed_models from upstream model_id to public_name
  const allowedModelsV7Migrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v7_allowed_models_public_name'").get();
  if (!allowedModelsV7Migrated) {
    // For each comma-separated value in allowed_models:
    //   - if it's an upstream model_id with an active alias → rewrite to alias
    //   - else → leave unchanged
    // Process row-by-row using a small Node-side loop (SQLite has no array_split natively)
    const rows = db.prepare(`SELECT id, allowed_models FROM relay_keys WHERE allowed_models != ''`).all() as Array<{ id: string; allowed_models: string }>;
    const updateStmt = db.prepare(`UPDATE relay_keys SET allowed_models = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`);
    const aliasLookup = db.prepare(`
      SELECT DISTINCT cm.model_id, ma.alias_name
      FROM model_aliases ma
      JOIN channel_models cm ON cm.id = ma.channel_model_id
      WHERE ma.is_active = 1
    `).all() as Array<{ model_id: string; alias_name: string }>;
    const aliasMap = new Map(aliasLookup.map(r => [r.model_id, r.alias_name]));

    for (const row of rows) {
      const tokens = row.allowed_models.split(',').map(t => t.trim()).filter(Boolean);
      const rewritten = tokens.map(t => aliasMap.get(t) || t);
      const joined = rewritten.join(',');
      if (joined !== row.allowed_models) updateStmt.run(joined, row.id);
    }
    db.prepare(`INSERT INTO _migrations (name) VALUES ('v7_allowed_models_public_name')`).run();
  }

  // Migration v8: add latency_ms column to call_logs
  const v8Migrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v8_latency_ms'").get();
  if (!v8Migrated) {
    if (!cols.find(c => c.name === 'latency_ms')) {
      db.exec("ALTER TABLE call_logs ADD COLUMN latency_ms INTEGER NOT NULL DEFAULT 0");
    }
    db.prepare("INSERT INTO _migrations (name) VALUES ('v8_latency_ms')").run();
  }
}

export function closeDb() {
  if (db) { db.close(); db = null; }
}
