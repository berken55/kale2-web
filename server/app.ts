import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import {
  CLASSES,
  ICON_EXTENSIONS,
  MAX_ICON_BYTES,
  MAX_MODEL_BYTES,
  MODEL_EXTENSIONS,
} from '../shared/constants.ts';
import type { BonusType, DashboardStats } from '../shared/types.ts';
import { authRouter, requireAuth, type AuthConfig } from './auth.ts';
import { logActivity, type DB } from './db.ts';
import { dropsRouter, dropUsageOfItem } from './drops.ts';
import { HttpError } from './http-error.ts';
import { gameRouter, releasesRouter } from './releases.ts';
import { mapsRouter, spawnUsageOfMonster } from './maps.ts';
import {
  createItem,
  findBonusLimitViolation,
  findMissingBonusTypes,
  getItem,
  getItemRow,
  itemCodeTaken,
  itemToInput,
  listItems,
  nextVnum,
  updateItem,
  vnumTaken,
} from './items.ts';
import { allowedHosts, FetchError, safeFetch } from './importers/fetch.ts';
import { IMPORTERS, importFromUrl, importMonsterFromUrl } from './importers/index.ts';
import { downloadModel, isModelSource, protectedIcon } from './importers/model-service.ts';
import {
  getMonster,
  getMonsterRow,
  insertMonster,
  listMonsters,
  monsterCodeTaken,
  monsterToInput,
  monsterVnumTaken,
  nextMonsterVnum,
  uniqueMonsterCode,
  updateMonster,
} from './monsters.ts';
import { wikiRouter } from './wiki.ts';
import {
  bonusTypeInputSchema,
  formatZodError,
  itemInputSchema,
  monsterInputSchema,
  type ItemInput,
  type MonsterInputParsed,
} from './validation.ts';

export interface AppOptions {
  db: DB;
  uploadDir: string;
  auth: AuthConfig;
  clientDir?: string;
  /** Giriş gerektirmeyen item wiki'si (varsayılan: açık) */
  publicWiki?: boolean;
  importPrivateDir?: string;
  /** Oyun sunucusunun /api/game uç noktaları için anahtar (GAME_API_TOKEN); yoksa kapalı */
  gameToken?: string;
}


const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Geçersiz id.');
  return id;
};

function parseItemInput(db: DB, body: unknown, exceptId?: number): ItemInput {
  const parsed = itemInputSchema.safeParse(body);
  if (!parsed.success) {
    const f = formatZodError(parsed.error);
    throw new HttpError(400, f.error, { issues: f.issues });
  }
  const input = parsed.data;
  if (vnumTaken(db, input.vnum, exceptId)) throw new HttpError(409, `${input.vnum} vnum'u başka bir item tarafından kullanılıyor.`);
  if (itemCodeTaken(db, input.code, exceptId)) throw new HttpError(409, `"${input.code}" oyun kodu başka bir item tarafından kullanılıyor.`);
  const missing = findMissingBonusTypes(db, input.bonuses.map((b) => b.bonusTypeId));
  if (missing.length) throw new HttpError(400, 'Tanımsız bonus tipi seçildi.');
  const violation = findBonusLimitViolation(db, input.bonuses);
  if (violation) throw new HttpError(400, violation);
  return input;
}

function parseMonsterInput(db: DB, body: unknown, exceptId?: number): MonsterInputParsed {
  const parsed = monsterInputSchema.safeParse(body);
  if (!parsed.success) {
    const f = formatZodError(parsed.error);
    throw new HttpError(400, f.error, { issues: f.issues });
  }
  const input = parsed.data;
  if (monsterVnumTaken(db, input.vnum, exceptId)) throw new HttpError(409, `${input.vnum} vnum'u başka bir canavar tarafından kullanılıyor.`);
  if (monsterCodeTaken(db, input.code, exceptId)) throw new HttpError(409, `"${input.code}" oyun kodu başka bir canavar tarafından kullanılıyor.`);
  return input;
}

