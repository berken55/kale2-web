import crypto from 'node:crypto';
import express, { type Request, type Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { GameMap, GameMapDetail, GameMapSummary, SpawnMonsterRef, SpawnRegion } from '../shared/types.ts';
import { logActivity, type DB } from './db.ts';
import { HttpError } from './http-error.ts';
import { formatZodError, mapInputSchema, mapRegionsSchema, type SpawnRegionInput } from './validation.ts';
import type { z } from 'zod';

type MapRow = { id: number; code: string; name: string; minimap_path: string | null; world_min_x: number; world_min_z: number; world_max_x: number; world_max_z: number };

const toMap = (r: MapRow): GameMap => ({
  id: r.id,
  code: r.code,
  name: r.name,
  minimapUrl: r.minimap_path ? `/uploads/${r.minimap_path}` : null,
  worldMinX: r.world_min_x,
  worldMinZ: r.world_min_z,
  worldMaxX: r.world_max_x,
  worldMaxZ: r.world_max_z,
});

export function getMapRow(db: DB, id: number) {
  return db.prepare('SELECT * FROM maps WHERE id = ?').get(id) as MapRow | undefined;
}

export function listMapRows(db: DB) {
  return db.prepare('SELECT * FROM maps ORDER BY code').all() as MapRow[];
}

/** Haritanın bölgeleri ve her bölgenin spawn satırları (iç id'ler olmadan). */
export function getRegions(db: DB, mapId: number): SpawnRegion[] {
  const regions = db.prepare('SELECT * FROM spawn_regions WHERE map_id = ? ORDER BY sort, id').all(mapId) as Array<Record<string, unknown>>;
  const spawns = db.prepare('SELECT * FROM spawn_entries WHERE region_id = ? ORDER BY sort, id');
  return regions.map((r) => ({
    code: r.code as string,
    name: r.name as string,
    shape: r.shape as SpawnRegion['shape'],
    x: r.x as number,
    z: r.z as number,
    radius: r.radius as number,
    points: JSON.parse(r.points as string),
    levelMin: r.level_min as number,
    levelMax: r.level_max as number,
    spawns: (spawns.all(r.id) as Array<Record<string, unknown>>).map((s) => ({
      monsterId: s.monster_id as number,
      kind: s.kind as SpawnRegion['spawns'][number]['kind'],
      maxAlive: s.max_alive as number,
      packMin: s.pack_min as number,
      packMax: s.pack_max as number,
      respawnMinS: s.respawn_min_s as number,
      respawnMaxS: s.respawn_max_s as number,
      announce: s.announce === 1,
      schedule: s.schedule as string,
      leaderId: (s.leader_id as number | null) ?? null,
    })),
  }));
}

function monsterRefs(db: DB, ids: number[]): Record<number, SpawnMonsterRef> {
  const out: Record<number, SpawnMonsterRef> = {};
  const list = [...new Set(ids)];
  if (!list.length) return out;
  const rows = db
    .prepare(`SELECT id, vnum, code, name, rank, level, exp, icon_path FROM monsters WHERE id IN (${list.map(() => '?').join(',')})`)
    .all(...list) as Array<{ id: number; vnum: number; code: string; name: string; rank: string; level: number; exp: number; icon_path: string | null }>;
  for (const r of rows) out[r.id] = { id: r.id, vnum: r.vnum, code: r.code, name: r.name, rank: r.rank, level: r.level, exp: r.exp, iconUrl: r.icon_path ? `/uploads/${r.icon_path}` : null };
  return out;
}

function detail(db: DB, row: MapRow): GameMapDetail {
  const regions = getRegions(db, row.id);
  const ids = regions.flatMap((r) => r.spawns.flatMap((s) => [s.monsterId, ...(s.leaderId ? [s.leaderId] : [])]));
  return { ...toMap(row), regions, monsters: monsterRefs(db, ids) };
}

function setRegions(db: DB, mapId: number, regions: SpawnRegionInput[]) {
  const ids = regions.flatMap((r) => r.spawns.flatMap((s) => [s.monsterId, ...(s.leaderId ? [s.leaderId] : [])]));
  const known = monsterRefs(db, ids);
  const missing = [...new Set(ids.filter((id) => !known[id]))];
  if (missing.length) throw new HttpError(400, 'Spawn satırında tanımsız canavar seçildi.');
  db.transaction(() => {
    db.prepare('DELETE FROM spawn_regions WHERE map_id = ?').run(mapId);
    const insRegion = db.prepare(
      `INSERT INTO spawn_regions (map_id, code, name, shape, x, z, radius, points, level_min, level_max, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insSpawn = db.prepare(
      `INSERT INTO spawn_entries (region_id, monster_id, kind, max_alive, pack_min, pack_max, respawn_min_s, respawn_max_s, announce, schedule, leader_id, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    regions.forEach((r, i) => {
      const regionId = Number(
        insRegion.run(mapId, r.code, r.name, r.shape, r.x, r.z, r.radius, JSON.stringify(r.shape === 'POLYGON' ? r.points : []), r.levelMin, r.levelMax, i).lastInsertRowid,
      );
      r.spawns.forEach((s, j) =>
        insSpawn.run(regionId, s.monsterId, s.kind, s.maxAlive, s.packMin, s.packMax, s.respawnMinS, s.respawnMaxS, s.announce ? 1 : 0, s.schedule, s.leaderId, j),
      );
    });
  })();
}

/** Canavar kaç spawn satırında geçiyor (silmeden önce kontrol). */
export function spawnUsageOfMonster(db: DB, monsterId: number) {
  return (db.prepare('SELECT COUNT(*) AS c FROM spawn_entries WHERE monster_id = ? OR leader_id = ?').get(monsterId, monsterId) as { c: number }).c;
}

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

const MINIMAP_TYPES: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

export function mapsRouter(db: DB, uploadDir: string): Router {
  const router = express.Router();
  fs.mkdirSync(path.join(uploadDir, 'maps'), { recursive: true });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } }).single('file');

  const mapOr404 = (req: Request) => {
    const row = getMapRow(db, idParam(req));
    if (!row) throw new HttpError(404, 'Harita bulunamadı.');
    return row;
  };

  router.get('/maps', (_req, res) => {
    const counts = db.prepare(
      `SELECT (SELECT COUNT(*) FROM spawn_regions WHERE map_id = ?) AS regions,
              (SELECT COUNT(*) FROM spawn_entries e JOIN spawn_regions r ON r.id = e.region_id WHERE r.map_id = ?) AS spawns`,
    );
    const list: GameMapSummary[] = listMapRows(db).map((r) => {
      const c = counts.get(r.id, r.id) as { regions: number; spawns: number };
      return { ...toMap(r), regionCount: c.regions, spawnCount: c.spawns };
    });
    res.json(list);
  });

  router.get('/maps/:id', (req, res) => res.json(detail(db, mapOr404(req))));

  const writeMap = (body: unknown, id?: number) => {
    const m = parse(mapInputSchema, body);
    const dupe = db.prepare('SELECT id FROM maps WHERE code = ?').get(m.code) as { id: number } | undefined;
    if (dupe && dupe.id !== id) throw new HttpError(409, `"${m.code}" harita kodu zaten kullanılıyor.`);
    const params = [m.code, m.name, m.worldMinX, m.worldMinZ, m.worldMaxX, m.worldMaxZ];
    if (id === undefined) {
      return Number(
        db.prepare('INSERT INTO maps (code, name, world_min_x, world_min_z, world_max_x, world_max_z) VALUES (?, ?, ?, ?, ?, ?)').run(...params).lastInsertRowid,
      );
    }
    db.prepare('UPDATE maps SET code = ?, name = ?, world_min_x = ?, world_min_z = ?, world_max_x = ?, world_max_z = ? WHERE id = ?').run(...params, id);
    return id;
  };

  router.post('/maps', (req, res) => {
    const id = writeMap(req.body);
    const row = getMapRow(db, id)!;
    logActivity(db, 'create', 'system', id, `Harita oluşturuldu: ${row.name}`);
    res.status(201).json(detail(db, row));
  });

  router.put('/maps/:id', (req, res) => {
    const id = mapOr404(req).id;
    writeMap(req.body, id);
    const row = getMapRow(db, id)!;
    logActivity(db, 'update', 'system', id, `Harita güncellendi: ${row.name}`);
    res.json(detail(db, row));
  });

  router.delete('/maps/:id', (req, res) => {
    const row = mapOr404(req);
    db.prepare('DELETE FROM maps WHERE id = ?').run(row.id);
    if (row.minimap_path) fs.rm(path.join(uploadDir, row.minimap_path), { force: true }, () => {});
    logActivity(db, 'delete', 'system', row.id, `Harita silindi: ${row.name}`);
    res.status(204).end();
  });

  router.put('/maps/:id/regions', (req, res) => {
    const row = mapOr404(req);
    const { regions } = parse(mapRegionsSchema, req.body);
    setRegions(db, row.id, regions);
    logActivity(db, 'update', 'system', row.id, `Spawn bölgeleri güncellendi: ${row.name} (${regions.length} bölge)`);
    res.json(detail(db, row));
  });

  router.post('/maps/:id/minimap', (req, res, next) => {
    const row = mapOr404(req);
    upload(req, res, (err?: unknown) => {
      try {
        if (err instanceof multer.MulterError) throw new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Minimap en fazla 8 MB olabilir.' : err.message);
        if (err) throw err;
        const ext = req.file ? MINIMAP_TYPES[req.file.mimetype] : undefined;
        if (!req.file || !ext) throw new HttpError(400, 'PNG, JPG ya da WEBP minimap resmi gönderin.');
        const rel = `maps/${crypto.randomUUID()}${ext}`;
        fs.writeFileSync(path.join(uploadDir, rel), req.file.buffer);
        db.prepare('UPDATE maps SET minimap_path = ? WHERE id = ?').run(rel, row.id);
        if (row.minimap_path) fs.rm(path.join(uploadDir, row.minimap_path), { force: true }, () => {});
        logActivity(db, 'upload', 'system', row.id, `Minimap yüklendi: ${row.name}`);
        res.json(detail(db, getMapRow(db, row.id)!));
      } catch (e) {
        next(e);
      }
    });
  });

  return router;
}
