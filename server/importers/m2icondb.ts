import type { RawItem, SiteImporter } from './types.ts';

const SUBTYPES: Record<string, string> = { WEAPON_SWORD: 'SWORD', WEAPON_TWO_HANDED: 'TWO_HANDED', WEAPON_DAGGER: 'DAGGER', WEAPON_BOW: 'BOW', WEAPON_BELL: 'BELL', WEAPON_FAN: 'FAN', WEAPON_CLAW: 'CLAW', ARMOR_BODY: 'BODY', ARMOR_HEAD: 'HEAD', ARMOR_SHIELD: 'SHIELD', ARMOR_WRIST: 'WRIST', ARMOR_FOOTS: 'FOOTS', ARMOR_NECK: 'NECK', ARMOR_EAR: 'EAR', COSTUME_BODY: 'BODY', COSTUME_HAIR: 'HAIR', COSTUME_WEAPON: 'WEAPON', COSTUME_ACCE: 'ACCE' };
const CLASSES: Record<string, string> = { warrior: 'WARRIOR', assassin: 'NINJA', sura: 'SURA', shaman: 'SHAMAN', wolfman: 'LYCAN' };

/** m2icondb katalog kaydındaki isim, tip, seviye ve bonusları boş taslağa yazar. */
export function applyCatalogRecord(raw: RawItem, record: Record<string, unknown>) {
  if (typeof record.name === 'string' && record.name) {
    raw.name = record.name;
    raw.found = [...new Set([...raw.found, 'name'])];
  }
  const type = String(record.type ?? '').replace(/^ITEM_/, '');
  const subtype = SUBTYPES[String(record.subtype ?? '')];
  if (type && subtype) {
    raw.type = type;
    raw.subtype = subtype;
  }
  const level = Number(record.level);
  if (Number.isInteger(level) && level >= 0) {
    raw.levelRequired = level;
    raw.found = [...new Set([...raw.found, 'levelRequired'])];
  }
  const classes = Object.entries(CLASSES).filter(([key]) => record[key] === true).map(([, code]) => code);
  if (classes.length) {
    raw.classes = classes;
    raw.found = [...new Set([...raw.found, 'classes'])];
  }
  const bonuses = Array.isArray(record.bonuses) ? record.bonuses : [];
  for (const bonus of bonuses) {
    if (!bonus || typeof bonus !== 'object') continue;
    const text = String((bonus as { t?: unknown }).t ?? '');
    const match = text.match(/^(.*?)(-?\d+(?:[.,]\d+)?)(%?)\s*$/);
    if (!match) continue;
    const label = match[1].trim();
    const value = Number(match[2].replace(',', '.'));
    if (!label || !Number.isFinite(value)) continue;
    if (/^defen[cs]e$/i.test(label) || (bonus as { k?: unknown }).k === 'def') raw.stats.defense = value;
    else raw.bonuses.push({ label, value, unit: match[3] ? '%' : '' });
  }
  if (raw.stats.defense) raw.found = [...new Set([...raw.found, 'stats'])];
  if (raw.bonuses.length) raw.found = [...new Set([...raw.found, 'bonuses'])];
}

export const m2icondb: SiteImporter = {
  id: 'm2icondb', name: 'Metin2 Icon Database', example: 'https://m2icondb.com/item/10',
  matches: (raw) => {
    const u = new URL(raw);
    return /^(www\.)?m2icondb\.com$/.test(u.hostname) && /^\/(item\/\d+\/?|monster\/[A-Za-z0-9_-]+\/?|3d)$/.test(u.pathname);
  },
  parse(_html, url): RawItem {
    const u = new URL(url);
    const q = u.searchParams;
    const id = u.pathname.match(/\/item\/(\d+)/)?.[1] ?? q.get('vnum') ?? q.get('value3');
    const monster = q.get('monster') === 'true' || /^(?:monster|mob)\//.test(q.get('glb') ?? '');
    const type = (q.get('type') ?? '').replace(/^ITEM_/, '');
    return {
      vnum: id && /^\d+$/.test(id) ? Number(id) : undefined,
      name: q.get('name') ?? undefined,
      type: monster ? 'MONSTER' : type || undefined,
      subtype: monster ? 'MOB' : SUBTYPES[q.get('subtype') ?? ''],
      stats: {}, bonuses: [], levels: [], modelUrl: url,
      found: id ? ['vnum'] : [],
    };
  },
};
