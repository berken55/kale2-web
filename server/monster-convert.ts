import type { MonsterElement, MonsterRace, MonsterRank } from '../shared/constants.ts';
import type { MonsterInput } from '../shared/types.ts';

/**
 * Eski "item gibi saklanan canavar" verisini (items.type = 'MONSTER' + monster_stats JSON'u) ve
 * içe aktarıcıların ham çıktısını monsters tablosunun alanlarına çevirir.
 */
export interface LegacyMonster {
  vnum: number;
  name: string;
  /** MOB | BOSS | NPC */
  subtype: string;
  level: number;
  damageMin: number;
  damageMax: number;
  defense: number;
  stats: Record<string, number | string>;
  description?: string;
  sourceUrl?: string | null;
}

/** Oyunun bugünkü yaratık kimlikleri (game/data/mobs.json); geçişte oyun tarafı kırılmasın diye. */
const GAME_CODES: Record<number, string> = {
  101: 'wild_dog',
  102: 'wolf',
  106: 'gray_wolf',
  494: 'chuhen',
  502: 'barbarian_soldier',
  534: 'barbarian_knight',
  691: 'orc_lord',
  1901: 'nine_tails',
};

const RACE_RULES: Array<[RegExp, MonsterRace]> = [
  [/hayvan|animal/i, 'ANIMAL'],
  [/yarı ?insan|half ?human/i, 'HUMAN'],
  [/ork|orc/i, 'ORC'],
  [/mistik|mystic/i, 'MYSTIC'],
  [/ölümsüz|undead/i, 'UNDEAD'],
  [/şeytan|devil|demon/i, 'DEVIL'],
  [/böcek|insect/i, 'INSECT'],
  [/çöl|desert/i, 'DESERT'],
];

const ELEMENT_RULES: Array<[RegExp, MonsterElement]> = [
  [/ateş|fire/i, 'FIRE'],
  [/buz|ice/i, 'ICE'],
  [/rüzgar|wind/i, 'WIND'],
  [/şimşek|yıldırım|elec|lightning/i, 'ELEC'],
  [/toprak|earth/i, 'EARTH'],
  [/karanlık|dark/i, 'DARK'],
];

// Ham hücre etiketi ("stat:Kılıç Savunması") → savunma anahtarı
const RESIST_RULES: Array<[RegExp, string]> = [
  [/çift[- ]?el|two[- ]?hand/i, 'TWOHAND'],
  [/kılıç|sword/i, 'SWORD'],
  [/bıçak|hançer|dagger/i, 'DAGGER'],
  [/\bok\b|arrow|bow/i, 'BOW'],
  [/çan|bell/i, 'BELL'],
  [/yelpaze|fan/i, 'FAN'],
  [/pençe|claw/i, 'CLAW'],
  [/yumruk|fist/i, 'FIST'],
  [/büyü|magic/i, 'MAGIC'],
  [/ateş|fire/i, 'FIRE'],
  [/buz|ice/i, 'ICE'],
  [/rüzgar|wind/i, 'WIND'],
  [/şimşek|yıldırım|lightning|elec/i, 'ELEC'],
  [/toprak|earth/i, 'EARTH'],
  [/karanlık|dark/i, 'DARK'],
  [/zehir|poison/i, 'POISON'],
];

const ABILITY_RULES: Array<[RegExp, string]> = [
  [/kritik|critical/i, 'CRITICAL'],
  [/delici|pierc|penetrat/i, 'PENETRATE'],
  [/bayılma|bayıltma|stun|faint/i, 'STUN'],
  [/yavaşla|slow/i, 'SLOW'],
  [/zehir|poison/i, 'POISON'],
  [/lanet|curse/i, 'CURSE'],
];

const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};

