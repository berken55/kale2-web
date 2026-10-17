import { firstTagText, htmlToText, metaContent, parseInteger } from './html.ts';
import type { RawItem, SiteImporter } from './types.ts';

export const monsters: SiteImporter = {
  id: 'metin2alerts-monsters', name: 'Metin2 Alerts — Canavar / NPC',
  example: 'https://metin2alerts.com/en/wiki/mob/101-wild-dog',
  matches: (url) => /^(www\.)?metin2alerts\.com$/.test(new URL(url).hostname) && /\/wiki\/(mob|npc)\/\d+/.test(new URL(url).pathname),
  parse(html, url): RawItem {
    const text = htmlToText(html);
    const number = (label: string) => {
      const m = text.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*:?\\s*([\\d.,]+)`, 'i'));
      return m ? parseInteger(m[1]) ?? undefined : undefined;
    };
    const damage = text.match(/(?:Damage|Hasar)\s*:?\s*(\d[\d.,]*)\s*[-–—~]\s*(\d[\d.,]*)/i);
    const stat = (label: string) => {
      const m = text.match(new RegExp(`(?:^|\\n)\\s*([\\d.,]+)\\s*${label}(?:\\n|$)`, 'i'));
      return m ? parseInteger(m[1]) ?? undefined : number(label);
    };
    const monsterStats: Record<string, number | string> = {};
    for (const [key, label] of Object.entries({ hp: '(?:HP|Can)', exp: '(?:EXP|Deneyim|Tecrübe)', movementSpeed: '(?:Movement speed|Hareket hızı)', vitality: 'VIT', intelligence: 'INT', strength: 'STR', dexterity: 'DEX', attackSpeed: '(?:Attack speed|Saldırı hızı)' })) {
      const n = stat(label);
      if (n !== undefined) monsterStats[key] = n;
    }
    const race = text.match(/(?:^|\n)(?:Race|Irk)\s*:?\s*([^\n]+)/i)?.[1];
    if (race) monsterStats.race = race;
    const defense = stat('(?:Defen[cs]e|Savunma)');
    // Preserve every displayed statistics cell, including resistances and elements.
    for (const cell of html.matchAll(/<div\b[^>]*class="[^"]*\bmobstat-cell\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)) {
      const label = cell[1].match(/<span\b[^>]*class="[^"]*\bmobstat-k\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1];
      const value = cell[1].match(/<span\b[^>]*class="[^"]*\bmobstat-v\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1];
      if (label && value) monsterStats[`stat:${htmlToText(label)}`.slice(0, 40)] = htmlToText(value).slice(0, 200);
      const rank = cell[1].match(/<span\b[^>]*class="[^"]*\bmobstat-note\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1];
      if (rank) monsterStats.rank = htmlToText(rank).slice(0, 200);
      const elements = [...cell[1].matchAll(/<img\b[^>]*alt="([^"]+)"/gi)].map((m) => m[1]);
      if (rank && elements.length) monsterStats.element = elements.join(', ').slice(0, 200);
    }
    const regen = text.match(/(?:HP regeneration|HP yenilenmesi|Can yenilenmesi)\s*:?\s*%?\s*(\d+)\s*%?\s*\/\s*(\d+)\s*(?:s|sn)/i);
    if (regen) { monsterStats.hpRegenPercent = Number(regen[1]); monsterStats.hpRegenSeconds = Number(regen[2]); }
    const behaviors = [...html.matchAll(/<div\b[^>]*class="mobstat-beh"[^>]*>([\s\S]*?)<\/div>/gi)].map((m) => htmlToText(m[1]));
    behaviors.forEach((value, index) => { monsterStats[`behavior:${index + 1}`] = value.slice(0, 200); });
    const vnum = Number(new URL(url).pathname.match(/\/(mob|npc)\/(\d+)/)![2]);
    const name = firstTagText(html, 'h1') ?? undefined;
    const levelRequired = number('(?:Level|Seviye)');
    return {
      vnum, name, type: 'MONSTER', subtype: url.includes('/npc/') ? 'NPC' : /boss|patron/i.test(String(monsterStats.rank ?? '')) ? 'BOSS' : 'MOB',
      levelRequired, stats: { ...(damage ? { minAttack: parseInteger(damage[1])!, maxAttack: parseInteger(damage[2])! } : {}), ...(defense !== undefined ? { defense } : {}) },
      monsterStats, bonuses: [], levels: [], iconUrl: metaContent(html, 'og:image'),
      modelUrl: /anima|folder/.test(html) ? url : null,
      found: ['vnum', ...(name ? ['name'] : []), ...(levelRequired !== undefined ? ['levelRequired'] : []), ...(damage || defense !== undefined ? ['stats'] : [])],
    };
  },
};
