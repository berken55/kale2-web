import express, { type Request, type Router } from 'express';
import { levelMultiplier, seededRng, simulateDrops, type ResolvedDropTable } from '../shared/drops.ts';
import type {
  DropGroup,
  DropGroupSummary,
  DropItemRef,
  DropRefs,
  DropRow,
  DropSimulationResponse,
  LevelDrop,
  LevelDropsResponse,
  MonsterDropsResponse,
} from '../shared/types.ts';
import { logActivity, type DB } from './db.ts';
import { HttpError } from './http-error.ts';
import { getMonsterRow } from './monsters.ts';
import {
  dropGroupInputSchema,
  formatZodError,
  levelDropsSchema,
  monsterDropsSchema,
  simulateSchema,
  type DropGroupInput,
  type DropRowInput,
  type LevelDropInput,
} from './validation.ts';
import type { z } from 'zod';

interface RowFields {
  item_vnum: number | null;
  group_id: number | null;
  chance_ppm: number;
  count_min: number;
  count_max: number;
  upgrade_min: number;
  upgrade_max: number;
}

const toRow = (r: RowFields): DropRow => ({
  itemVnum: r.item_vnum,
  groupId: r.group_id,
  chancePpm: r.chance_ppm,
  countMin: r.count_min,
  countMax: r.count_max,
  upgradeMin: r.upgrade_min,
  upgradeMax: r.upgrade_max,
});

const toLevelDrop = (r: RowFields & { level_min: number; level_max: number; ranks: string }): LevelDrop => ({
  ...toRow(r),
  levelMin: r.level_min,
  levelMax: r.level_max,
  ranks: JSON.parse(r.ranks),
});

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',');

export function itemRefs(db: DB, vnums: Iterable<number>): Record<number, DropItemRef> {
  const list = [...new Set(vnums)];
  const out: Record<number, DropItemRef> = {};
  if (!list.length) return out;
  const rows = db
    .prepare(`SELECT vnum, name, rarity, type, icon_path FROM items WHERE vnum IN (${placeholders(list.length)})`)
    .all(...list) as Array<{ vnum: number; name: string; rarity: string; type: string; icon_path: string | null }>;
  for (const r of rows) out[r.vnum] = { vnum: r.vnum, name: r.name, rarity: r.rarity, type: r.type, iconUrl: r.icon_path ? `/uploads/${r.icon_path}` : null };
  return out;
}

function refsFor(db: DB, rows: DropRow[]): DropRefs {
  const groupIds = [...new Set(rows.map((r) => r.groupId).filter((g): g is number => g !== null))];
  const groups: DropRefs['groups'] = {};
  if (groupIds.length) {
    for (const g of db.prepare(`SELECT id, code, name FROM drop_groups WHERE id IN (${placeholders(groupIds.length)})`).all(...groupIds) as Array<{ id: number; code: string; name: string }>) {
      groups[g.id] = g;
    }
  }
  return { items: itemRefs(db, rows.map((r) => r.itemVnum).filter((v): v is number => v !== null)), groups };
}

export function getMonsterDrops(db: DB, monsterId: number): DropRow[] {
  return (db.prepare('SELECT * FROM monster_drops WHERE monster_id = ? ORDER BY sort, id').all(monsterId) as RowFields[]).map(toRow);
}

export function listLevelDrops(db: DB): LevelDrop[] {
  return (db.prepare('SELECT * FROM level_drops ORDER BY level_min, level_max, sort, id').all() as Array<RowFields & { level_min: number; level_max: number; ranks: string }>).map(toLevelDrop);
}

/** Bu seviye ve rütbedeki yaratığa uygulanan genel drop satırları */
export function levelDropsFor(db: DB, level: number, rank: string) {
  return listLevelDrops(db).filter((d) => level >= d.levelMin && level <= d.levelMax && d.ranks.includes(rank));
}

