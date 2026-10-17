import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_BONUS_TYPES } from '../shared/constants.ts';
import { convertLegacyMonster } from './monster-convert.ts';
import { insertMonster, uniqueMonsterCode } from './monsters.ts';

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

CREATE TABLE IF NOT EXISTS monsters (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  vnum            INTEGER NOT NULL UNIQUE,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  rank            TEXT NOT NULL DEFAULT 'NORMAL',
  level           INTEGER NOT NULL DEFAULT 1,
  race            TEXT NOT NULL DEFAULT '',
  element         TEXT NOT NULL DEFAULT '',
  hp              INTEGER NOT NULL DEFAULT 1,
  hp_regen_pct    INTEGER NOT NULL DEFAULT 0,
  hp_regen_sec    INTEGER NOT NULL DEFAULT 0,
  exp             INTEGER NOT NULL DEFAULT 0,
  damage_min      INTEGER NOT NULL DEFAULT 0,
  damage_max      INTEGER NOT NULL DEFAULT 0,
  defense         INTEGER NOT NULL DEFAULT 0,
  stat_str        INTEGER NOT NULL DEFAULT 0,
  stat_dex        INTEGER NOT NULL DEFAULT 0,
  stat_vit        INTEGER NOT NULL DEFAULT 0,
  stat_int        INTEGER NOT NULL DEFAULT 0,
  attack_speed    INTEGER NOT NULL DEFAULT 100,
  move_speed      INTEGER NOT NULL DEFAULT 100,
  attack_range    REAL NOT NULL DEFAULT 1.5,
  aggressive      INTEGER NOT NULL DEFAULT 0,
  aggro_range     REAL NOT NULL DEFAULT 8,
  yang_min        INTEGER NOT NULL DEFAULT 0,
  yang_max        INTEGER NOT NULL DEFAULT 0,
  resists         TEXT NOT NULL DEFAULT '{}',
  abilities       TEXT NOT NULL DEFAULT '{}',
  flags           TEXT NOT NULL DEFAULT '[]',
  model_path      TEXT,
  model_file_name TEXT,
  model_scale     REAL NOT NULL DEFAULT 1,
  icon_path       TEXT,
  description     TEXT NOT NULL DEFAULT '',
  source_url      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_monsters_level ON monsters(rank, level);
CREATE INDEX IF NOT EXISTS idx_monsters_name ON monsters(name);

-- Drop oranları Metin2 geleneğine uygun olarak 1/1.000.000 (ppm) tamsayı tutulur; panel yüzde gösterir.
-- Yeniden kullanılabilir drop listesi ("Kurt derisi grubu", "Boss sandığı")
CREATE TABLE IF NOT EXISTS drop_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  roll_mode   TEXT NOT NULL DEFAULT 'EACH',  -- EACH: her satır ayrı zar | ONE_OF: ağırlıklı tek seçim
  rolls       INTEGER NOT NULL DEFAULT 1,     -- ONE_OF için kaç kez seçilir
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS drop_group_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id    INTEGER NOT NULL REFERENCES drop_groups(id) ON DELETE CASCADE,
  item_vnum   INTEGER NOT NULL REFERENCES items(vnum) ON UPDATE CASCADE,
  chance_ppm  INTEGER NOT NULL,               -- EACH: olasılık | ONE_OF: ağırlık
  count_min   INTEGER NOT NULL DEFAULT 1,
  count_max   INTEGER NOT NULL DEFAULT 1,
  upgrade_min INTEGER NOT NULL DEFAULT 0,
  upgrade_max INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  CHECK (chance_ppm BETWEEN 0 AND 1000000), CHECK (count_min <= count_max), CHECK (upgrade_min <= upgrade_max)
);

-- Yaratık → drop (doğrudan item veya grup)
CREATE TABLE IF NOT EXISTS monster_drops (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  monster_id  INTEGER NOT NULL REFERENCES monsters(id) ON DELETE CASCADE,
  item_vnum   INTEGER REFERENCES items(vnum) ON UPDATE CASCADE,
  group_id    INTEGER REFERENCES drop_groups(id),
  chance_ppm  INTEGER NOT NULL,
  count_min   INTEGER NOT NULL DEFAULT 1,
  count_max   INTEGER NOT NULL DEFAULT 1,
  upgrade_min INTEGER NOT NULL DEFAULT 0,
  upgrade_max INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  CHECK ((item_vnum IS NULL) <> (group_id IS NULL)),
  CHECK (chance_ppm BETWEEN 0 AND 1000000), CHECK (count_min <= count_max), CHECK (upgrade_min <= upgrade_max)
);

CREATE INDEX IF NOT EXISTS idx_monster_drops_monster ON monster_drops(monster_id);

-- Seviye aralığına göre her yaratıkta geçerli genel drop (Metin2 common_drop_item)
CREATE TABLE IF NOT EXISTS level_drops (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  level_min   INTEGER NOT NULL,
  level_max   INTEGER NOT NULL,
  ranks       TEXT NOT NULL DEFAULT '["NORMAL","ELITE"]',
  item_vnum   INTEGER REFERENCES items(vnum) ON UPDATE CASCADE,
  group_id    INTEGER REFERENCES drop_groups(id),
  chance_ppm  INTEGER NOT NULL,
  count_min   INTEGER NOT NULL DEFAULT 1,
  count_max   INTEGER NOT NULL DEFAULT 1,
  upgrade_min INTEGER NOT NULL DEFAULT 0,
  upgrade_max INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  CHECK ((item_vnum IS NULL) <> (group_id IS NULL)),
  CHECK (level_min <= level_max),
  CHECK (chance_ppm BETWEEN 0 AND 1000000), CHECK (count_min <= count_max), CHECK (upgrade_min <= upgrade_max)
);