const percent = (v: unknown) => {
  const m = String(v).match(/[-+]?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
};

export function rankFrom(subtype: string, rankText: string): MonsterRank {
  if (subtype === 'NPC') return 'NPC';
  if (subtype === 'BOSS' || /patron|boss/i.test(rankText)) return 'BOSS';
  if (/metin|stone/i.test(rankText)) return 'STONE';
  // metin2alerts rütbe notu: "1.Seviye" / "Level 2" … 1-2 sıradan, 3-4 seçkin
  const grade = Number(rankText.match(/\d+/)?.[0] ?? 0);
  return grade >= 3 ? 'ELITE' : 'NORMAL';
}

/** metin2alerts adresindeki kısa adı oyun koduna çevirir: /wiki/mob/101-wild-dog → wild_dog */
export function codeFrom(vnum: number, sourceUrl?: string | null) {
  if (GAME_CODES[vnum]) return GAME_CODES[vnum];
  const slug = sourceUrl?.match(/\/(?:mob|npc|monster)\/\d+-([^/?#]+)/)?.[1];
  const code = slug
    ?.normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return code || `mob_${vnum}`;
}

export function convertLegacyMonster(m: LegacyMonster): MonsterInput {
  const s = m.stats;
  const text = (key: string) => (s[key] === undefined ? '' : String(s[key]));
  const raceText = text('race') || text('stat:Tür') || text('stat:Race');
  const rankText = text('rank');

  const resists: Record<string, number> = {};
  const abilities: Record<string, number> = {};
  for (const [key, value] of Object.entries(s)) {
    if (!key.startsWith('stat:')) continue;
    const label = key.slice(5);
    // "stat:Buz" / "stat:Rüzgar" tek başına elementin saldırı değeri; savunma değil
    if (!/savunma|direnc|direnç|dayanıklı|defen[cs]e|resist/i.test(label)) {
      const ability = ABILITY_RULES.find(([re]) => re.test(label))?.[1];
      const p = percent(value);
      if (ability && p !== null) abilities[ability] = p;
      continue;
    }
    const resist = RESIST_RULES.find(([re]) => re.test(label))?.[1];
    const p = percent(value);
    if (resist && p !== null) resists[resist] = p;
  }

  const behaviors = Object.entries(s)
    .filter(([key]) => key.startsWith('behavior:'))
    .map(([, value]) => String(value));
  const flags: string[] = [];
  const notes: string[] = [];
  for (const b of behaviors) {
    const summon = b.match(/^(?:Çağırıcı|Summoner)\s+(.+)/i);
    if (summon) {
      if (!flags.includes('SUMMONER')) flags.push('SUMMONER');
      notes.push(`Çağırır: ${summon[1].trim()}`);
    }
  }
  const aggressive = behaviors.some((b) => /saldırgan|aggressive/i.test(b));

  const rank = rankFrom(m.subtype, rankText);
  const damageMin = Math.max(0, Math.round(m.damageMin));
  const description = [m.description?.trim(), ...notes].filter(Boolean).join('\n');

  return {
    vnum: m.vnum,
    code: codeFrom(m.vnum, m.sourceUrl),
    name: m.name.slice(0, 64),
    rank,
    level: Math.max(1, Math.min(250, Math.round(m.level || 1))),
    race: RACE_RULES.find(([re]) => re.test(raceText))?.[1] ?? '',
    element: ELEMENT_RULES.find(([re]) => re.test(text('element')))?.[1] ?? '',
    hp: Math.max(1, Math.round(num(s.hp, 1))),
    hpRegenPct: Math.max(0, Math.round(num(s.hpRegenPercent))),
    hpRegenSec: Math.max(0, Math.round(num(s.hpRegenSeconds))),
    exp: Math.max(0, Math.round(num(s.exp))),
    damageMin,
    damageMax: Math.max(damageMin, Math.round(m.damageMax)),
    defense: Math.max(0, Math.round(m.defense)),
    str: Math.max(0, Math.round(num(s.strength))),
    dex: Math.max(0, Math.round(num(s.dexterity))),
    vit: Math.max(0, Math.round(num(s.vitality))),
    int: Math.max(0, Math.round(num(s.intelligence))),
    attackSpeed: Math.round(num(s.attackSpeed, 100)) || 100,
    moveSpeed: Math.round(num(s.movementSpeed, 100)) || 100,
    attackRange: 1.5,
    // Bosslar ve seçkinler oyuncuyu kendisi fark etsin
    aggressive: aggressive || rank === 'BOSS' || rank === 'KING',
    aggroRange: rank === 'BOSS' || rank === 'KING' ? 12 : 8,
    yangMin: 0,
    yangMax: 0,
    resists,
    abilities,
    flags,
    modelScale: 1,
    description: description.slice(0, 2000),
    sourceUrl: m.sourceUrl ?? null,
  };
}
