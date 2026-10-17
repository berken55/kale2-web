import type { Monster, MonsterInput, MonsterSummary } from '../shared/types.ts';
import type { DB } from './db.ts';

export interface MonsterRow {
  id: number;
  vnum: number;
  code: string;
  name: string;
  rank: string;
  level: number;
  race: string;
  element: string;
  hp: number;
  hp_regen_pct: number;
  hp_regen_sec: number;
  exp: number;
  damage_min: number;
  damage_max: number;
  defense: number;
  stat_str: number;
  stat_dex: number;
  stat_vit: number;
  stat_int: number;
  attack_speed: number;
  move_speed: number;
  attack_range: number;
  aggressive: number;
  aggro_range: number;
  yang_min: number;
  yang_max: number;
  resists: string;
  abilities: string;
  flags: string;
  model_path: string | null;
  model_file_name: string | null;
  model_scale: number;
  icon_path: string | null;
  description: string;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

const fileUrl = (p: string | null) => (p ? `/uploads/${p}` : null);

function rowToSummary(row: MonsterRow): MonsterSummary {
  return {
    id: row.id,
    vnum: row.vnum,
    code: row.code,
    name: row.name,
    rank: row.rank as Monster['rank'],
    level: row.level,
    race: row.race as Monster['race'],
    element: row.element as Monster['element'],
    hp: row.hp,
    exp: row.exp,
    aggressive: row.aggressive === 1,
    iconUrl: fileUrl(row.icon_path),
    modelUrl: fileUrl(row.model_path),
    updatedAt: row.updated_at,
  };
}

export function rowToMonster(row: MonsterRow): Monster {
  return {
    ...rowToSummary(row),
    hpRegenPct: row.hp_regen_pct,
    hpRegenSec: row.hp_regen_sec,
    damageMin: row.damage_min,
    damageMax: row.damage_max,
    defense: row.defense,
    str: row.stat_str,
    dex: row.stat_dex,
    vit: row.stat_vit,
    int: row.stat_int,
    attackSpeed: row.attack_speed,
    moveSpeed: row.move_speed,
    attackRange: row.attack_range,
    aggroRange: row.aggro_range,
    yangMin: row.yang_min,
    yangMax: row.yang_max,
    resists: JSON.parse(row.resists),
    abilities: JSON.parse(row.abilities),
    flags: JSON.parse(row.flags),
    modelScale: row.model_scale,
    description: row.description,
    modelFileName: row.model_file_name,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
  };
}

export function getMonsterRow(db: DB, id: number) {
  return db.prepare('SELECT * FROM monsters WHERE id = ?').get(id) as MonsterRow | undefined;
}

export function getMonster(db: DB, id: number): Monster | null {
  const row = getMonsterRow(db, id);
  return row ? rowToMonster(row) : null;
}

export function getMonsterByVnum(db: DB, vnum: number): Monster | null {
  const row = db.prepare('SELECT * FROM monsters WHERE vnum = ?').get(vnum) as MonsterRow | undefined;
  return row ? rowToMonster(row) : null;
}

export interface MonsterListQuery {
  search?: string;
  rank?: string;
  race?: string;
  levelMin?: number;
  levelMax?: number;
  hasModel?: boolean;
  sort?: string;
  page: number;
  pageSize: number;
}

const SORTS: Record<string, string> = {
  vnum: 'vnum ASC',
  '-vnum': 'vnum DESC',
  name: 'name COLLATE NOCASE ASC',
  '-name': 'name COLLATE NOCASE DESC',
  level: 'level ASC, vnum ASC',
  '-level': 'level DESC, vnum ASC',
  '-hp': 'hp DESC, vnum ASC',
  '-exp': 'exp DESC, vnum ASC',
  '-updated': 'updated_at DESC, id DESC',
};

export function listMonsters(db: DB, q: MonsterListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.search) {
    where.push('(name LIKE ? OR code LIKE ? OR CAST(vnum AS TEXT) LIKE ?)');
    params.push(`%${q.search}%`, `%${q.search}%`, `${q.search}%`);
  }
  if (q.rank) {
    where.push('rank = ?');
    params.push(q.rank);
  }
  if (q.race) {
    where.push('race = ?');
    params.push(q.race);
  }
  if (q.levelMin !== undefined) {
    where.push('level >= ?');
    params.push(q.levelMin);
  }
  if (q.levelMax !== undefined) {
    where.push('level <= ?');
    params.push(q.levelMax);
  }
  if (q.hasModel !== undefined) where.push(q.hasModel ? 'model_path IS NOT NULL' : 'model_path IS NULL');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = SORTS[q.sort ?? ''] ?? SORTS.level;
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM monsters ${whereSql}`).get(...params) as { total: number };
  const rows = db
    .prepare(`SELECT * FROM monsters ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as MonsterRow[];
  return { monsters: rows.map(rowToSummary), total, page: q.page, pageSize: q.pageSize };
}

