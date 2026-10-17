import crypto from 'node:crypto';
import express, { type Request, type Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  BUNDLE_FORMAT,
  BUNDLE_FORMAT_VERSION,
  DEFAULT_GAME_CONFIG,
  MONSTER_STATS_MODES,
  type GameConfig,
  type Bundle,
  type BundleContent,
  type BundleDrop,
  type BundleFile,
  type ReleaseChange,
  type ReleasePreview,
  type ReleaseSummary,
} from '../shared/bundle.ts';
import { DEFAULT_LEVEL_PENALTY } from '../shared/drops.ts';
import { logActivity, type DB } from './db.ts';
import { getMonsterDrops, listLevelDrops } from './drops.ts';
import { HttpError } from './http-error.ts';
import { getRegions, listMapRows } from './maps.ts';
import type { MonsterRow } from './monsters.ts';

export function getGameConfig(db: DB): GameConfig {
  const config: GameConfig = { ...DEFAULT_GAME_CONFIG };
  for (const r of db.prepare('SELECT key, value FROM game_config').all() as Array<{ key: string; value: string }>) {
    if (r.key in config) (config as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
  }
  return config;
}

const configSchema = z.object({ monster_stats: z.enum(MONSTER_STATS_MODES.map((m) => m.value) as ['game', 'panel']) }).partial();

const sha = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');

// Büyük model dosyalarını her yayında yeniden okumamak için: yol → {boyut, değişme zamanı, hash}
const fileHashes = new Map<string, { size: number; mtime: number; hash: string }>();

function fileRef(uploadDir: string, rel: string | null, missing: string[]): BundleFile | null {
  if (!rel) return null;
  const full = path.resolve(uploadDir, rel);
  let st: fs.Stats;
  try {
    st = fs.statSync(full);
  } catch {
    missing.push(rel);
    return null;
  }
  let cached = fileHashes.get(full);
  if (!cached || cached.size !== st.size || cached.mtime !== st.mtimeMs) {
    cached = { size: st.size, mtime: st.mtimeMs, hash: sha(fs.readFileSync(full)) };
    fileHashes.set(full, cached);
  }
  return { url: `/uploads/${rel.replace(/\\/g, '/')}`, sha256: cached.hash };
}

type Row = { item_vnum: number | null; group_id: number | null };

/** Panel veritabanından oyunun okuyacağı içeriği üretir; doğrulama sorunlarını da toplar. */
export function buildContent(db: DB, uploadDir: string) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingFiles: string[] = [];

  const items = (db.prepare('SELECT * FROM items ORDER BY vnum').all() as Array<Record<string, unknown>>).map((r) => ({
    vnum: r.vnum as number,
    code: (r.code as string | null) ?? null,
    name: r.name as string,
    type: r.type as string,
    subtype: r.subtype as string,
    rarity: r.rarity as string,
    level: r.level_required as number,
    stack: r.stack_size as number,
    icon: fileRef(uploadDir, r.icon_path as string | null, missingFiles),
    model: fileRef(uploadDir, r.model_path as string | null, missingFiles),
  }));
  const itemByVnum = new Map(items.map((i) => [i.vnum, i]));

  const groupRows = db.prepare('SELECT * FROM drop_groups ORDER BY code').all() as Array<{ id: number; code: string; name: string; roll_mode: 'EACH' | 'ONE_OF'; rolls: number }>;
  const groupCode = new Map(groupRows.map((g) => [g.id, g.code]));
  const noCode = new Set<string>();

  const drop = (r: { itemVnum: number | null; groupId: number | null; chancePpm: number; countMin: number; countMax: number; upgradeMin: number; upgradeMax: number }, where: string): BundleDrop => {
    const base = { ppm: r.chancePpm, count: [r.countMin, r.countMax] as [number, number], upgrade: [r.upgradeMin, r.upgradeMax] as [number, number] };
    if (r.groupId !== null) return { group: groupCode.get(r.groupId)!, ...base };
    const item = itemByVnum.get(r.itemVnum!);
    if (!item?.code) noCode.add(`${item?.name ?? '?'} (#${r.itemVnum}) — ${where}`);
    return { item: r.itemVnum!, code: item?.code ?? null, ...base };
  };

  const drop_groups: BundleContent['drop_groups'] = {};
  for (const g of groupRows) {
    const entries = (db.prepare('SELECT * FROM drop_group_entries WHERE group_id = ? ORDER BY sort, id').all(g.id) as Array<Record<string, number>>).map((e) => {
      const d = drop({ itemVnum: e.item_vnum, groupId: null, chancePpm: e.chance_ppm, countMin: e.count_min, countMax: e.count_max, upgradeMin: e.upgrade_min, upgradeMax: e.upgrade_max }, `${g.name} grubu`);
      return { ...d, item: e.item_vnum };
    });
    if (!entries.length) warnings.push(`"${g.name}" drop grubu boş; tetiklense de bir şey düşmez.`);
    if (g.roll_mode === 'ONE_OF' && entries.length && entries.every((e) => e.ppm === 0)) errors.push(`"${g.name}" drop grubunda bütün ağırlıklar 0.`);
    drop_groups[g.code] = { name: g.name, mode: g.roll_mode, rolls: g.rolls, entries };
  }

  const monsters = (db.prepare('SELECT * FROM monsters ORDER BY vnum').all() as MonsterRow[]).map((m) => {
    if (m.damage_max <= 0 && m.rank !== 'NPC' && m.rank !== 'STONE') warnings.push(`${m.name} (#${m.vnum}) hasar vermiyor (max hasar 0).`);
    if (!m.model_path) warnings.push(`${m.name} (#${m.vnum}) için 3D model yok; oyun kendi modelini kullanır.`);
    const model = fileRef(uploadDir, m.model_path, missingFiles);
    return {
      vnum: m.vnum,
      code: m.code,
      name: m.name,
      rank: m.rank,
      level: m.level,
      race: m.race,
      element: m.element,
      hp: m.hp,
      hp_regen: [m.hp_regen_pct, m.hp_regen_sec] as [number, number],
      exp: m.exp,
      damage: [m.damage_min, m.damage_max] as [number, number],
      defense: m.defense,
      stats: { str: m.stat_str, dex: m.stat_dex, vit: m.stat_vit, int: m.stat_int },
      attack_speed: m.attack_speed,
      move_speed: m.move_speed,
      attack_range: m.attack_range,
      aggressive: m.aggressive === 1,
      aggro_range: m.aggro_range,
      yang: [m.yang_min, m.yang_max] as [number, number],
      resists: JSON.parse(m.resists),
      abilities: JSON.parse(m.abilities),
      flags: JSON.parse(m.flags),
      model: model ? { ...model, scale: m.model_scale } : null,
      icon: fileRef(uploadDir, m.icon_path, missingFiles),
      drops: getMonsterDrops(db, m.id).map((d) => drop(d, m.name)),
    };
  });

  const level_drops = listLevelDrops(db).map((d) => ({
    ...drop(d, `genel drop Sv. ${d.levelMin}–${d.levelMax}`),
    level: [d.levelMin, d.levelMax] as [number, number],
    ranks: d.ranks,
  }));

  const monsterById = new Map(
    (db.prepare('SELECT id, code, vnum, name, level FROM monsters').all() as Array<{ id: number; code: string; vnum: number; name: string; level: number }>).map((m) => [m.id, m]),
  );
  const maps: BundleContent['maps'] = {};
  for (const map of listMapRows(db)) {
    const inside = (x: number, z: number) => x >= map.world_min_x && x <= map.world_max_x && z >= map.world_min_z && z <= map.world_max_z;
    const regions = getRegions(db, map.id).map((r) => {
      const pts = r.shape === 'CIRCLE' ? [[r.x, r.z]] : r.points;
      if (pts.some(([x, z]) => !inside(x, z))) warnings.push(`${map.name} / ${r.name}: bölge harita sınırlarının dışına taşıyor.`);
      if (!r.spawns.length) warnings.push(`${map.name} / ${r.name}: bölgede spawn yok.`);
      return {
        code: r.code,
        name: r.name,
        shape: r.shape,
        x: r.x,
        z: r.z,
        radius: r.radius,
        points: r.points,
        level: [r.levelMin, r.levelMax] as [number, number],
        spawns: r.spawns.map((s) => {
          const m = monsterById.get(s.monsterId)!;
          if (m.level < r.levelMin || m.level > r.levelMax) warnings.push(`${map.name} / ${r.name}: ${m.name} (Sv. ${m.level}) bölgenin seviye aralığı (${r.levelMin}–${r.levelMax}) dışında.`);
          if (s.kind === 'STONE' || s.kind === 'EVENT') warnings.push(`${map.name} / ${r.name}: ${m.name} "${s.kind === 'STONE' ? 'Metin taşı' : 'olay'}" türünde; oyun bunları henüz doğurmuyor (5. adım).`);
          return {
            monster: m.code,
            vnum: m.vnum,
            kind: s.kind,
            max_alive: s.maxAlive,
            pack: [s.packMin, s.packMax] as [number, number],
            respawn: [s.respawnMinS, s.respawnMaxS] as [number, number],
            announce: s.announce,
            schedule: s.schedule,
            leader: s.leaderId ? (monsterById.get(s.leaderId)?.code ?? null) : null,
          };
        }),
      };
    });
    if (!map.minimap_path) warnings.push(`${map.name} haritasının minimap resmi yok.`);
    maps[map.code] = { name: map.name, rect: [map.world_min_x, map.world_min_z, map.world_max_x, map.world_max_z], regions };
  }

  for (const f of missingFiles) errors.push(`Yüklenmiş dosya diskte yok: ${f}`);
  for (const n of noCode) warnings.push(`Oyun kodu olmayan item dropta: ${n}. Oyunda düşmez; itemin "Oyun kodu" alanını doldurun.`);

  const content: BundleContent = { config: { ...getGameConfig(db), drop_level_penalty: [...DEFAULT_LEVEL_PENALTY] }, items, monsters, drop_groups, level_drops, maps };
  return { content, sha256: sha(JSON.stringify(content)), errors, warnings };
}

