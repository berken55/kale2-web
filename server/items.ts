import type { Item, ItemSummary } from '../shared/types.ts';
import type { DB } from './db.ts';
import type { ItemInput } from './validation.ts';

interface ItemRow {
  id: number;
  vnum: number;
  name: string;
  type: string;
  subtype: string;
  rarity: string;
  level_required: number;
  classes: string;
  gender: string;
  buy_price: number;
  sell_price: number;
  stack_size: number;
  tradable: number;
  description: string;
  min_attack: number;
  max_attack: number;
  min_magic_attack: number;
  max_magic_attack: number;
  defense: number;
  attack_speed: number;
  icon_path: string | null;
  model_path: string | null;
  model_file_name: string | null;
  created_at: string;
  updated_at: string;
}

const fileUrl = (p: string | null) => (p ? `/uploads/${p}` : null);

function rowToSummary(row: ItemRow): ItemSummary {
  return {
    id: row.id,
    vnum: row.vnum,
    name: row.name,
    type: row.type as Item['type'],
    subtype: row.subtype,
    rarity: row.rarity as Item['rarity'],
    levelRequired: row.level_required,
    classes: JSON.parse(row.classes),
    iconUrl: fileUrl(row.icon_path),
    modelUrl: fileUrl(row.model_path),
    updatedAt: row.updated_at,
  };
}

export function getItemRow(db: DB, id: number) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
}

export function getItem(db: DB, id: number): Item | null {
  const row = getItemRow(db, id);
  if (!row) return null;
  const bonuses = db
    .prepare('SELECT bonus_type_id, value FROM item_bonuses WHERE item_id = ? ORDER BY sort')
    .all(id) as Array<{ bonus_type_id: number; value: number }>;
  const upgrades = db
    .prepare('SELECT * FROM item_upgrades WHERE item_id = ? ORDER BY level')
    .all(id) as Array<{
    level: number;
    attack_bonus: number;
    magic_attack_bonus: number;
    defense_bonus: number;
    success_rate: number;
    cost: number;
    materials: string;
  }>;
  return {
    ...rowToSummary(row),
    gender: row.gender as Item['gender'],
    buyPrice: row.buy_price,
    sellPrice: row.sell_price,
    stackSize: row.stack_size,
    tradable: row.tradable === 1,
    description: row.description,
    stats: {
      minAttack: row.min_attack,
      maxAttack: row.max_attack,
      minMagicAttack: row.min_magic_attack,
      maxMagicAttack: row.max_magic_attack,
      defense: row.defense,
      attackSpeed: row.attack_speed,
    },
    bonuses: bonuses.map((b) => ({ bonusTypeId: b.bonus_type_id, value: b.value })),
    upgrades: upgrades.map((u) => ({
      level: u.level,
      attackBonus: u.attack_bonus,
      magicAttackBonus: u.magic_attack_bonus,
      defenseBonus: u.defense_bonus,
      successRate: u.success_rate,
      cost: u.cost,
      materials: JSON.parse(u.materials),
    })),
    modelFileName: row.model_file_name,
    createdAt: row.created_at,
  };
}

export interface ListQuery {
  search?: string;
  type?: string;
  subtype?: string;
  rarity?: string;
  cls?: string;
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
  level: 'level_required ASC, vnum ASC',
  '-level': 'level_required DESC, vnum ASC',
  '-updated': 'updated_at DESC, id DESC',
};

export function listItems(db: DB, q: ListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.search) {
    where.push('(name LIKE ? OR CAST(vnum AS TEXT) LIKE ?)');
    params.push(`%${q.search}%`, `${q.search}%`);
  }
  if (q.type) {
    where.push('type = ?');
    params.push(q.type);
  }
  if (q.subtype) {
    where.push('subtype = ?');
    params.push(q.subtype);
  }
  if (q.rarity) {
    where.push('rarity = ?');
    params.push(q.rarity);
  }
  if (q.cls) {
    // Sınıf kısıtı olmayan itemler herkes tarafından kullanılabilir
    where.push("(classes = '[]' OR EXISTS (SELECT 1 FROM json_each(items.classes) WHERE value = ?))");
    params.push(q.cls);
  }
  if (q.hasModel !== undefined) where.push(q.hasModel ? 'model_path IS NOT NULL' : 'model_path IS NULL');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = SORTS[q.sort ?? ''] ?? SORTS.vnum;
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM items ${whereSql}`).get(...params) as { total: number };
  const rows = db
    .prepare(`SELECT * FROM items ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, q.pageSize, (q.page - 1) * q.pageSize) as ItemRow[];
  return { items: rows.map(rowToSummary), total, page: q.page, pageSize: q.pageSize };
}

