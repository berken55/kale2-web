import { ITEM_SUBTYPES, MAX_UPGRADE_LEVEL, type ItemType } from '../../shared/constants.ts';
import type { ImportDraft, ItemUpgrade, MonsterImportDraft } from '../../shared/types.ts';
import { convertLegacyMonster } from '../monster-convert.ts';
import { uniqueMonsterCode } from '../monsters.ts';
import type { DB } from '../db.ts';
import { FetchError, isAllowedUrl, safeFetch } from './fetch.ts';
import { metin2alerts } from './metin2alerts.ts';
import { m2icondb } from './m2icondb.ts';
import { monsters } from './monsters.ts';
import { protectedPage, runWorker } from './model-service.ts';
import type { RawItem, SiteImporter } from './types.ts';

export const IMPORTERS: SiteImporter[] = [metin2alerts, m2icondb, monsters];

export function findImporter(url: string) {
  try {
    return IMPORTERS.find((i) => i.matches(url)) ?? null;
  } catch {
    return null;
  }
}

// ---- Tip / alt tip tahmini ----
// Önce kategori metni (ekmek kırıntısı, kategori bağlantıları), sonra item adı denenir.
const TYPE_RULES: Array<[RegExp, ItemType, string]> = [
  [/two[- ]?hand|glaive|halberd|spear|scythe|çift el/i, 'WEAPON', 'TWO_HANDED'],
  [/dagger|knife|hançer/i, 'WEAPON', 'DAGGER'],
  [/\bbows?\b|\byay\b/i, 'WEAPON', 'BOW'],
  [/\barrows?\b|\bok\b/i, 'WEAPON', 'ARROW'],
  [/\bbells?\b|\bçan\b/i, 'WEAPON', 'BELL'],
  [/\bfans?\b|yelpaze/i, 'WEAPON', 'FAN'],
  [/\bclaws?\b|pençe/i, 'WEAPON', 'CLAW'],
  [/swords?|blade|sabre|saber|kılıç/i, 'WEAPON', 'SWORD'],
  [/helmets?|\bhat\b|\bcap\b|hood|kask|başlık/i, 'ARMOR', 'HEAD'],
  [/shields?|kalkan/i, 'ARMOR', 'SHIELD'],
  [/bracelets?|bangle|bilezik/i, 'ARMOR', 'WRIST'],
  [/shoes|boots|ayakkabı/i, 'ARMOR', 'FOOTS'],
  [/necklaces?|amulet|kolye/i, 'ARMOR', 'NECK'],
  [/earrings?|küpe/i, 'ARMOR', 'EAR'],
  [/\bbelts?\b|kemer/i, 'BELT', 'BELT'],
  [/armou?rs?|plate|\bmail\b|robe|\bsuit\b|zırh/i, 'ARMOR', 'BODY'],
];

export function guessType(name: string, categoryText = ''): { type: ItemType; subtype: string } | null {
  for (const source of [categoryText, name]) {
    for (const [re, type, subtype] of TYPE_RULES) if (re.test(source)) return { type, subtype };
  }
  return null;
}