const countsOf = (c: BundleContent) => ({
  items: c.items.length,
  monsters: c.monsters.length,
  dropGroups: Object.keys(c.drop_groups).length,
  levelDrops: c.level_drops.length,
  maps: Object.keys(c.maps ?? {}).length,
  regions: Object.values(c.maps ?? {}).reduce((n, m) => n + m.regions.length, 0),
});

/** Aktif sürümden bu yana ne değişti (item/yaratık vnum'a, grup koda göre). */
export function diffContent(prev: BundleContent | null, next: BundleContent): ReleaseChange[] {
  const out: ReleaseChange[] = [];
  const compare = <T extends { name: string }>(kind: ReleaseChange['kind'], a: Map<string, T>, b: Map<string, T>) => {
    for (const [key, v] of b) {
      const old = a.get(key);
      if (!old) out.push({ kind, key, name: v.name, change: 'added' });
      else if (JSON.stringify(old) !== JSON.stringify(v)) out.push({ kind, key, name: v.name, change: 'changed' });
    }
    for (const [key, v] of a) if (!b.has(key)) out.push({ kind, key, name: v.name, change: 'removed' });
  };
  const byVnum = <T extends { vnum: number }>(list: T[] = []) => new Map(list.map((x) => [String(x.vnum), x]));
  compare('monster', byVnum(prev?.monsters), byVnum(next.monsters));
  compare('item', byVnum(prev?.items), byVnum(next.items));
  compare('drop_group', new Map(Object.entries(prev?.drop_groups ?? {})), new Map(Object.entries(next.drop_groups)));
  compare('map', new Map(Object.entries(prev?.maps ?? {})), new Map(Object.entries(next.maps)));
  if (JSON.stringify(prev?.level_drops ?? []) !== JSON.stringify(next.level_drops)) {
    out.push({ kind: 'level_drops', key: 'level_drops', name: 'Genel drop tablosu', change: prev ? 'changed' : 'added' });
  }
  if (prev && JSON.stringify(prev.config) !== JSON.stringify(next.config)) out.push({ kind: 'config', key: 'config', name: 'Oyun ayarları', change: 'changed' });
  return out;
}