export function findMissingBonusTypes(db: DB, ids: number[]) {
  if (!ids.length) return [];
  const existing = new Set(
    (db.prepare(`SELECT id FROM bonus_types WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Array<{
      id: number;
    }>).map((r) => r.id),
  );
  return ids.filter((id) => !existing.has(id));
}

/** Bonus değerlerinin, tanımlı maksimum değeri aşıp aşmadığını kontrol eder. */
export function findBonusLimitViolation(db: DB, bonuses: ItemInput['bonuses']) {
  for (const b of bonuses) {
    const bt = db.prepare('SELECT name, max_value FROM bonus_types WHERE id = ?').get(b.bonusTypeId) as
      | { name: string; max_value: number }
      | undefined;
    if (bt && bt.max_value > 0 && Math.abs(b.value) > bt.max_value) {
      return `"${bt.name}" bonusu en fazla ${bt.max_value} olabilir.`;
    }
  }
  return null;
}

function writeChildren(db: DB, itemId: number, input: ItemInput) {
  db.prepare('DELETE FROM item_bonuses WHERE item_id = ?').run(itemId);
  db.prepare('DELETE FROM item_upgrades WHERE item_id = ?').run(itemId);
  const insBonus = db.prepare('INSERT INTO item_bonuses (item_id, bonus_type_id, value, sort) VALUES (?, ?, ?, ?)');
  input.bonuses.forEach((b, i) => insBonus.run(itemId, b.bonusTypeId, b.value, i));
  const insUpgrade = db.prepare(
    `INSERT INTO item_upgrades (item_id, level, attack_bonus, magic_attack_bonus, defense_bonus, success_rate, cost, materials)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const u of input.upgrades) {
    insUpgrade.run(
      itemId,
      u.level,
      u.attackBonus,
      u.magicAttackBonus,
      u.defenseBonus,
      u.successRate,
      u.cost,
      JSON.stringify(u.materials),
    );
  }
}

function scalarParams(input: ItemInput) {
  return {
    vnum: input.vnum,
    name: input.name,
    type: input.type,
    subtype: input.subtype,
    rarity: input.rarity,
    level_required: input.levelRequired,
    classes: JSON.stringify(input.classes),
    gender: input.gender,
    buy_price: input.buyPrice,
    sell_price: input.sellPrice,
    stack_size: input.stackSize,
    tradable: input.tradable ? 1 : 0,
    description: input.description,
    min_attack: input.stats.minAttack,
    max_attack: input.stats.maxAttack,
    min_magic_attack: input.stats.minMagicAttack,
    max_magic_attack: input.stats.maxMagicAttack,
    defense: input.stats.defense,
    attack_speed: input.stats.attackSpeed,
  };
}

const COLUMNS = Object.keys(scalarParams({ stats: {}, classes: [] } as unknown as ItemInput));

export function createItem(db: DB, input: ItemInput): number {
  return db.transaction(() => {
    const info = db
      .prepare(`INSERT INTO items (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((c) => '@' + c).join(', ')})`)
      .run(scalarParams(input));
    const id = Number(info.lastInsertRowid);
    writeChildren(db, id, input);
    return id;
  })();
}

export function updateItem(db: DB, id: number, input: ItemInput) {
  db.transaction(() => {
    db.prepare(
      `UPDATE items SET ${COLUMNS.map((c) => `${c} = @${c}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`,
    ).run({ ...scalarParams(input), id });
    writeChildren(db, id, input);
  })();
}

export function vnumTaken(db: DB, vnum: number, exceptId?: number) {
  const row = db.prepare('SELECT id FROM items WHERE vnum = ?').get(vnum) as { id: number } | undefined;
  return !!row && row.id !== exceptId;
}

export function nextVnum(db: DB) {
  const { max } = db.prepare('SELECT MAX(vnum) AS max FROM items').get() as { max: number | null };
  // Metin2 geleneği: yükseltme seviyeleri için 10'luk bloklar
  return max ? Math.floor(max / 10) * 10 + 10 : 10;
}

export function itemToInput(item: Item): ItemInput {
  return {
    vnum: item.vnum,
    name: item.name,
    type: item.type,
    subtype: item.subtype,
    rarity: item.rarity,
    levelRequired: item.levelRequired,
    classes: item.classes,
    gender: item.gender,
    buyPrice: item.buyPrice,
    sellPrice: item.sellPrice,
    stackSize: item.stackSize,
    tradable: item.tradable,
    description: item.description,
    stats: item.stats,
    bonuses: item.bonuses,
    upgrades: item.upgrades,
  };
}