// ---- Bonus eşleştirme ----
// Metin2 İngilizce bonus adlarının panel kodlarına karşılıkları.
const BONUS_ALIASES: Array<[RegExp, string]> = [
  [/^max\.? ?hp|^maximum hp/i, 'MAX_HP'],
  [/^max\.? ?sp|^maximum sp/i, 'MAX_SP'],
  [/^vitality|^vit\b/i, 'CON'],
  [/^intelligence|^int\b/i, 'INT'],
  [/^strength|^str\b/i, 'STR'],
  [/^dexterity|^dex\b/i, 'DEX'],
  [/movement speed|moving speed/i, 'MOV_SPEED'],
  [/casting speed|spell speed/i, 'CAST_SPEED'],
  [/attack speed/i, 'ATT_SPEED'],
  [/hp regen|hp recovery/i, 'HP_REGEN'],
  [/critical/i, 'CRITICAL_PCT'],
  [/piercing|penetrat/i, 'PENETRATE_PCT'],
  [/half[- ]?human/i, 'ATTBONUS_HUMAN'],
  [/against animals/i, 'ATTBONUS_ANIMAL'],
  [/against orcs?/i, 'ATTBONUS_ORC'],
  [/against (the )?undead/i, 'ATTBONUS_UNDEAD'],
  [/against (devils?|demons?)/i, 'ATTBONUS_DEVIL'],
  [/against monsters?/i, 'ATTBONUS_MONSTER'],
  [/absorbed by hp|steal hp|hp absorb/i, 'STEAL_HP'],
  [/poison/i, 'POISON_PCT'],
  [/faint|stun/i, 'STUN_PCT'],
  [/slow/i, 'SLOW_PCT'],
  [/block/i, 'BLOCK'],
  [/avoid(ing)? arrows|dodge/i, 'DODGE'],
  [/sword (defen[cs]e|resist)/i, 'RESIST_SWORD'],
  [/two[- ]?hand(ed)? (defen[cs]e|resist)/i, 'RESIST_TWOHAND'],
  [/dagger (defen[cs]e|resist)/i, 'RESIST_DAGGER'],
  [/bell (defen[cs]e|resist)/i, 'RESIST_BELL'],
  [/fan (defen[cs]e|resist)/i, 'RESIST_FAN'],
  [/arrow (defen[cs]e|resist)/i, 'RESIST_BOW'],
  [/magic (defen[cs]e|resist)/i, 'RESIST_MAGIC'],
  [/reflect/i, 'REFLECT_MELEE'],
  [/exp(erience)?/i, 'EXP_DOUBLE_BONUS'],
  [/yang/i, 'GOLD_DOUBLE_BONUS'],
  [/drop/i, 'ITEM_DROP_BONUS'],
];

const normalize = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü]+/g, ' ')
    .trim();

function resolveBonus(db: DB, label: string): { id: number; maxValue: number; name: string } | null {
  const all = db.prepare('SELECT id, code, name, max_value FROM bonus_types').all() as Array<{
    id: number;
    code: string;
    name: string;
    max_value: number;
  }>;
  const byName = all.find((b) => normalize(b.name) === normalize(label) || b.code === label.toUpperCase());
  const code = BONUS_ALIASES.find(([re]) => re.test(label))?.[1];
  const hit = byName ?? (code ? all.find((b) => b.code === code) : undefined);
  return hit ? { id: hit.id, maxValue: hit.max_value, name: hit.name } : null;
}

// ---- Taslak oluşturma ----
const FIELD_LABELS: Record<string, string> = {
  vnum: 'Vnum',
  name: 'İsim',
  levelRequired: 'Seviye',
  classes: 'Sınıflar',
  stats: 'Güç değerleri',
  upgrades: 'Yükseltme tablosu',
  bonuses: 'Bonuslar',
};

