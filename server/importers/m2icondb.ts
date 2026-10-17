import type { RawItem, SiteImporter } from './types.ts';

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
    const subtypes: Record<string, string> = { WEAPON_SWORD: 'SWORD', WEAPON_TWO_HANDED: 'TWO_HANDED', WEAPON_DAGGER: 'DAGGER', WEAPON_BOW: 'BOW', WEAPON_BELL: 'BELL', WEAPON_FAN: 'FAN', WEAPON_CLAW: 'CLAW', ARMOR_BODY: 'BODY', COSTUME_BODY: 'BODY', COSTUME_HAIR: 'HAIR', COSTUME_WEAPON: 'WEAPON', COSTUME_ACCE: 'ACCE' };
    return {
      vnum: id && /^\d+$/.test(id) ? Number(id) : undefined,
      name: q.get('name') ?? undefined,
      type: monster ? 'MONSTER' : type || undefined,
      subtype: monster ? 'MOB' : subtypes[q.get('subtype') ?? ''],
      stats: {}, bonuses: [], levels: [], modelUrl: url,
      found: id ? ['vnum'] : [],
    };
  },
};
