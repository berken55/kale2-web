/**
 * Ninja gövde zırhları: vnum 11400 … 11490 (+10). Veri Metin2Alerts, 3D m2icondb.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ICON_EXTENSIONS, MAX_ICON_BYTES } from '../shared/constants.ts';
import { openDatabase } from '../server/db.ts';
import { FetchError, safeFetch } from '../server/importers/fetch.ts';
import { importFromUrl } from '../server/importers/index.ts';
import { downloadModel, protectedIcon } from '../server/importers/model-service.ts';
import { createItem, getItemRow, updateItem } from '../server/items.ts';
import type { ItemInput } from '../server/validation.ts';

const VNUM_START = 11400;
const VNUM_END = 11490;
const VNUM_STEP = 10;

const URLS = Array.from({ length: (VNUM_END - VNUM_START) / VNUM_STEP + 1 }, (_, i) => {
  const vnum = VNUM_START + i * VNUM_STEP;
  return `https://metin2alerts.com/wiki/item/${vnum}`;
});

const MEDIA_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const envFile = process.env.ENV_FILE ?? '.env';
try {
  process.loadEnvFile?.(envFile);
} catch {
  /* optional */
}

const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');
const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');
const cookieFile = path.join(dataDir, 'import-private/metin2alerts-cookies.txt');
const cookie = fs.existsSync(cookieFile) ? cookieFile : undefined;

const db = openDatabase(path.join(dataDir, 'kale2.db'));

function fixNinjaBody(input: ItemInput): ItemInput {
  const classes = input.classes.includes('NINJA') ? input.classes : ['NINJA', ...input.classes];
  return { ...input, type: 'ARMOR', subtype: 'BODY', classes };
}

function attachIcon(itemId: number, iconUrl: string) {
  return (async () => {
    const file = await safeFetch(iconUrl, { maxBytes: MAX_ICON_BYTES }).catch((error) => {
      if (!(error instanceof FetchError) || error.status !== 502) throw error;
      return protectedIcon(iconUrl, cookie);
    });
    const urlExt = path.extname(new URL(file.url).pathname).toLowerCase();
    const ext =
      (ICON_EXTENSIONS as readonly string[]).includes(urlExt)
        ? urlExt
        : MEDIA_TYPES[file.contentType.split(';')[0].trim().toLowerCase()];
    if (!ext || !(ICON_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new Error(`İkon türü desteklenmiyor: ${file.contentType}`);
    }
    const rel = `icons/${crypto.randomUUID()}${ext}`;
    await fs.promises.mkdir(path.join(uploadDir, 'icons'), { recursive: true });
    await fs.promises.writeFile(path.join(uploadDir, rel), file.body);
    const row = getItemRow(db, itemId)!;
    if (row.icon_path) {
      try {
        fs.unlinkSync(path.join(uploadDir, row.icon_path));
      } catch {
        /* ignore */
      }
    }
    db.prepare(`UPDATE items SET icon_path = ?, updated_at = datetime('now') WHERE id = ?`).run(rel, itemId);
  })();
}

function attachModel(itemId: number, vnum: number) {
  return (async () => {
    const modelUrl = `https://m2icondb.com/item/${vnum}`;
    const model = await downloadModel(modelUrl, cookie);
    const rel = `models/${crypto.randomUUID()}.glb`;
    await fs.promises.mkdir(path.join(uploadDir, 'models'), { recursive: true });
    await fs.promises.writeFile(path.join(uploadDir, rel), model.data);
    const row = getItemRow(db, itemId)!;
    if (row.model_path) {
      try {
        fs.unlinkSync(path.join(uploadDir, row.model_path));
      } catch {
        /* ignore */
      }
    }
    db.prepare(
      `UPDATE items SET model_path = ?, model_file_name = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(rel, model.filename.slice(0, 200), itemId);
  })();
}

function draftToInput(draft: Awaited<ReturnType<typeof importFromUrl>>): ItemInput {
  const { item } = draft;
  return fixNinjaBody({
    vnum: item.vnum,
    code: item.code ?? null,
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
    sourceUrl: item.sourceUrl,
  });
}

for (const url of URLS) {
  try {
    console.log('Import', url);
    const draft = await importFromUrl(db, url, undefined, { cookieFile: cookie });
    const input = draftToInput(draft);
    const id = draft.existingItemId ?? createItem(db, input);
    if (draft.existingItemId) updateItem(db, id, input);
    if (draft.assets.iconUrl) await attachIcon(id, draft.assets.iconUrl);
    try {
      await attachModel(id, input.vnum);
    } catch (error) {
      console.warn('NO_MODEL', input.vnum, error instanceof Error ? error.message : error);
    }
    console.log('OK', input.vnum, input.name, 'lv', input.levelRequired);
  } catch (error) {
    console.error('FAIL', url, error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

console.log(`Done: ${URLS.length} ninja body armors (${VNUM_START}–${VNUM_END})`);
db.close();