export function buildDraft(db: DB, raw: RawItem, url: string, importer: SiteImporter, typeOverride?: { type: string; subtype: string }): ImportDraft {
  const warnings: string[] = [...(raw.warnings ?? [])];
  if (!raw.vnum) throw new FetchError('Sayfadan vnum okunamadı. Item sayfasının linkini verdiğinizden emin olun.');

  const guessed = typeOverride ?? (raw.type && raw.subtype ? { type: raw.type, subtype: raw.subtype } : guessType(raw.name ?? '', raw.categoryText));
  let type: ItemType = 'ETC';
  let subtype = 'NONE';
  if (guessed && ITEM_SUBTYPES[guessed.type as ItemType]?.some((s) => s.value === guessed.subtype)) {
    type = guessed.type as ItemType;
    subtype = guessed.subtype;
  } else {
    warnings.push('Item tipi belirlenemedi; "Diğer" olarak ayarlandı. Lütfen tipi seçin.');
  }

  // Taban değerler: tablodaki +0 satırı varsa o, yoksa sayfadaki değerler
  const levels = raw.levels.filter((l) => l.level <= MAX_UPGRADE_LEVEL).sort((a, b) => a.level - b.level);
  const zero = levels.find((l) => l.level === 0);
  const s = raw.stats;
  const stats = {
    minAttack: zero?.minAttack ?? s.minAttack ?? 0,
    maxAttack: zero?.maxAttack ?? s.maxAttack ?? 0,
    minMagicAttack: zero?.minMagicAttack ?? s.minMagicAttack ?? 0,
    maxMagicAttack: zero?.maxMagicAttack ?? s.maxMagicAttack ?? 0,
    defense: zero?.defense ?? s.defense ?? 0,
    attackSpeed: s.attackSpeed ?? 0,
  };
  if (!zero && levels.length && (s.maxAttack || s.defense)) {
    warnings.push('Yükseltme tablosunda +0 satırı yok; taban değerler sayfadaki değerlerden alındı, kontrol edin.');
  }

  // Panel, seviye artışlarını tabana göre saklar: toplam değer − taban değer
  const upgrades: ItemUpgrade[] = levels.map((l) => ({
    level: l.level,
    attackBonus: Math.max(0, (l.maxAttack ?? stats.maxAttack) - stats.maxAttack),
    magicAttackBonus: Math.max(0, (l.maxMagicAttack ?? stats.maxMagicAttack) - stats.maxMagicAttack),
    defenseBonus: Math.max(0, (l.defense ?? stats.defense) - stats.defense),
    successRate: Math.min(100, Math.max(0, l.successRate ?? (l.level === 0 ? 100 : 0))),
    cost: Math.max(0, l.cost ?? 0),
    materials: l.materials.slice(0, 5).map((m) => ({ vnum: m.vnum, count: Math.max(1, Math.min(1000, m.count)) })),
  }));
  if (levels.some((l) => l.materials.length > 5)) warnings.push('Bazı seviyelerde 5\'ten fazla malzeme vardı; ilk 5 tanesi alındı.');

  const bonuses: ImportDraft['item']['bonuses'] = [];
  const unresolvedBonuses: ImportDraft['unresolvedBonuses'] = [];
  for (const b of raw.bonuses) {
    const hit = resolveBonus(db, b.label);
    if (!hit) {
      unresolvedBonuses.push(b);
      continue;
    }
    if (bonuses.some((x) => x.bonusTypeId === hit.id) || bonuses.length >= 10) continue;
    if (hit.maxValue > 0 && b.value > hit.maxValue) {
      warnings.push(`"${hit.name}" değeri (${b.value}) paneldeki üst sınırı (${hit.maxValue}) aşıyor; kaydetmeden önce düzeltin veya sınırı artırın.`);
    }
    bonuses.push({ bonusTypeId: hit.id, value: b.value });
  }

  const materialVnums = [...new Map(levels.flatMap((l) => l.materials).map((m) => [m.vnum, m])).values()];
  const missingMaterials = materialVnums
    .filter((m) => !db.prepare('SELECT 1 FROM items WHERE vnum = ?').get(m.vnum))
    .map((m) => ({ vnum: m.vnum, name: m.name, url: m.url && isAllowedUrl(m.url) ? m.url : null }));

  const existing = db.prepare('SELECT id FROM items WHERE vnum = ?').get(raw.vnum) as { id: number } | undefined;
  const missing = Object.keys(FIELD_LABELS).filter((f) => !raw.found.includes(f));
  if (missing.length) warnings.push(`Sayfadan okunamayan alanlar: ${missing.map((f) => FIELD_LABELS[f]).join(', ')}.`);

  const safeAsset = (u?: string | null) => (u && isAllowedUrl(u) ? u : null);
  if (raw.iconUrl && !safeAsset(raw.iconUrl)) warnings.push('İkon izin verilmeyen bir adreste; indirilemiyor (IMPORT_ALLOWED_HOSTS).');
  if (raw.modelUrl && !safeAsset(raw.modelUrl)) warnings.push('3D model izin verilmeyen bir adreste; indirilemiyor (IMPORT_ALLOWED_HOSTS).');

  return {
    source: { url, importer: importer.id, importerName: importer.name },
    item: {
      vnum: raw.vnum,
      name: (raw.name || `Item ${raw.vnum}`).slice(0, 64),
      type,
      subtype,
      rarity: 'COMMON',
      levelRequired: Math.min(250, raw.levelRequired ?? 0),
      classes: raw.classes ?? [],
      gender: 'ANY',
      buyPrice: 0,
      sellPrice: raw.sellPrice ?? 0,
      stackSize: 1,
      tradable: true,
      description: '',
      stats,
      bonuses,
      upgrades,
      sourceUrl: url,
    },
    assets: { iconUrl: safeAsset(raw.iconUrl), modelUrl: safeAsset(raw.modelUrl) },
    existingItemId: existing?.id ?? null,
    unresolvedBonuses,
    missingMaterials,
    found: raw.found,
    warnings,
  };
}

