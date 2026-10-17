/**
 * metin2alerts.com item sayfası okuyucusu.
 *
 * İngilizce eşya sayfalarını ve satır/sütun biçimindeki yükseltme tablolarını
 * okur. Güncel sütun düzeni gerçek Sword sayfasıyla doğrulandı. Okunamayan
 * alanlar taslakta belirtilir; sunucuya özel değerler yönetici tarafından
 * kontrol edilmelidir.
 */
import { attr, firstTagText, htmlToText, images, links, metaContent, parseInteger, tables, type Table } from './html.ts';
import type { RawItem, RawLevel, RawMaterial, SiteImporter } from './types.ts';

const ITEM_PATH = /\/wiki\/item\/(\d+)(?:-[^/?#]*)?/i;

function vnumFromUrl(url: string): number | null {
  const m = new URL(url).pathname.match(ITEM_PATH);
  return m ? Number(m[1]) : null;
}

function nameFromSlug(url: string): string | null {
  const m = new URL(url).pathname.match(/\/wiki\/item\/\d+-([^/?#]+)/i);
  if (!m) return null;
  return decodeURIComponent(m[1])
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

const stripLevel = (name: string) => name.replace(/\s*\+\d{1,2}\s*$/, '').trim();

function cleanTitle(title: string): string {
  // "Poison Sword - Metin2 Alerts" / "Poison Sword | Metin2Alerts" gibi son ekleri at
  return stripLevel(title.split(/\s+[|–-]\s+/)[0].trim());
}

const RANGE = /(\d[\d.,]*)\s*[-–~]\s*(\d[\d.,]*)/;

function range(text: string): [number, number] | null {
  const m = text.match(RANGE);
  if (!m) return null;
  const a = parseInteger(m[1]);
  const b = parseInteger(m[2]);
  return a !== null && b !== null ? [a, b] : null;
}

const CLASS_WORDS: Array<[RegExp, string]> = [
  [/warrior|savaşçı/i, 'WARRIOR'],
  [/ninja|assassin/i, 'NINJA'],
  [/sura/i, 'SURA'],
  [/shaman|şaman/i, 'SHAMAN'],
  [/lycan|wolfm[ae]n/i, 'LYCAN'],
];

function parseClasses(text: string): string[] | null {
  const lines = text.split('\n');
  for (const [index, original] of lines.entries()) {
    const line = /^\[?(wearable|usable|wieldable)\]?$/i.test(original) ? `${original} ${lines[index + 1] ?? ''}` : original;
    if (!/(usable|wieldable|wearable|equippable|class|kullan)/i.test(line)) continue;
    const found = CLASS_WORDS.filter(([re]) => re.test(line)).map(([, c]) => c);
    if (!found.length) continue;
    if (/(not usable|cannot|can't|unusable|kullanılamaz)/i.test(line)) {
      return CLASS_WORDS.map(([, c]) => c).filter((c) => !found.includes(c));
    }
    return found;
  }
  return null;
}

type Column = 'level' | 'attack' | 'magic' | 'defense' | 'chance' | 'cost' | 'materials';

function headerColumn(h: string): Column | null {
  const s = h.toLowerCase();
  if (/magic|büyü/.test(s)) return 'magic';
  if (/attack|saldırı|damage/.test(s)) return 'attack';
  if (/def|armou?r|savunma/.test(s)) return 'defense';
  if (/chance|success|rate|şans|olasılık/.test(s)) return 'chance';
  if (/yang|cost|price|gold|ücret|maliyet/.test(s)) return 'cost';
  if (/material|required|item|malzeme|gerek/.test(s)) return 'materials';
  if (/level|upgrade|seviye|\+/.test(s)) return 'level';
  return null;
}

function rowLevel(cell: string): number | null {
  const m = cell.match(/^\+?\s*(\d{1,2})\b/) ?? cell.match(/\+(\d{1,2})\b/);
  return m ? Number(m[1]) : null;
}

function parseMaterials(rowHtml: string, base: string): RawMaterial[] {
  const out: RawMaterial[] = [];
  const anchors = [...rowHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>([^<]{0,24})/gi)];
  for (const a of anchors) {
    const href = attr(`<a ${a[1]}>`, 'href');
    if (!href) continue;
    let url: string;
    try {
      url = new URL(href, base).toString();
    } catch {
      continue;
    }
    const m = new URL(url).pathname.match(ITEM_PATH);
    if (!m) continue;
    const inner = htmlToText(a[2]).replace(/\n/g, ' ');
    const imgAlt = attr(a[2], 'alt') ?? attr(a[2], 'title') ?? '';
    const before = rowHtml.slice(Math.max(0, (a.index ?? 0) - 24), a.index).replace(/<[^>]+>/g, '');
    const count =
      (inner + ' ' + a[3]).match(/[x×]\s*(\d+)/i)?.[1] ??
      before.match(/(\d+)\s*[x×]\s*$/i)?.[1] ??
      a[3].match(/^\s*\(?(\d+)\)?/)?.[1] ??
      '1';
    const name = inner.replace(/[x×]\s*\d+/gi, '').trim() || imgAlt || nameFromSlug(url) || `#${m[1]}`;
    const existing = out.find((x) => x.vnum === Number(m[1]));
    if (existing) continue;
    out.push({ vnum: Number(m[1]), name, count: Number(count), url });
  }
  return out;
}

function parseUpgradeTable(t: Table, base: string): RawLevel[] | null {
  // Current site uses one column per upgrade level.
  if (t.headers.slice(1).length >= 2 && t.headers.slice(1).every((h) => /^\+\s*\d+$/.test(h))) {
    return t.headers.slice(1).map((h, index) => {
      const level: RawLevel = { level: Number(h.replace(/\D/g, '')), materials: [] };
      for (const row of t.rows) {
        const col = headerColumn(row.cells[0] ?? '');
        const cell = row.cells[index + 1] ?? '';
        const rg = range(cell);
        if (col === 'attack' && rg) [level.minAttack, level.maxAttack] = rg;
        if (col === 'magic' && rg) [level.minMagicAttack, level.maxMagicAttack] = rg;
        if (col === 'defense') level.defense = parseInteger(cell) ?? undefined;
        if (col === 'cost') level.cost = parseInteger(cell) ?? undefined;
        // The first chance row is the standard blessing-scroll route.
        if (col === 'chance' && level.successRate === undefined) level.successRate = parseInteger(cell) ?? (level.level === 0 ? 100 : undefined);
        if (col === 'materials') {
          const cells = [...row.html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)];
          level.materials = parseMaterials(cells[index + 1]?.[1] ?? '', base);
        }
      }
      return level;
    });
  }
  const levelRows = t.rows.filter((r) => r.cells.length >= 2 && rowLevel(r.cells[0]) !== null);
  if (levelRows.length < 2) return null;

  let columns: Array<Column | null> = t.headers.map(headerColumn);
  if (!columns.length) columns = levelRows[0].cells.map((_, i) => (i === 0 ? 'level' : null));

  return levelRows.map((r) => {
    const level: RawLevel = { level: rowLevel(r.cells[0])!, materials: [] };
    let rangesSeen = 0;
    r.cells.forEach((cell, i) => {
      if (i === 0) return;
      const col = columns[i] ?? null;
      const rg = range(cell);
      if (col === 'attack' || (!col && rg && rangesSeen === 0 && !/%/.test(cell))) {
        if (rg) [level.minAttack, level.maxAttack] = rg;
        rangesSeen++;
      } else if (col === 'magic' || (!col && rg && rangesSeen === 1)) {
        if (rg) [level.minMagicAttack, level.maxMagicAttack] = rg;
        rangesSeen++;
      } else if (col === 'defense') {
        level.defense = parseInteger(cell) ?? undefined;
      } else if (col === 'chance' || (!col && /%/.test(cell))) {
        const n = cell.match(/(\d+(?:[.,]\d+)?)\s*%?/);
        if (n) level.successRate = Math.round(Number(n[1].replace(',', '.')));
      } else if (col === 'cost' || (!col && /yang/i.test(cell))) {
        level.cost = parseInteger(cell) ?? undefined;
      }
    });
    level.materials = parseMaterials(r.html, base);
    return level;
  });
}

const BONUS_LINE = /^([^\d+:|]{3,60}?)\s*:?\s*\+\s*(\d+(?:[.,]\d+)?)\s*(%?)$/;

function parseBonuses(text: string, itemName: string) {
  const out: RawItem['bonuses'] = [];
  for (const line of text.split('\n')) {
    const m = line.match(BONUS_LINE);
    if (!m) continue;
    const label = m[1].trim();
    if (itemName && label.toLowerCase().startsWith(itemName.toLowerCase())) continue;
    if (/^(level|seviye|upgrade)/i.test(label)) continue;
    if (out.some((b) => b.label === label)) continue;
    out.push({ label, value: Number(m[2].replace(',', '.')), unit: m[3] as '' | '%' });
  }
  return out;
}

const MODEL_URL = /["'(]((?:https?:)?\/{0,2}[^"'()\s<>]+?\.(?:glb|gltf|obj|fbx))(?:\?[^"'()\s<>]*)?["')]/i;

function findModel(html: string, base: string): string | null {
  const m = html.match(MODEL_URL);
  if (!m) return null;
  try {
    return new URL(m[1], base).toString();
  } catch {
    return null;
  }
}

function findIcon(html: string, base: string, name: string): string | null {
  const imgs = images(html, base);
  const byName = imgs.find((i) => name && i.alt.toLowerCase().includes(name.toLowerCase()));
  const byClass = imgs.find((i) => /icon|item/i.test(i.cls) || /\/icons?\//i.test(i.src));
  const og = metaContent(html, 'og:image');
  return byName?.src ?? byClass?.src ?? (og ? new URL(og, base).toString() : null);
}

/** Sayfadaki kategori/ekmek kırıntısı metinleri: tip tahmini için kullanılır. */
function categoryHints(html: string, base: string): string {
  return links(html, base)
    .filter((l) => /\/wiki\/items\//i.test(l.href))
    .map((l) => `${l.text} ${new URL(l.href).pathname}`)
    .join(' ');
}

export const metin2alerts: SiteImporter = {
  id: 'metin2alerts',
  name: 'Metin2 Alerts',
  matches: (url) => /(^|\.)metin2alerts\.com$/i.test(new URL(url).hostname) && ITEM_PATH.test(new URL(url).pathname),
  example: 'https://metin2alerts.com/en/wiki/item/180-poison-sword',

  parse(html, url) {
    const text = htmlToText(html);
    const found: string[] = [];
    const vnum = vnumFromUrl(url);
    if (vnum) found.push('vnum');

    const h1 = firstTagText(html, 'h1');
    const ogTitle = metaContent(html, 'og:title') ?? firstTagText(html, 'title');
    const name = stripLevel(h1 ?? '') || (ogTitle ? cleanTitle(ogTitle) : '') || nameFromSlug(url) || '';
    if (h1 || ogTitle) found.push('name');

    const levelMatch = text.match(/(?:from level|required level|level required|min(?:imum)? level|seviye)\s*:?\s*(\d{1,3})\b/i);
    const levelRequired = levelMatch ? Number(levelMatch[1]) : undefined;
    if (levelRequired !== undefined) found.push('levelRequired');

    const classes = parseClasses(text);
    if (classes) found.push('classes');

    const stats: RawItem['stats'] = {};
    const atk = text.match(new RegExp(`(?<!magic(?:al)? )attack value\\s*:?\\s*${RANGE.source}`, 'i'));
    if (atk) [stats.minAttack, stats.maxAttack] = [parseInteger(atk[1])!, parseInteger(atk[2])!];
    const matk = text.match(new RegExp(`magic(?:al)? attack(?: value)?\\s*:?\\s*${RANGE.source}`, 'i'));
    if (matk) [stats.minMagicAttack, stats.maxMagicAttack] = [parseInteger(matk[1])!, parseInteger(matk[2])!];
    const def = text.match(/(?:defen[cs]e|armou?r value)\s*:?\s*\+?(\d[\d.,]*)/i);
    if (def) stats.defense = parseInteger(def[1]) ?? undefined;
    const speed = text.match(/attack speed\s*:?\s*([+-]?\d+)\s*%/i);
    if (speed) stats.attackSpeed = Number(speed[1]);
    if (Object.keys(stats).length) found.push('stats');

    let levels: RawLevel[] = [];
    for (const t of tables(html)) {
      const parsed = parseUpgradeTable(t, url);
      if (parsed && parsed.length > levels.length) levels = parsed;
    }
    if (levels.length) found.push('upgrades');

    const bonuses = parseBonuses(text, name).filter((b) => !/attack speed|saldırı hızı/i.test(b.label));
    if (bonuses.length) found.push('bonuses');

    const sell = text.match(/(?:sell(?:ing)? price|sells? for|satış(?: fiyatı)?)\s*:?\s*(\d[\d.,]*)/i);
    const iconUrl = findIcon(html, url, name);
    const modelUrl = findModel(html, url);

    return {
      vnum: vnum ?? undefined,
      name,
      levelRequired,
      classes: classes ?? undefined,
      stats,
      bonuses,
      levels,
      sellPrice: sell ? (parseInteger(sell[1]) ?? undefined) : undefined,
      iconUrl,
      modelUrl,
      categoryText: `${categoryHints(html, url)} ${new URL(url).pathname}`,
      warnings: /upg-mats-toggle/.test(html) && !levels.some((l) => l.materials.length) ? ['Yükseltme malzemeleri sayfada kapalı veya boş geldi; malzeme listesini kaynaktan kontrol edin.'] : [],
      found,
    };
  },
};