function mapBonusType(row: Record<string, unknown>): BonusType {
  return {
    id: row.id as number,
    code: row.code as string,
    name: row.name as string,
    unit: row.unit as BonusType['unit'],
    maxValue: row.max_value as number,
    description: row.description as string,
  };
}

export function createApp({ db, uploadDir, auth, clientDir, publicWiki = true, importPrivateDir = `${uploadDir}-private`, gameToken }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  for (const sub of ['models', 'icons']) fs.mkdirSync(path.join(uploadDir, sub), { recursive: true });
  app.use(
    '/uploads',
    express.static(uploadDir, {
      maxAge: '7d',
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  );

  const removeUpload = (rel: string | null) => {
    if (!rel) return;
    const full = path.resolve(uploadDir, rel);
    if (full.startsWith(path.resolve(uploadDir) + path.sep)) fs.rm(full, { force: true }, () => {});
  };

  const uploader = (sub: 'models' | 'icons', exts: readonly string[], maxBytes: number) =>
    multer({
      storage: multer.diskStorage({
        destination: path.join(uploadDir, sub),
        filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
      }),
      limits: { fileSize: maxBytes, files: 1 },
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (exts.includes(ext)) cb(null, true);
        else cb(new HttpError(400, `Desteklenmeyen dosya türü. İzin verilenler: ${exts.join(', ')}`));
      },
    }).single('file');

  const runUpload = (mw: express.RequestHandler) => (req: Request, res: Response) =>
    new Promise<void>((resolve, reject) =>
      mw(req, res, (err?: unknown) => {
        if (err instanceof multer.MulterError) {
          reject(new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Dosya boyutu sınırı aşıldı.' : err.message));
        } else if (err) reject(err);
        else resolve();
      }),
    );

  const uploadModel = runUpload(uploader('models', MODEL_EXTENSIONS, MAX_MODEL_BYTES));
  const uploadIcon = runUpload(uploader('icons', ICON_EXTENSIONS, MAX_ICON_BYTES));

  const api = express.Router();
  api.use('/auth', authRouter(auth));
  api.get('/public/status', (_req, res) => res.json({ enabled: publicWiki }));
  api.use('/public', ...(publicWiki ? [] : [requireAuth(auth)]), wikiRouter(db));
  api.use('/game', gameRouter(db, gameToken));
  api.use(requireAuth(auth));

  // ---- Dashboard ----
  api.get('/dashboard', (_req, res) => {
    const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
    const stats: DashboardStats = {
      totalItems: count('SELECT COUNT(*) AS c FROM items'),
      totalMonsters: count('SELECT COUNT(*) AS c FROM monsters'),
      withModel: count('SELECT COUNT(*) AS c FROM items WHERE model_path IS NOT NULL'),
      withIcon: count('SELECT COUNT(*) AS c FROM items WHERE icon_path IS NOT NULL'),
      bonusTypes: count('SELECT COUNT(*) AS c FROM bonus_types'),
      byType: db.prepare('SELECT type, COUNT(*) AS count FROM items GROUP BY type ORDER BY count DESC').all() as DashboardStats['byType'],
      byRarity: db.prepare('SELECT rarity, COUNT(*) AS count FROM items GROUP BY rarity').all() as DashboardStats['byRarity'],
      recentActivity: (
        db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT 15').all() as Array<Record<string, unknown>>
      ).map((r) => ({
        id: r.id as number,
        action: r.action as DashboardStats['recentActivity'][number]['action'],
        entity: r.entity as DashboardStats['recentActivity'][number]['entity'],
        entityId: r.entity_id as number | null,
        summary: r.summary as string,
        createdAt: r.created_at as string,
      })),
    };
    res.json(stats);
  });

  // ---- Bonus tipleri ----
  api.get('/bonus-types', (_req, res) => {
    const rows = db.prepare('SELECT * FROM bonus_types ORDER BY name COLLATE NOCASE').all() as Array<Record<string, unknown>>;
    const usage = new Map(
      (db.prepare('SELECT bonus_type_id AS id, COUNT(*) AS c FROM item_bonuses GROUP BY bonus_type_id').all() as Array<{
        id: number;
        c: number;
      }>).map((u) => [u.id, u.c]),
    );
    res.json(rows.map((r) => ({ ...mapBonusType(r), usageCount: usage.get(r.id as number) ?? 0 })));
  });

  const parseBonusType = (body: unknown, exceptId?: number) => {
    const parsed = bonusTypeInputSchema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, formatZodError(parsed.error).error);
    const dupe = db.prepare('SELECT id FROM bonus_types WHERE code = ?').get(parsed.data.code) as { id: number } | undefined;
    if (dupe && dupe.id !== exceptId) throw new HttpError(409, `${parsed.data.code} kodu zaten tanımlı.`);
    return parsed.data;
  };

  api.post('/bonus-types', (req, res) => {
    const b = parseBonusType(req.body);
    const info = db
      .prepare('INSERT INTO bonus_types (code, name, unit, max_value, description) VALUES (?, ?, ?, ?, ?)')
      .run(b.code, b.name, b.unit, b.maxValue, b.description);
    const id = Number(info.lastInsertRowid);
    logActivity(db, 'create', 'bonus_type', id, `Bonus tanımlandı: ${b.name}`);
    res.status(201).json(mapBonusType(db.prepare('SELECT * FROM bonus_types WHERE id = ?').get(id) as Record<string, unknown>));
  });

  api.put('/bonus-types/:id', (req, res) => {
    const id = idParam(req);
    if (!db.prepare('SELECT 1 FROM bonus_types WHERE id = ?').get(id)) throw new HttpError(404, 'Bonus bulunamadı.');
    const b = parseBonusType(req.body, id);
    db.prepare('UPDATE bonus_types SET code = ?, name = ?, unit = ?, max_value = ?, description = ? WHERE id = ?').run(
      b.code,
      b.name,
      b.unit,
      b.maxValue,
      b.description,
      id,
    );
    logActivity(db, 'update', 'bonus_type', id, `Bonus güncellendi: ${b.name}`);
    res.json(mapBonusType(db.prepare('SELECT * FROM bonus_types WHERE id = ?').get(id) as Record<string, unknown>));
  });

  api.delete('/bonus-types/:id', (req, res) => {
    const id = idParam(req);
    const row = db.prepare('SELECT name FROM bonus_types WHERE id = ?').get(id) as { name: string } | undefined;
    if (!row) throw new HttpError(404, 'Bonus bulunamadı.');
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM item_bonuses WHERE bonus_type_id = ?').get(id) as { c: number };
    if (c > 0) throw new HttpError(409, `Bu bonus ${c} item tarafından kullanılıyor; önce itemlerden kaldırın.`);
    db.prepare('DELETE FROM bonus_types WHERE id = ?').run(id);
    logActivity(db, 'delete', 'bonus_type', id, `Bonus silindi: ${row.name}`);
    res.status(204).end();
  });

  // ---- Itemler ----
  const listSchema = z.object({
    search: z.string().trim().max(64).optional(),
    type: z.string().max(32).optional(),
    subtype: z.string().max(32).optional(),
    rarity: z.string().max(32).optional(),
    class: z.string().max(32).optional(),
    hasModel: z.enum(['true', 'false']).optional(),
    sort: z.string().max(16).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(25),
  });

  api.get('/items', (req, res) => {
    const q = listSchema.parse(req.query);
    res.json(
      listItems(db, {
        search: q.search || undefined,
        type: q.type || undefined,
        subtype: q.subtype || undefined,
        rarity: q.rarity || undefined,
        cls: q.class || undefined,
        hasModel: q.hasModel === undefined ? undefined : q.hasModel === 'true',
        sort: q.sort,
        page: q.page,
        pageSize: q.pageSize,
      }),
    );
  });

  api.get('/items/next-vnum', (_req, res) => res.json({ vnum: nextVnum(db) }));

  api.get('/items/:id', (req, res) => {
    const item = getItem(db, idParam(req));
    if (!item) throw new HttpError(404, 'Item bulunamadı.');
    res.json(item);
  });

  api.post('/items', (req, res) => {
    const input = parseItemInput(db, req.body);
    const id = createItem(db, input);
    logActivity(db, 'create', 'item', id, `Item oluşturuldu: ${input.name} (#${input.vnum})`);
    res.status(201).json(getItem(db, id));
  });

  api.put('/items/:id', (req, res) => {
    const id = idParam(req);
    if (!getItemRow(db, id)) throw new HttpError(404, 'Item bulunamadı.');
    const input = parseItemInput(db, req.body, id);
    updateItem(db, id, input);
    logActivity(db, 'update', 'item', id, `Item güncellendi: ${input.name} (#${input.vnum})`);
    res.json(getItem(db, id));
  });

  api.post('/items/:id/clone', (req, res) => {
    const source = getItem(db, idParam(req));
    if (!source) throw new HttpError(404, 'Item bulunamadı.');
    const input = { ...itemToInput(source), vnum: nextVnum(db), code: null, name: `${source.name} (kopya)`.slice(0, 64) };
    const id = createItem(db, input);
    logActivity(db, 'create', 'item', id, `Item kopyalandı: ${source.name} → #${input.vnum}`);
    res.status(201).json(getItem(db, id));
  });

  api.delete('/items/:id', (req, res) => {
    const id = idParam(req);
    const row = getItemRow(db, id);
    if (!row) throw new HttpError(404, 'Item bulunamadı.');
    const usage = dropUsageOfItem(db, row.vnum);
    if (usage) throw new HttpError(409, `Bu item ${usage} drop satırında kullanılıyor; önce droplardan kaldırın.`);
    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    removeUpload(row.icon_path);
    removeUpload(row.model_path);
    logActivity(db, 'delete', 'item', id, `Item silindi: ${row.name} (#${row.vnum})`);
    res.status(204).end();
  });

  // ---- Medya (ikon / 3D model) ----
  // Itemler ve canavarlar aynı sütun adlarını (icon_path, model_path, model_file_name) kullanır.
  type MediaRow = { name: string; vnum: number; icon_path: string | null; model_path: string | null };
  interface MediaEntity {
    route: 'items' | 'monsters';
    table: 'items' | 'monsters';
    entity: 'item' | 'monster';
    notFound: string;
    getRow: (id: number) => MediaRow | undefined;
    getDto: (id: number) => object | null;
  }
  const ITEM_MEDIA: MediaEntity = {
    route: 'items',
    table: 'items',
    entity: 'item',
    notFound: 'Item bulunamadı.',
    getRow: (id) => getItemRow(db, id),
    getDto: (id) => getItem(db, id),
  };
  const MONSTER_MEDIA: MediaEntity = {
    route: 'monsters',
    table: 'monsters',
    entity: 'monster',
    notFound: 'Canavar bulunamadı.',
    getRow: (id) => getMonsterRow(db, id),
    getDto: (id) => getMonster(db, id),
  };

  /** Yüklenen dosyayı kayda bağlar ve eski dosyayı siler. */
  const attachMedia = (e: MediaEntity, id: number, kind: 'icon' | 'model', rel: string, originalName: string) => {
    const row = e.getRow(id)!;
    if (kind === 'icon') {
      db.prepare(`UPDATE ${e.table} SET icon_path = ?, updated_at = datetime('now') WHERE id = ?`).run(rel, id);
      removeUpload(row.icon_path);
    } else {
      db.prepare(`UPDATE ${e.table} SET model_path = ?, model_file_name = ?, updated_at = datetime('now') WHERE id = ?`).run(
        rel,
        originalName.slice(0, 200),
        id,
      );
      removeUpload(row.model_path);
    }
    logActivity(db, 'upload', e.entity, id, `${kind === 'icon' ? 'İkon' : '3D model'} yüklendi: ${row.name} (#${row.vnum})`);
  };

  const mediaRoutes = (e: MediaEntity, kind: 'icon' | 'model') => {
    const sub = kind === 'icon' ? 'icons' : 'models';
    const run = kind === 'icon' ? uploadIcon : uploadModel;
    const label = kind === 'icon' ? 'İkon' : '3D model';

    api.post(`/${e.route}/:id/${kind}`, (req, res, next) => handleUpload(req, res).catch(next));

    const handleUpload = async (req: Request, res: Response) => {
      const id = idParam(req);
      if (!e.getRow(id)) throw new HttpError(404, e.notFound);
      await run(req, res);
      if (!req.file) throw new HttpError(400, 'Dosya gönderilmedi.');
      attachMedia(e, id, kind, `${sub}/${req.file.filename}`, path.basename(req.file.originalname));
      res.json(e.getDto(id));
    };

    api.delete(`/${e.route}/:id/${kind}`, (req, res) => {
      const id = idParam(req);
      const row = e.getRow(id);
      if (!row) throw new HttpError(404, e.notFound);
      if (kind === 'icon') {
        db.prepare(`UPDATE ${e.table} SET icon_path = NULL, updated_at = datetime('now') WHERE id = ?`).run(id);
        removeUpload(row.icon_path);
      } else {
        db.prepare(
          `UPDATE ${e.table} SET model_path = NULL, model_file_name = NULL, updated_at = datetime('now') WHERE id = ?`,
        ).run(id);
        removeUpload(row.model_path);
      }
      logActivity(db, 'delete', e.entity, id, `${label} kaldırıldı: ${row.name} (#${row.vnum})`);
      res.json(e.getDto(id));
    });
  };
  for (const e of [ITEM_MEDIA, MONSTER_MEDIA]) {
    mediaRoutes(e, 'icon');
    mediaRoutes(e, 'model');
  }

  // ---- Harici siteden içe aktarma ----
  fs.mkdirSync(importPrivateDir, { recursive: true, mode: 0o700 });
  const cookieFile = path.join(importPrivateDir, 'metin2alerts-cookies.txt');
  const currentCookie = () => fs.existsSync(cookieFile) ? cookieFile : undefined;
  const cookieUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024, files: 1 } }).single('file');
  api.post('/import/cookies', (req, res, next) => {
    (async () => {
      await runUpload(cookieUpload)(req, res);
      const text = req.file?.buffer.toString('utf8');
      if (!text || !text.split(/\r?\n/).some((line) => /^(?:#HttpOnly_)?\.?metin2alerts\.com\t/.test(line) && line.split('\t').length === 7)) {
        throw new HttpError(400, 'Metin2Alerts için Netscape biçiminde cookies.txt yükleyin.');
      }
      const temp = path.join(importPrivateDir, `${crypto.randomUUID()}.tmp`);
      try {
        await fs.promises.writeFile(temp, text, { mode: 0o600 });
        await fs.promises.rename(temp, cookieFile);
      } finally { await fs.promises.rm(temp, { force: true }); }
      res.json({ cookieConfigured: true });
    })().catch(next);
  });
  api.delete('/import/cookies', (_req, res) => {
    fs.rmSync(cookieFile, { force: true });
    res.status(204).end();
  });
  api.get('/import/sources', (_req, res) => {
    res.json({ sources: IMPORTERS.map((i) => ({ id: i.id, name: i.name, example: i.example })), allowedHosts: allowedHosts(), cookieConfigured: !!currentCookie() });
  });

  const importUrlSchema = z.object({
    url: z.string().min(1).max(2000),
    vnum: z.number().int().min(1).max(2_000_000_000).optional(),
    type: z.string().max(32).optional(),
    subtype: z.string().max(32).optional(),
  });

  api.post('/import/url', (req, res, next) => {
    const body = importUrlSchema.parse(req.body);
    const override = body.type && body.subtype ? { type: body.type, subtype: body.subtype } : undefined;
    importFromUrl(db, body.url, override, { cookieFile: currentCookie(), vnum: body.vnum })
      .then((draft) => res.json(draft))
      .catch(next);
  });

  const MEDIA_TYPES: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'model/gltf-binary': '.glb',
    'model/gltf+json': '.gltf',
  };

  /** Kaynak sitedeki ikon veya 3D modeli indirip kayda bağlar. */
  const remoteMedia = (e: MediaEntity) =>
    api.post(`/${e.route}/:id/remote-media`, (req, res, next) => {
      const id = idParam(req);
      if (!e.getRow(id)) throw new HttpError(404, e.notFound);
      const { kind, url } = z.object({ kind: z.enum(['icon', 'model']), url: z.string().url().max(2000) }).parse(req.body);
      const exts: readonly string[] = kind === 'icon' ? ICON_EXTENSIONS : MODEL_EXTENSIONS;
      (async () => {
        if (kind === 'model' && isModelSource(url)) {
          const model = await downloadModel(url, currentCookie());
          const rel = `models/${crypto.randomUUID()}.glb`;
          await fs.promises.writeFile(path.join(uploadDir, rel), model.data);
          attachMedia(e, id, kind, rel, model.filename);
          res.json({ ...e.getDto(id), importWarnings: model.warnings });
          return;
        }
        const file = await safeFetch(url, { maxBytes: kind === 'icon' ? MAX_ICON_BYTES : MAX_MODEL_BYTES }).catch((error) => {
          if (kind !== 'icon' || !(error instanceof FetchError) || error.status !== 502) throw error;
          return protectedIcon(url, currentCookie());
        });
        const urlExt = path.extname(new URL(file.url).pathname).toLowerCase();
        const ext = exts.includes(urlExt) ? urlExt : MEDIA_TYPES[file.contentType.split(';')[0].trim().toLowerCase()];
        if (!ext || !exts.includes(ext)) throw new HttpError(400, `Kaynaktaki dosya türü desteklenmiyor (${urlExt || file.contentType || 'bilinmiyor'}).`);
        const rel = `${kind === 'icon' ? 'icons' : 'models'}/${crypto.randomUUID()}${ext}`;
        await fs.promises.writeFile(path.join(uploadDir, rel), file.body);
        attachMedia(e, id, kind, rel, path.basename(new URL(file.url).pathname) || `model${ext}`);
        res.json(e.getDto(id));
      })().catch(next);
    });
  remoteMedia(ITEM_MEDIA);
  remoteMedia(MONSTER_MEDIA);

  // ---- Canavarlar ----
  const monsterListSchema = z.object({
    search: z.string().trim().max(64).optional(),
    rank: z.string().max(16).optional(),
    race: z.string().max(16).optional(),
    levelMin: z.coerce.number().int().min(0).max(250).optional(),
    levelMax: z.coerce.number().int().min(0).max(250).optional(),
    hasModel: z.enum(['true', 'false']).optional(),
    sort: z.string().max(16).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(25),
  });

  api.get('/monsters', (req, res) => {
    const q = monsterListSchema.parse(req.query);
    res.json(
      listMonsters(db, {
        search: q.search || undefined,
        rank: q.rank || undefined,
        race: q.race || undefined,
        levelMin: q.levelMin,
        levelMax: q.levelMax,
        hasModel: q.hasModel === undefined ? undefined : q.hasModel === 'true',
        sort: q.sort,
        page: q.page,
        pageSize: q.pageSize,
      }),
    );
  });

  api.get('/monsters/next-vnum', (_req, res) => res.json({ vnum: nextMonsterVnum(db) }));

  api.post('/monsters/import', (req, res, next) => {
    const body = z
      .object({ url: z.string().min(1).max(2000), vnum: z.number().int().min(1).max(2_000_000_000).optional() })
      .parse(req.body);
    importMonsterFromUrl(db, body.url, { cookieFile: currentCookie(), vnum: body.vnum })
      .then((draft) => res.json(draft))
      .catch(next);
  });

  api.get('/monsters/:id', (req, res) => {
    const monster = getMonster(db, idParam(req));
    if (!monster) throw new HttpError(404, 'Canavar bulunamadı.');
    res.json(monster);
  });

  api.post('/monsters', (req, res) => {
    const input = parseMonsterInput(db, req.body);
    const id = insertMonster(db, input);
    logActivity(db, 'create', 'monster', id, `Canavar oluşturuldu: ${input.name} (#${input.vnum})`);
    res.status(201).json(getMonster(db, id));
  });

  api.put('/monsters/:id', (req, res) => {
    const id = idParam(req);
    if (!getMonsterRow(db, id)) throw new HttpError(404, 'Canavar bulunamadı.');
    const input = parseMonsterInput(db, req.body, id);
    updateMonster(db, id, input);
    logActivity(db, 'update', 'monster', id, `Canavar güncellendi: ${input.name} (#${input.vnum})`);
    res.json(getMonster(db, id));
  });

  api.post('/monsters/:id/clone', (req, res) => {
    const source = getMonster(db, idParam(req));
    if (!source) throw new HttpError(404, 'Canavar bulunamadı.');
    const vnum = nextMonsterVnum(db);
    const input = {
      ...monsterToInput(source),
      vnum,
      code: uniqueMonsterCode(db, `${source.code}_kopya`.slice(0, 40), vnum),
      name: `${source.name} (kopya)`.slice(0, 64),
    };
    const id = insertMonster(db, input);
    logActivity(db, 'create', 'monster', id, `Canavar kopyalandı: ${source.name} → #${vnum}`);
    res.status(201).json(getMonster(db, id));
  });

  api.delete('/monsters/:id', (req, res) => {
    const id = idParam(req);
    const row = getMonsterRow(db, id);
    if (!row) throw new HttpError(404, 'Canavar bulunamadı.');
    const spawns = spawnUsageOfMonster(db, id);
    if (spawns) throw new HttpError(409, `Bu canavar ${spawns} spawn satırında kullanılıyor; önce haritalardan kaldırın.`);
    db.prepare('DELETE FROM monsters WHERE id = ?').run(id);
    removeUpload(row.icon_path);
    removeUpload(row.model_path);
    logActivity(db, 'delete', 'monster', id, `Canavar silindi: ${row.name} (#${row.vnum})`);
    res.status(204).end();
  });

  // ---- Droplar ----
  api.use(dropsRouter(db));
  api.use(releasesRouter(db, uploadDir));
  api.use(mapsRouter(db, uploadDir));

  // ---- Dışa / içe aktarma ----
  const allItems = () =>
    (db.prepare('SELECT id FROM items ORDER BY vnum').all() as Array<{ id: number }>).map((r) => getItem(db, r.id)!);

  api.get('/export/json', (_req, res) => {
    const bonusTypes = (db.prepare('SELECT * FROM bonus_types ORDER BY id').all() as Array<Record<string, unknown>>).map(
      mapBonusType,
    );
    const codeById = new Map(bonusTypes.map((b) => [b.id, b.code]));
    const items = allItems().map((item) => ({
      ...itemToInput(item),
      bonuses: item.bonuses.map((b) => ({ code: codeById.get(b.bonusTypeId)!, value: b.value })),
    }));
    res.setHeader('Content-Disposition', 'attachment; filename="kale2-items.json"');
    res.json({
      format: 'kale2-items',
      version: 1,
      exportedAt: new Date().toISOString(),
      bonusTypes: bonusTypes.map(({ id: _id, ...rest }) => rest),
      items,
    });
  });

  api.get('/export/item_proto.txt', (_req, res) => {
    const codeById = new Map(
      (db.prepare('SELECT id, code FROM bonus_types').all() as Array<{ id: number; code: string }>).map((b) => [b.id, b.code]),
    );
    const allClasses = CLASSES.map((c) => c.value);
    const header = [
      'Vnum', 'Name', 'Type', 'SubType', 'Rarity', 'LimitLevel', 'AntiFlags', 'Gold', 'ShopBuyPrice', 'Stack',
      'MinAtk', 'MaxAtk', 'MinMAtk', 'MaxMAtk', 'Def', 'AtkSpeed',
      ...Array.from({ length: 6 }, (_, i) => [`ApplyType${i}`, `ApplyValue${i}`]).flat(),
    ];
    const lines = [header.join('\t')];
    for (const item of allItems()) {
      // item_proto ANTI_* bayrakları: sınıf kısıtı varsa, izin verilmeyen sınıflar işaretlenir
      const anti = [
        ...(item.classes.length ? allClasses.filter((c) => !item.classes.includes(c)).map((c) => `ANTI_${c}`) : []),
        ...(item.gender === 'MALE' ? ['ANTI_FEMALE'] : item.gender === 'FEMALE' ? ['ANTI_MALE'] : []),
        ...(item.tradable ? [] : ['ANTI_GIVE', 'ANTI_SELL']),
      ];
      const applies = Array.from({ length: 6 }, (_, i) => {
        const b = item.bonuses[i];
        return b ? [`APPLY_${codeById.get(b.bonusTypeId)}`, String(b.value)] : ['APPLY_NONE', '0'];
      }).flat();
      lines.push(
        [
          item.vnum,
          `"${item.name.replace(/"/g, "'")}"`,
          `ITEM_${item.type}`,
          `${item.type}_${item.subtype}`,
          item.rarity,
          item.levelRequired,
          anti.length ? `"${anti.join(' | ')}"` : 'NONE',
          item.sellPrice,
          item.buyPrice,
          item.stackSize,
          item.stats.minAttack,
          item.stats.maxAttack,
          item.stats.minMagicAttack,
          item.stats.maxMagicAttack,
          item.stats.defense,
          item.stats.attackSpeed,
          ...applies,
        ].join('\t'),
      );
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="item_proto.txt"');
    res.send(lines.join('\n') + '\n');
  });

  const importSchema = z.object({
    format: z.literal('kale2-items'),
    version: z.literal(1),
    bonusTypes: z.array(bonusTypeInputSchema).default([]),
    items: z.array(z.object({ bonuses: z.array(z.object({ code: z.string(), value: z.number() })).default([]) }).passthrough()),
  });

  api.post('/import/json', (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'Geçersiz dosya: kale2-items formatında bir JSON bekleniyor.');
    const { bonusTypes, items } = parsed.data;
    const result = { bonusTypesCreated: 0, itemsCreated: 0, itemsUpdated: 0 };

    db.transaction(() => {
      const findCode = db.prepare('SELECT id FROM bonus_types WHERE code = ?');
      for (const b of bonusTypes) {
        if (findCode.get(b.code)) continue;
        db.prepare('INSERT INTO bonus_types (code, name, unit, max_value, description) VALUES (?, ?, ?, ?, ?)').run(
          b.code,
          b.name,
          b.unit,
          b.maxValue,
          b.description,
        );
        result.bonusTypesCreated++;
      }
      items.forEach((raw, index) => {
        const bonuses = raw.bonuses.map((b) => {
          const row = findCode.get(b.code) as { id: number } | undefined;
          if (!row) throw new HttpError(400, `${index + 1}. item: tanımsız bonus kodu "${b.code}".`);
          return { bonusTypeId: row.id, value: b.value };
        });
        const existing = db.prepare('SELECT id FROM items WHERE vnum = ?').get((raw as { vnum?: number }).vnum) as
          | { id: number }
          | undefined;
        let input: ItemInput;
        try {
          input = parseItemInput(db, { ...raw, bonuses }, existing?.id);
        } catch (e) {
          if (e instanceof HttpError) throw new HttpError(e.status, `${index + 1}. item: ${e.message}`);
          throw e;
        }
        if (existing) {
          updateItem(db, existing.id, input);
          result.itemsUpdated++;
        } else {
          createItem(db, input);
          result.itemsCreated++;
        }
      });
      logActivity(
        db,
        'import',
        'system',
        null,
        `İçe aktarma: ${result.itemsCreated} yeni, ${result.itemsUpdated} güncellenen item, ${result.bonusTypesCreated} yeni bonus`,
      );
    })();
    res.json(result);
  });

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Bulunamadı.' }));

  if (clientDir && fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof FetchError) return res.status(err.status).json({ error: err.message });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    if (err instanceof z.ZodError) return res.status(400).json(formatZodError(err));
    if ((err as { type?: string }).type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz JSON.' });
    if ((err as { type?: string }).type === 'entity.too.large') return res.status(413).json({ error: 'İstek çok büyük.' });
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  });

  return app;
}