type ImportOptions = { cookieFile?: string; vnum?: number };

/** Linki doğrular, sayfayı indirir ve sitenin ham verisini döndürür. */
async function fetchRaw(rawUrl: string, options: ImportOptions): Promise<{ url: string; importer: SiteImporter; raw: RawItem }> {
  let url: string;
  try {
    url = new URL(rawUrl.trim()).toString();
  } catch {
    throw new FetchError('Geçerli bir link girin.');
  }
  const importer = findImporter(url);
  if (!importer) {
    throw new FetchError(`Bu link desteklenmiyor. Desteklenen biçim: ${IMPORTERS.map((i) => i.example).join(', ')}`);
  }
  let raw: RawItem;
  if (isMonsterPage(importer, url)) {
    const record = await runWorker<{ viewerUrl: string; displayName: string; category: string; vnums: Array<{ vnum: number }>; stats: Record<string, unknown> }>({ action: 'monster', url });
    const s = record.stats;
    const extra: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(s)) {
      if (typeof value === 'number' || typeof value === 'string') extra[key] = value;
      else if (Array.isArray(value)) extra[key] = value.join(', ').slice(0, 200);
      else if (value && typeof value === 'object') extra[key] = JSON.stringify(value).slice(0, 200);
    }
    if (typeof s.movSpeed === 'number') extra.movementSpeed = s.movSpeed;
    if (typeof s.atkSpeed === 'number') extra.attackSpeed = s.atkSpeed;
    raw = { vnum: options.vnum ?? record.vnums[0]?.vnum, name: record.displayName, type: 'MONSTER', subtype: /boss/i.test(record.category) ? 'BOSS' : /npc/i.test(record.category) ? 'NPC' : 'MOB',
      levelRequired: Number(s.level ?? 0), stats: { minAttack: Number(s.dmgMin ?? 0), maxAttack: Number(s.dmgMax ?? 0), defense: Number(s.def ?? 0) },
      bonuses: [], levels: [], monsterStats: extra, modelUrl: record.viewerUrl, found: ['vnum', 'name', 'stats', 'levelRequired'] };
  } else if (importer === m2icondb) {
    raw = m2icondb.parse('', url);
    raw.vnum = options.vnum ?? raw.vnum;
    if (raw.vnum) {
      const metadataUrl = `https://metin2alerts.com/en/wiki/${raw.type === 'MONSTER' ? 'mob' : 'item'}/${raw.vnum}`;
      try {
        const html = await protectedPage(metadataUrl, options.cookieFile);
        const metadata = (raw.type === 'MONSTER' ? monsters : metin2alerts).parse(html, metadataUrl);
        raw = { ...metadata, modelUrl: url };
      } catch {
        raw.found = raw.found.filter((f) => f !== 'stats');
      }
    }
  } else {
    let html: string;
    try {
      const page = await safeFetch(url, { maxBytes: 3 * 1024 * 1024, accept: 'text/html' });
      if (!/html/i.test(page.contentType)) throw new FetchError('Kaynak bir HTML sayfası döndürmedi.', 502);
      html = page.body.toString('utf8');
    } catch (error) {
      if (!(error instanceof FetchError) || error.status !== 502) throw error;
      html = await protectedPage(url, options.cookieFile);
    }
    raw = importer.parse(html, url);
    if (!raw.name || !raw.found.includes('name')) throw new FetchError('Sayfa verileri okunamadı. Güncel cookies.txt yükleyip yeniden deneyin.', 502);
  }
  raw.vnum = options.vnum ?? raw.vnum;
  if (!raw.vnum) throw new FetchError('Bu 3D bağlantısında Vnum yok. Vnum alanını doldurup yeniden getirin.');
  if (importer === metin2alerts && !raw.modelUrl && guessType(raw.name ?? '', raw.categoryText)?.type === 'WEAPON') {
    raw.modelUrl = `https://m2icondb.com/item/${raw.vnum}`;
  }
  return { url, importer, raw };
}

