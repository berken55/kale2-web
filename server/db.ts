import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_BONUS_TYPES } from '../shared/constants.ts';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bonus_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT '',
  max_value   REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  vnum             INTEGER NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL,
  subtype          TEXT NOT NULL,
  rarity           TEXT NOT NULL DEFAULT 'COMMON',
  level_required   INTEGER NOT NULL DEFAULT 0,
  classes          TEXT NOT NULL DEFAULT '[]',
  gender           TEXT NOT NULL DEFAULT 'ANY',
  buy_price        INTEGER NOT NULL DEFAULT 0,
  sell_price       INTEGER NOT NULL DEFAULT 0,
  stack_size       INTEGER NOT NULL DEFAULT 1,
  tradable         INTEGER NOT NULL DEFAULT 1,
  description      TEXT NOT NULL DEFAULT '',
  min_attack       INTEGER NOT NULL DEFAULT 0,
  max_attack       INTEGER NOT NULL DEFAULT 0,
  min_magic_attack INTEGER NOT NULL DEFAULT 0,
  max_magic_attack INTEGER NOT NULL DEFAULT 0,
  defense          INTEGER NOT NULL DEFAULT 0,
  attack_speed     INTEGER NOT NULL DEFAULT 0,
  icon_path        TEXT,
  model_path       TEXT,
  model_file_name  TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_type ON items(type, subtype);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

CREATE TABLE IF NOT EXISTS item_bonuses (
  item_id       INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  bonus_type_id INTEGER NOT NULL REFERENCES bonus_types(id) ON DELETE RESTRICT,
  value         REAL NOT NULL,
  sort          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, bonus_type_id)
);

CREATE TABLE IF NOT EXISTS item_upgrades (
  item_id            INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  level              INTEGER NOT NULL,
  attack_bonus       INTEGER NOT NULL DEFAULT 0,
  magic_attack_bonus INTEGER NOT NULL DEFAULT 0,
  defense_bonus      INTEGER NOT NULL DEFAULT 0,
  success_rate       INTEGER NOT NULL DEFAULT 100,
  cost               INTEGER NOT NULL DEFAULT 0,
  materials          TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (item_id, level)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  summary    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  seedBonusTypes(db);
  return db;
}

/** Eski veritabanlarına sonradan eklenen sütunları ekler. */
function migrate(db: DB) {
  const columns = new Set((db.prepare('PRAGMA table_info(items)').all() as Array<{ name: string }>).map((c) => c.name));
  if (!columns.has('source_url')) db.exec('ALTER TABLE items ADD COLUMN source_url TEXT');
}

function seedBonusTypes(db: DB) {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM bonus_types').get() as { count: number };
  if (count > 0) return;
  const insert = db.prepare('INSERT INTO bonus_types (code, name, unit, max_value) VALUES (?, ?, ?, ?)');
  db.transaction(() => {
    for (const b of DEFAULT_BONUS_TYPES) insert.run(b.code, b.name, b.unit, b.maxValue);
  })();
}

export function logActivity(
  db: DB,
  action: string,
  entity: string,
  entityId: number | null,
  summary: string,
) {
  db.prepare('INSERT INTO activity_log (action, entity, entity_id, summary) VALUES (?, ?, ?, ?)').run(
    action,
    entity,
    entityId,
    summary,
  );
}
