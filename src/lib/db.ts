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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS channel_models (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_channel_models_channel ON channel_models(channel_id);
    CREATE INDEX IF NOT EXISTS idx_channel_models_model ON channel_models(model_id);

    CREATE TABLE IF NOT EXISTS model_aliases (
      id TEXT PRIMARY KEY,
      alias_name TEXT NOT NULL UNIQUE,
      channel_model_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_call_logs_relay_key_id ON call_logs(relay_key_id);
    CREATE INDEX IF NOT EXISTS idx_call_logs_model ON call_logs(model);
    CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs(status);
  `);

  // Migration: add cost column to call_logs if missing
  const cols = db.prepare("PRAGMA table_info('call_logs')").all() as { name: string }[];
  if (!cols.find(c => c.name === 'cost')) {
    db.exec("ALTER TABLE call_logs ADD COLUMN cost REAL");
  }
}

export function closeDb() {
  if (db) { db.close(); db = null; }
}