function scalarParams(input: MonsterInput) {
  return {
    vnum: input.vnum,
    code: input.code,
    name: input.name,
    rank: input.rank,
    level: input.level,
    race: input.race,
    element: input.element,
    hp: input.hp,
    hp_regen_pct: input.hpRegenPct,
    hp_regen_sec: input.hpRegenSec,
    exp: input.exp,
    damage_min: input.damageMin,
    damage_max: input.damageMax,
    defense: input.defense,
    stat_str: input.str,
    stat_dex: input.dex,
    stat_vit: input.vit,
    stat_int: input.int,
    attack_speed: input.attackSpeed,
    move_speed: input.moveSpeed,
    attack_range: input.attackRange,
    aggressive: input.aggressive ? 1 : 0,
    aggro_range: input.aggroRange,
    yang_min: input.yangMin,
    yang_max: input.yangMax,
    resists: JSON.stringify(input.resists),
    abilities: JSON.stringify(input.abilities),
    flags: JSON.stringify(input.flags),
    model_scale: input.modelScale,
    description: input.description,
    source_url: input.sourceUrl ?? null,
  };
}

const COLUMNS = Object.keys(scalarParams({ resists: {}, abilities: {}, flags: [] } as unknown as MonsterInput));

/** Dosya yolları ve oluşturulma tarihi yalnızca taşıma sırasında verilir. */
type Extra = Partial<Pick<MonsterRow, 'icon_path' | 'model_path' | 'model_file_name' | 'created_at'>>;

export function insertMonster(db: DB, input: MonsterInput, extra: Extra = {}): number {
  const values: Record<string, unknown> = { ...scalarParams(input) };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) values[k] = v;
  const cols = Object.keys(values);
  const info = db
    .prepare(`INSERT INTO monsters (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`)
    .run(values);
  return Number(info.lastInsertRowid);
}

export function updateMonster(db: DB, id: number, input: MonsterInput) {
  db.prepare(
    `UPDATE monsters SET ${COLUMNS.map((c) => `${c} = @${c}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`,
  ).run({ ...scalarParams(input), id });
}

export function monsterVnumTaken(db: DB, vnum: number, exceptId?: number) {
  const row = db.prepare('SELECT id FROM monsters WHERE vnum = ?').get(vnum) as { id: number } | undefined;
  return !!row && row.id !== exceptId;
}

export function monsterCodeTaken(db: DB, code: string, exceptId?: number) {
  const row = db.prepare('SELECT id FROM monsters WHERE code = ?').get(code) as { id: number } | undefined;
  return !!row && row.id !== exceptId;
}

/** Kod doluysa sonuna vnum ekler (wolf → wolf_102). */
export function uniqueMonsterCode(db: DB, code: string, vnum: number, exceptId?: number) {
  if (!monsterCodeTaken(db, code, exceptId)) return code;
  const withVnum = `${code}_${vnum}`.slice(0, 40);
  return monsterCodeTaken(db, withVnum, exceptId) ? `mob_${vnum}` : withVnum;
}

export function nextMonsterVnum(db: DB) {
  const { max } = db.prepare('SELECT MAX(vnum) AS max FROM monsters').get() as { max: number | null };
  return (max ?? 100) + 1;
}

export function monsterToInput(m: Monster): MonsterInput {
  const { id: _id, iconUrl: _i, modelUrl: _m, modelFileName: _f, createdAt: _c, updatedAt: _u, ...input } = m;
  return input;
}