/** Kaydetmeden önce satırların gerçekten var olan item ve gruplara işaret ettiğini doğrular. */
function checkRefs(db: DB, rows: Array<{ itemVnum: number | null; groupId: number | null }>) {
  const refs = refsFor(db, rows as DropRow[]);
  const missingItems = [...new Set(rows.map((r) => r.itemVnum).filter((v): v is number => v !== null && !refs.items[v]))];
  if (missingItems.length) throw new HttpError(400, `Panelde tanımlı olmayan item: ${missingItems.map((v) => `#${v}`).join(', ')}`);
  const missingGroups = rows.filter((r) => r.groupId !== null && !refs.groups[r.groupId]);
  if (missingGroups.length) throw new HttpError(400, 'Tanımsız drop grubu seçildi.');
}

const rowParams = (r: DropRowInput, sort: number) => ({
  item_vnum: r.itemVnum,
  group_id: r.groupId,
  chance_ppm: r.chancePpm,
  count_min: r.countMin,
  count_max: r.countMax,
  upgrade_min: r.upgradeMin,
  upgrade_max: r.upgradeMax,
  sort,
});

export function setMonsterDrops(db: DB, monsterId: number, rows: DropRowInput[]) {
  checkRefs(db, rows);
  db.transaction(() => {
    db.prepare('DELETE FROM monster_drops WHERE monster_id = ?').run(monsterId);
    const ins = db.prepare(
      `INSERT INTO monster_drops (monster_id, item_vnum, group_id, chance_ppm, count_min, count_max, upgrade_min, upgrade_max, sort)
       VALUES (@monster_id, @item_vnum, @group_id, @chance_ppm, @count_min, @count_max, @upgrade_min, @upgrade_max, @sort)`,
    );
    rows.forEach((r, i) => ins.run({ monster_id: monsterId, ...rowParams(r, i) }));
  })();
}

export function setLevelDrops(db: DB, rows: LevelDropInput[]) {
  checkRefs(db, rows);
  db.transaction(() => {
    db.prepare('DELETE FROM level_drops').run();
    const ins = db.prepare(
      `INSERT INTO level_drops (level_min, level_max, ranks, item_vnum, group_id, chance_ppm, count_min, count_max, upgrade_min, upgrade_max, sort)
       VALUES (@level_min, @level_max, @ranks, @item_vnum, @group_id, @chance_ppm, @count_min, @count_max, @upgrade_min, @upgrade_max, @sort)`,
    );
    rows.forEach((r, i) => ins.run({ level_min: r.levelMin, level_max: r.levelMax, ranks: JSON.stringify(r.ranks), ...rowParams(r, i) }));
  })();
}

// ---- Gruplar ----
type GroupRow = { id: number; code: string; name: string; roll_mode: 'EACH' | 'ONE_OF'; rolls: number; description: string };

export function listGroups(db: DB): DropGroupSummary[] {
  const rows = db
    .prepare(
      `SELECT g.*,
        (SELECT COUNT(*) FROM drop_group_entries e WHERE e.group_id = g.id) AS entry_count,
        (SELECT COUNT(DISTINCT monster_id) FROM monster_drops d WHERE d.group_id = g.id) AS used_monsters,
        (SELECT COUNT(*) FROM level_drops l WHERE l.group_id = g.id) AS used_levels
       FROM drop_groups g ORDER BY g.name COLLATE NOCASE`,
    )
    .all() as Array<GroupRow & { entry_count: number; used_monsters: number; used_levels: number }>;
  return rows.map((g) => ({
    id: g.id,
    code: g.code,
    name: g.name,
    rollMode: g.roll_mode,
    rolls: g.rolls,
    entryCount: g.entry_count,
    usedByMonsters: g.used_monsters,
    usedByLevelDrops: g.used_levels,
  }));
}

function groupEntries(db: DB, groupId: number) {
  return (db.prepare('SELECT * FROM drop_group_entries WHERE group_id = ? ORDER BY sort, id').all(groupId) as Array<RowFields & { item_vnum: number }>).map((e) => ({
    itemVnum: e.item_vnum,
    chancePpm: e.chance_ppm,
    countMin: e.count_min,
    countMax: e.count_max,
    upgradeMin: e.upgrade_min,
    upgradeMax: e.upgrade_max,
  }));
}

export function getGroup(db: DB, id: number): DropGroup | null {
  const g = db.prepare('SELECT * FROM drop_groups WHERE id = ?').get(id) as GroupRow | undefined;
  if (!g) return null;
  const entries = groupEntries(db, id);
  return {
    id: g.id,
    code: g.code,
    name: g.name,
    rollMode: g.roll_mode,
    rolls: g.rolls,
    description: g.description,
    entries,
    usedBy: db
      .prepare('SELECT DISTINCT m.id, m.vnum, m.name FROM monster_drops d JOIN monsters m ON m.id = d.monster_id WHERE d.group_id = ? ORDER BY m.level, m.vnum')
      .all(id) as DropGroup['usedBy'],
    usedByLevelDrops: (db.prepare('SELECT COUNT(*) AS c FROM level_drops WHERE group_id = ?').get(id) as { c: number }).c,
    items: itemRefs(db, entries.map((e) => e.itemVnum)),
  };
}

function writeGroup(db: DB, input: DropGroupInput, id?: number) {
  const dupe = db.prepare('SELECT id FROM drop_groups WHERE code = ?').get(input.code) as { id: number } | undefined;
  if (dupe && dupe.id !== id) throw new HttpError(409, `"${input.code}" kodu başka bir drop grubunda kullanılıyor.`);
  checkRefs(db, input.entries.map((e) => ({ itemVnum: e.itemVnum, groupId: null })));
  return db.transaction(() => {
    const params = { code: input.code, name: input.name, roll_mode: input.rollMode, rolls: input.rolls, description: input.description };
    let groupId = id;
    if (groupId === undefined) {
      groupId = Number(db.prepare('INSERT INTO drop_groups (code, name, roll_mode, rolls, description) VALUES (@code, @name, @roll_mode, @rolls, @description)').run(params).lastInsertRowid);
    } else {
      db.prepare('UPDATE drop_groups SET code = @code, name = @name, roll_mode = @roll_mode, rolls = @rolls, description = @description WHERE id = @id').run({ ...params, id: groupId });
      db.prepare('DELETE FROM drop_group_entries WHERE group_id = ?').run(groupId);
    }
    const ins = db.prepare(
      `INSERT INTO drop_group_entries (group_id, item_vnum, chance_ppm, count_min, count_max, upgrade_min, upgrade_max, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    input.entries.forEach((e, i) => ins.run(groupId, e.itemVnum, e.chancePpm, e.countMin, e.countMax, e.upgradeMin, e.upgradeMax, i));
    return groupId;
  })();
}

/** Item kaç drop satırında geçiyor (silmeden önce kontrol). */
export function dropUsageOfItem(db: DB, vnum: number) {
  const c = (sql: string) => (db.prepare(sql).get(vnum) as { c: number }).c;
  return (
    c('SELECT COUNT(*) AS c FROM monster_drops WHERE item_vnum = ?') +
    c('SELECT COUNT(*) AS c FROM level_drops WHERE item_vnum = ?') +
    c('SELECT COUNT(*) AS c FROM drop_group_entries WHERE item_vnum = ?')
  );
}

/** Yaratığın kendi dropları + ona uygulanan genel droplar, zar atılacak biçimde. */
export function resolveTable(db: DB, monster: { id: number; level: number; rank: string }): ResolvedDropTable {
  const rows = [...getMonsterDrops(db, monster.id), ...levelDropsFor(db, monster.level, monster.rank)];
  const groups: ResolvedDropTable['groups'] = {};
  for (const id of new Set(rows.map((r) => r.groupId).filter((g): g is number => g !== null))) {
    const g = db.prepare('SELECT roll_mode, rolls FROM drop_groups WHERE id = ?').get(id) as { roll_mode: 'EACH' | 'ONE_OF'; rolls: number } | undefined;
    if (g) groups[id] = { rollMode: g.roll_mode, rolls: g.rolls, entries: groupEntries(db, id) };
  }
  return { rows, groups };
}

// ---- Uç noktalar ----
const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Geçersiz id.');
  return id;
};

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const f = formatZodError(parsed.error);
    throw new HttpError(400, f.error, { issues: f.issues });
  }
  return parsed.data;
}

export function dropsRouter(db: DB): Router {
  const router = express.Router();

  const monsterOr404 = (req: Request) => {
    const row = getMonsterRow(db, idParam(req));
    if (!row) throw new HttpError(404, 'Canavar bulunamadı.');
    return row;
  };

  const monsterDrops = (m: { id: number; level: number; rank: string }): MonsterDropsResponse => {
    const drops = getMonsterDrops(db, m.id);
    const levelDrops = levelDropsFor(db, m.level, m.rank);
    return { drops, levelDrops, ...refsFor(db, [...drops, ...levelDrops]) };
  };

  router.get('/monsters/:id/drops', (req, res) => res.json(monsterDrops(monsterOr404(req))));

  router.put('/monsters/:id/drops', (req, res) => {
    const m = monsterOr404(req);
    const { drops } = parse(monsterDropsSchema, req.body);
    setMonsterDrops(db, m.id, drops);
    logActivity(db, 'update', 'monster', m.id, `Droplar güncellendi: ${m.name} (#${m.vnum}, ${drops.length} satır)`);
    res.json(monsterDrops(m));
  });

  router.post('/monsters/:id/simulate-drops', (req, res) => {
    const m = monsterOr404(req);
    const q = parse(simulateSchema, req.body);
    const playerLevel = q.playerLevel ?? m.level;
    const multiplier = levelMultiplier(playerLevel, m.level);
    const rng = q.seed === undefined ? Math.random : seededRng(q.seed);
    const sim = simulateDrops(resolveTable(db, m), multiplier, q.kills, rng);
    const items = itemRefs(db, sim.lines.map((l) => l.itemVnum));
    const result: DropSimulationResponse = {
      kills: q.kills,
      playerLevel,
      multiplier,
      emptyKills: sim.emptyKills,
      lines: sim.lines.map(({ itemVnum, ...rest }) => ({
        item: items[itemVnum] ?? { vnum: itemVnum, name: `#${itemVnum}`, rarity: 'COMMON', type: '', iconUrl: null },
        ...rest,
      })),
    };
    res.json(result);
  });

  const levelDropsResponse = (): LevelDropsResponse => {
    const levelDrops = listLevelDrops(db);
    return { levelDrops, ...refsFor(db, levelDrops) };
  };

  router.get('/level-drops', (_req, res) => res.json(levelDropsResponse()));

  router.put('/level-drops', (req, res) => {
    const { levelDrops } = parse(levelDropsSchema, req.body);
    setLevelDrops(db, levelDrops);
    logActivity(db, 'update', 'system', null, `Genel drop tablosu güncellendi (${levelDrops.length} satır)`);
    res.json(levelDropsResponse());
  });

  router.get('/drop-groups', (_req, res) => res.json(listGroups(db)));

  router.get('/drop-groups/:id', (req, res) => {
    const g = getGroup(db, idParam(req));
    if (!g) throw new HttpError(404, 'Drop grubu bulunamadı.');
    res.json(g);
  });

  router.post('/drop-groups', (req, res) => {
    const input = parse(dropGroupInputSchema, req.body);
    const id = writeGroup(db, input);
    logActivity(db, 'create', 'system', id, `Drop grubu oluşturuldu: ${input.name}`);
    res.status(201).json(getGroup(db, id));
  });

  router.put('/drop-groups/:id', (req, res) => {
    const id = idParam(req);
    if (!db.prepare('SELECT 1 FROM drop_groups WHERE id = ?').get(id)) throw new HttpError(404, 'Drop grubu bulunamadı.');
    const input = parse(dropGroupInputSchema, req.body);
    writeGroup(db, input, id);
    logActivity(db, 'update', 'system', id, `Drop grubu güncellendi: ${input.name}`);
    res.json(getGroup(db, id));
  });

  router.delete('/drop-groups/:id', (req, res) => {
    const g = getGroup(db, idParam(req));
    if (!g) throw new HttpError(404, 'Drop grubu bulunamadı.');
    if (g.usedBy.length || g.usedByLevelDrops) {
      throw new HttpError(409, `Bu grup ${g.usedBy.length} yaratık ve ${g.usedByLevelDrops} genel drop satırında kullanılıyor; önce oradan kaldırın.`);
    }
    db.prepare('DELETE FROM drop_groups WHERE id = ?').run(g.id);
    logActivity(db, 'delete', 'system', g.id, `Drop grubu silindi: ${g.name}`);
    res.status(204).end();
  });

  return router;
}
