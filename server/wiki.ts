import express, { type Router } from 'express';
import { z } from 'zod';
import type { BonusType, WikiCatalog, WikiItemDetail, WikiMaterialRef, WikiMonsterListResponse } from '../shared/types.ts';
import type { DB } from './db.ts';
import { getItem, listItems } from './items.ts';
import { getMonsterByVnum, listMonsters } from './monsters.ts';

/** Oyuncuların görebileceği, giriş gerektirmeyen salt okunur item wiki API'si. */
export function wikiRouter(db: DB): Router {
  const router = express.Router();

  router.get('/catalog', (_req, res) => {
    const catalog: WikiCatalog = {
      total: (db.prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number }).c,
      groups: db
        .prepare('SELECT type, subtype, COUNT(*) AS count FROM items GROUP BY type, subtype')
        .all() as WikiCatalog['groups'],
    };
    res.json(catalog);
  });

  const listSchema = z.object({
    search: z.string().trim().max(64).optional(),
    type: z.string().max(32).optional(),
    subtype: z.string().max(32).optional(),
    class: z.string().max(32).optional(),
    sort: z.string().max(16).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  });

  router.get('/items', (req, res) => {
    const q = listSchema.parse(req.query);
    const list = listItems(db, {
      search: q.search || undefined,
      type: q.type || undefined,
      subtype: q.subtype || undefined,
      cls: q.class || undefined,
      sort: q.sort ?? 'level',
      page: q.page,
      pageSize: q.pageSize,
    });
    res.json({ ...list, items: list.items.map((i) => getItem(db, i.id)!) });
  });

  router.get('/items/:vnum', (req, res) => {
    const vnum = Number(req.params.vnum);
    if (!Number.isInteger(vnum) || vnum < 1) return res.status(400).json({ error: 'Geçersiz vnum.' });

    // Metin2 geleneği: +N seviyesi, taban vnum + N ile anılır (ör. 19 = 10 numaralı itemin +9'u)
    let row = db.prepare('SELECT id FROM items WHERE vnum = ?').get(vnum) as { id: number } | undefined;
    let level = 0;
    if (!row) {
      const base = db
        .prepare(
          `SELECT i.id, i.vnum FROM items i JOIN item_upgrades u ON u.item_id = i.id
           WHERE i.vnum < ? AND i.vnum + u.level = ? ORDER BY i.vnum DESC LIMIT 1`,
        )
        .get(vnum, vnum) as { id: number; vnum: number } | undefined;
      if (base) {
        row = { id: base.id };
        level = vnum - base.vnum;
      }
    }
    if (!row) return res.status(404).json({ error: 'Item bulunamadı.' });

    const item = getItem(db, row.id)!;
    const bonusIds = item.bonuses.map((b) => b.bonusTypeId);
    const bonusTypes = bonusIds.length
      ? (
          db.prepare(`SELECT * FROM bonus_types WHERE id IN (${bonusIds.map(() => '?').join(',')})`).all(...bonusIds) as Array<
            Record<string, unknown>
          >
        ).map(
          (r): BonusType => ({
            id: r.id as number,
            code: r.code as string,
            name: r.name as string,
            unit: r.unit as BonusType['unit'],
            maxValue: r.max_value as number,
            description: r.description as string,
          }),
        )
      : [];

    const materialVnums = [...new Set(item.upgrades.flatMap((u) => u.materials.map((m) => m.vnum)))];
    const materials: Record<number, WikiMaterialRef> = {};
    if (materialVnums.length) {
      const rows = db
        .prepare(`SELECT id, vnum, name, rarity, icon_path FROM items WHERE vnum IN (${materialVnums.map(() => '?').join(',')})`)
        .all(...materialVnums) as Array<{ id: number; vnum: number; name: string; rarity: string; icon_path: string | null }>;
      for (const r of rows) {
        materials[r.vnum] = { id: r.id, vnum: r.vnum, name: r.name, rarity: r.rarity, iconUrl: r.icon_path ? `/uploads/${r.icon_path}` : null };
      }
    }

    const detail: WikiItemDetail = { item, level, bonusTypes, materials };
    res.json(detail);
  });

  // ---- Canavarlar ----
  const monsterListSchema = z.object({
    search: z.string().trim().max(64).optional(),
    rank: z.string().max(16).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  });

  router.get('/monsters', (req, res) => {
    const q = monsterListSchema.parse(req.query);
    const list: WikiMonsterListResponse = listMonsters(db, {
      search: q.search || undefined,
      rank: q.rank || undefined,
      sort: 'level',
      page: q.page,
      pageSize: q.pageSize,
    });
    res.json(list);
  });

  router.get('/monsters/:vnum', (req, res) => {
    const vnum = Number(req.params.vnum);
    if (!Number.isInteger(vnum) || vnum < 1) return res.status(400).json({ error: 'Geçersiz vnum.' });
    const monster = getMonsterByVnum(db, vnum);
    if (!monster) return res.status(404).json({ error: 'Canavar bulunamadı.' });
    // Oyun koduna ve kaynak adresine oyuncuların ihtiyacı yok
    const { code: _code, sourceUrl: _source, ...pub } = monster;
    res.json(pub);
  });

  return router;
}