const isMonsterPage = (importer: SiteImporter, url: string) => importer === m2icondb && new URL(url).pathname.startsWith('/monster/');

const sourceWarning = (importer: SiteImporter, url: string, raw: RawItem) =>
  isMonsterPage(importer, url)
    ? 'Katalogdaki ilk Vnum kullanıldı. Aynı model birden fazla canavarda kullanılabilir; Vnum ve özellikleri kontrol edin.'
    : importer === m2icondb || raw.modelUrl?.includes('m2icondb.com')
      ? 'Model m2icondb kaynağından alınır. Okunabilen özellikler aynı Vnum için Metin2Alerts verileriyle tamamlanır; sunucunuzun değerleriyle karşılaştırın.'
      : null;

/** Item sayfasının linkinden düzenlenebilir bir item taslağı döndürür. Hiçbir şey kaydedilmez. */
export async function importFromUrl(db: DB, rawUrl: string, typeOverride?: { type: string; subtype: string }, options: ImportOptions = {}): Promise<ImportDraft> {
  const { url, importer, raw } = await fetchRaw(rawUrl, options);
  if (raw.type === 'MONSTER') throw new FetchError('Bu bir canavar sayfası. Canavarlar sayfasındaki "Linkten içe aktar" ile ekleyin.');
  const draft = buildDraft(db, raw, url, importer, typeOverride);
  const warning = sourceWarning(importer, url, raw);
  if (warning) draft.warnings.push(warning);
  return draft;
}

/** Canavar sayfasının linkinden düzenlenebilir bir canavar taslağı döndürür. Hiçbir şey kaydedilmez. */
export async function importMonsterFromUrl(db: DB, rawUrl: string, options: ImportOptions = {}): Promise<MonsterImportDraft> {
  const { url, importer, raw } = await fetchRaw(rawUrl, options);
  if (raw.type !== 'MONSTER') throw new FetchError('Bu bir canavar sayfası değil. Itemler sayfasından içe aktarın.');
  const existing = db.prepare('SELECT id, code FROM monsters WHERE vnum = ?').get(raw.vnum) as { id: number; code: string } | undefined;
  const monster = convertLegacyMonster({
    vnum: raw.vnum!,
    name: raw.name || `Canavar ${raw.vnum}`,
    subtype: raw.subtype ?? 'MOB',
    level: raw.levelRequired ?? 1,
    damageMin: raw.stats.minAttack ?? 0,
    damageMax: raw.stats.maxAttack ?? 0,
    defense: raw.stats.defense ?? 0,
    stats: raw.monsterStats ?? {},
    sourceUrl: url,
  });
  monster.code = existing?.code ?? uniqueMonsterCode(db, monster.code, monster.vnum);
  const warnings = [...(raw.warnings ?? [])];
  if (!raw.monsterStats?.hp) warnings.push('Sayfadan HP okunamadı; kaydetmeden önce girin.');
  const warning = sourceWarning(importer, url, raw);
  if (warning) warnings.push(warning);
  const safeAsset = (u?: string | null) => (u && isAllowedUrl(u) ? u : null);
  return {
    source: { url, importer: importer.id, importerName: importer.name },
    monster,
    assets: { iconUrl: safeAsset(raw.iconUrl), modelUrl: safeAsset(raw.modelUrl) },
    existingMonsterId: existing?.id ?? null,
    warnings,
  };
}