-- Haritalar: minimap resmi ve kapsadığı dünya dikdörtgeni (x sağa, z aşağı; resim kuzey yukarı)
CREATE TABLE IF NOT EXISTS maps (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,      -- oyundaki harita adı: village1
  name         TEXT NOT NULL,
  minimap_path TEXT,
  world_min_x  REAL NOT NULL,
  world_min_z  REAL NOT NULL,
  world_max_x  REAL NOT NULL,
  world_max_z  REAL NOT NULL,
  CHECK (world_min_x < world_max_x AND world_min_z < world_max_z)
);

-- Haritada bir alan: daire ya da çokgen ("Kurt ormanı", "Metin vadisi")
CREATE TABLE IF NOT EXISTS spawn_regions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id    INTEGER NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  code      TEXT NOT NULL,
  name      TEXT NOT NULL,
  shape     TEXT NOT NULL DEFAULT 'CIRCLE',   -- CIRCLE | POLYGON
  x REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0, radius REAL NOT NULL DEFAULT 10,
  points    TEXT NOT NULL DEFAULT '[]',       -- POLYGON: [[x,z],...]
  level_min INTEGER NOT NULL DEFAULT 1,
  level_max INTEGER NOT NULL DEFAULT 99,
  sort      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (map_id, code)
);

-- Bölgede ne doğar
CREATE TABLE IF NOT EXISTS spawn_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id     INTEGER NOT NULL REFERENCES spawn_regions(id) ON DELETE CASCADE,
  monster_id    INTEGER NOT NULL REFERENCES monsters(id),
  kind          TEXT NOT NULL DEFAULT 'PACK',   -- PACK: sürekli sürüler | STONE: Metin taşı | BOSS | EVENT
  max_alive     INTEGER NOT NULL DEFAULT 1,     -- bölgede aynı anda en fazla kaç grup
  pack_min      INTEGER NOT NULL DEFAULT 1,
  pack_max      INTEGER NOT NULL DEFAULT 1,
  respawn_min_s INTEGER NOT NULL DEFAULT 60,
  respawn_max_s INTEGER NOT NULL DEFAULT 90,
  announce      INTEGER NOT NULL DEFAULT 0,
  schedule      TEXT NOT NULL DEFAULT '',       -- EVENT için: "daily 20:00", "every 2h", "night"
  leader_id     INTEGER REFERENCES monsters(id),
  sort          INTEGER NOT NULL DEFAULT 0,
  CHECK (pack_min <= pack_max), CHECK (respawn_min_s <= respawn_max_s), CHECK (max_alive >= 1)
);

-- Oyun ayarları (anahtar → JSON değer); bundle'ın config kısmına gider
CREATE TABLE IF NOT EXISTS game_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Oyuna giden veri: "Yayınla" anındaki numaralı, değişmez anlık görüntü (bundle)
CREATE TABLE IF NOT EXISTS data_releases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  version     INTEGER NOT NULL UNIQUE,
  sha256      TEXT NOT NULL,
  bundle      TEXT NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  is_active   INTEGER NOT NULL DEFAULT 0
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
  if (!columns.has('monster_stats')) db.exec("ALTER TABLE items ADD COLUMN monster_stats TEXT NOT NULL DEFAULT '{}'");
  if (!columns.has('source_url')) db.exec('ALTER TABLE items ADD COLUMN source_url TEXT');
  // Oyunun item kodu (RUSTY_SWORD): oyun vnum'a geçene kadar droplar bu kodla eşlenir
  if (!columns.has('code')) db.exec('ALTER TABLE items ADD COLUMN code TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_items_code ON items(code) WHERE code IS NOT NULL');
  moveMonstersOutOfItems(db);
}

/**
 * Canavarlar eskiden items tablosunda type = 'MONSTER' olarak tutuluyordu (statlar monster_stats
 * JSON'unda). Bu satırları monsters tablosuna taşır; ikon ve model dosyaları yerinde kalır.
 */
function moveMonstersOutOfItems(db: DB) {
  const rows = db.prepare("SELECT * FROM items WHERE type = 'MONSTER' ORDER BY vnum").all() as Array<Record<string, unknown>>;
  if (!rows.length) return;
  db.transaction(() => {
    let moved = 0;
    for (const r of rows) {
      const vnum = r.vnum as number;
      if (db.prepare('SELECT 1 FROM monsters WHERE vnum = ?').get(vnum)) {
        throw new Error(`Canavar taşıma: ${vnum} vnum'u hem items hem monsters tablosunda var.`);
      }
      const input = convertLegacyMonster({
        vnum,
        name: r.name as string,
        subtype: r.subtype as string,
        level: r.level_required as number,
        damageMin: r.min_attack as number,
        damageMax: r.max_attack as number,
        defense: r.defense as number,
        stats: JSON.parse((r.monster_stats as string) || '{}'),
        description: r.description as string,
        sourceUrl: r.source_url as string | null,
      });
      input.code = uniqueMonsterCode(db, input.code, vnum);
      insertMonster(db, input, {
        icon_path: r.icon_path as string | null,
        model_path: r.model_path as string | null,
        model_file_name: r.model_file_name as string | null,
        created_at: r.created_at as string,
      });
      moved++;
    }
    db.prepare("DELETE FROM items WHERE type = 'MONSTER'").run();
    logActivity(db, 'import', 'system', null, `${moved} canavar items tablosundan monsters tablosuna taşındı`);
  })();
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
