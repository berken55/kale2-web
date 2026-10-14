// Harici bağımlılık olmadan HTML'den metin, tablo, bağlantı ve meta veri çıkaran küçük yardımcılar.
// Amaç tam bir HTML ayrıştırıcı değil; item sayfalarındaki tipik yapıları okumak.

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', times: '×', rarr: '→' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

const BLOCK = /<\/?(p|div|br|li|ul|ol|tr|table|thead|tbody|h[1-6]|section|article|header|footer|dt|dd|dl)\b[^>]*>/gi;

/** HTML'i, blok elemanlarında satır kıran düz metne çevirir. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<\/t[dh]>/gi, ' | ')
      .replace(BLOCK, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').replace(/(\s*\|\s*)+$/, '').trim())
    .filter(Boolean)
    .join('\n');
}

export function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : null;
}

export function metaContent(html: string, key: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if ((attr(tag, 'property') ?? attr(tag, 'name'))?.toLowerCase() === key.toLowerCase()) return attr(tag, 'content');
  }
  return null;
}

export function firstTagText(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? htmlToText(m[1]).replace(/\n/g, ' ').trim() || null : null;
}

export interface Link {
  href: string;
  text: string;
}

export function links(html: string, base: string): Link[] {
  const out: Link[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(`<a ${m[1]}>`, 'href');
    if (!href) continue;
    try {
      out.push({ href: new URL(href, base).toString(), text: htmlToText(m[2]).replace(/\n/g, ' ') || (attr(m[2], 'alt') ?? '') });
    } catch {
      /* geçersiz adres */
    }
  }
  return out;
}

export interface Table {
  headers: string[];
  rows: Array<{ cells: string[]; html: string }>;
}

/** Sayfadaki tabloları başlık ve satırlarıyla döndürür. */
export function tables(html: string): Table[] {
  const out: Table[] = [];
  for (const t of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const rows: Table['rows'] = [];
    let headers: string[] = [];
    for (const r of t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
      const cells = [...r[0].matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)];
      const texts = cells.map((c) => htmlToText(c[2]).replace(/\n/g, ' ').trim());
      if (!headers.length && cells.length && cells.every((c) => c[1].toLowerCase() === 'h')) headers = texts;
      else if (cells.length) rows.push({ cells: texts, html: r[0] });
    }
    out.push({ headers, rows });
  }
  return out;
}

export function images(html: string, base: string): Array<{ src: string; alt: string; cls: string }> {
  const out: Array<{ src: string; alt: string; cls: string }> = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = attr(m[0], 'src') ?? attr(m[0], 'data-src');
    if (!src || src.startsWith('data:')) continue;
    try {
      out.push({ src: new URL(src, base).toString(), alt: attr(m[0], 'alt') ?? '', cls: attr(m[0], 'class') ?? '' });
    } catch {
      /* geçersiz adres */
    }
  }
  return out;
}

/** "1.234", "1,234", "1 234" gibi biçimlerdeki tam sayıları okur. */
export function parseInteger(s: string): number | null {
  const m = s.replace(/[.,\s](?=\d{3}\b)/g, '').match(/-?\d+/);
  return m ? Number(m[0]) : null;
}