type ReleaseRow = { id: number; version: number; sha256: string; bundle: string; notes: string; created_at: string; is_active: number };

const activeRow = (db: DB) => db.prepare('SELECT * FROM data_releases WHERE is_active = 1').get() as ReleaseRow | undefined;

function summary(r: ReleaseRow): ReleaseSummary {
  return { id: r.id, version: r.version, sha256: r.sha256, notes: r.notes, createdAt: r.created_at, isActive: r.is_active === 1, counts: countsOf(JSON.parse(r.bundle)) };
}

function activate(db: DB, id: number) {
  db.transaction(() => {
    db.prepare('UPDATE data_releases SET is_active = 0 WHERE is_active = 1').run();
    db.prepare('UPDATE data_releases SET is_active = 1 WHERE id = ?').run(id);
  })();
}

const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Geçersiz id.');
  return id;
};

/** Panel (giriş gerekli): yayın önizleme, yayınlama, sürüm listesi ve geri alma. */
export function releasesRouter(db: DB, uploadDir: string): Router {
  const router = express.Router();

  router.get('/game-config', (_req, res) => res.json(getGameConfig(db)));

  router.put('/game-config', (req, res) => {
    const patch = configSchema.parse(req.body);
    const up = db.prepare('INSERT INTO game_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const [k, v] of Object.entries(patch)) up.run(k, JSON.stringify(v));
    logActivity(db, 'update', 'system', null, `Oyun ayarları değişti: ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    res.json(getGameConfig(db));
  });

  router.get('/releases', (_req, res) => {
    res.json((db.prepare('SELECT * FROM data_releases ORDER BY version DESC').all() as ReleaseRow[]).map(summary));
  });

  router.get('/releases/preview', (_req, res) => {
    const built = buildContent(db, uploadDir);
    const active = activeRow(db);
    const preview: ReleasePreview = {
      errors: built.errors,
      warnings: built.warnings,
      sha256: built.sha256,
      counts: countsOf(built.content),
      activeVersion: active?.version ?? null,
      changes: diffContent(active ? JSON.parse(active.bundle) : null, built.content),
    };
    res.json(preview);
  });

  router.post('/releases', (req, res) => {
    const { notes } = z.object({ notes: z.string().trim().max(1000).default('') }).parse(req.body);
    const built = buildContent(db, uploadDir);
    if (built.errors.length) throw new HttpError(400, `Yayın engellendi: ${built.errors[0]}`, { errors: built.errors });
    const active = activeRow(db);
    if (active?.sha256 === built.sha256) throw new HttpError(409, `Aktif sürümden (v${active.version}) bu yana değişiklik yok.`);
    const { max } = db.prepare('SELECT MAX(version) AS max FROM data_releases').get() as { max: number | null };
    const version = (max ?? 0) + 1;
    const bundle: Bundle = {
      format: BUNDLE_FORMAT,
      format_version: BUNDLE_FORMAT_VERSION,
      version,
      sha256: built.sha256,
      created_at: new Date().toISOString(),
      ...built.content,
    };
    const id = Number(
      db.prepare('INSERT INTO data_releases (version, sha256, bundle, notes) VALUES (?, ?, ?, ?)').run(version, built.sha256, JSON.stringify(bundle), notes).lastInsertRowid,
    );
    activate(db, id);
    logActivity(db, 'create', 'system', id, `Oyun verisi yayınlandı: v${version}${notes ? ` — ${notes}` : ''}`);
    res.status(201).json(summary(db.prepare('SELECT * FROM data_releases WHERE id = ?').get(id) as ReleaseRow));
  });

  router.post('/releases/:id/activate', (req, res) => {
    const id = idParam(req);
    const row = db.prepare('SELECT * FROM data_releases WHERE id = ?').get(id) as ReleaseRow | undefined;
    if (!row) throw new HttpError(404, 'Sürüm bulunamadı.');
    activate(db, id);
    logActivity(db, 'update', 'system', id, `Aktif oyun verisi v${row.version} yapıldı`);
    res.json(summary({ ...row, is_active: 1 }));
  });

  router.get('/releases/:id/bundle', (req, res) => {
    const row = db.prepare('SELECT * FROM data_releases WHERE id = ?').get(idParam(req)) as ReleaseRow | undefined;
    if (!row) throw new HttpError(404, 'Sürüm bulunamadı.');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="panel_bundle_v${row.version}.json"`);
    res.send(row.bundle);
  });

  return router;
}

/**
 * Oyun sunucusu için (panel girişi yok): Authorization: Bearer <GAME_API_TOKEN>.
 * Token ayarlı değilse uç noktalar kapalıdır (503).
 */
export function gameRouter(db: DB, token: string | undefined): Router {
  const router = express.Router();
  const expected = token ? Buffer.from(token) : null;

  router.use((req, _res, next) => {
    if (!expected) throw new HttpError(503, 'Oyun API kapalı: GAME_API_TOKEN ayarlı değil.');
    const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw new HttpError(401, 'Geçersiz oyun API anahtarı.');
    next();
  });

  const pick = (req: Request) => {
    const version = req.query.version === undefined ? null : Number(req.query.version);
    if (version !== null && (!Number.isInteger(version) || version < 1)) throw new HttpError(400, 'Geçersiz sürüm.');
    const row = (version === null ? activeRow(db) : db.prepare('SELECT * FROM data_releases WHERE version = ?').get(version)) as ReleaseRow | undefined;
    if (!row) throw new HttpError(404, version === null ? 'Henüz yayınlanmış oyun verisi yok.' : 'Sürüm bulunamadı.');
    return row;
  };

  router.get('/version', (req, res) => {
    const row = pick(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ version: row.version, sha256: row.sha256 });
  });

  router.get('/bundle', (req, res) => {
    const row = pick(req);
    const etag = `"${row.sha256}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(row.bundle);
  });

  return router;
}
