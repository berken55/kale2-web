import { CLASSES, ITEM_SUBTYPES, ITEM_TYPES, labelOf, type ItemType } from '@shared/constants';

export interface Category {
  type: ItemType;
  subtype: string;
  label: string;
  path: string;
}

export interface CategoryGroup {
  label: string;
  categories: Category[];
}

const cat = (type: ItemType, subtype: string): Category => ({
  type,
  subtype,
  label: labelOf(ITEM_SUBTYPES[type], subtype),
  path: `/wiki/c/${type.toLowerCase()}/${subtype.toLowerCase()}`,
});

/** Wiki menüsündeki kategori grupları — oyuncuların aradığı sırayla. */
export const CATEGORY_GROUPS: CategoryGroup[] = [
  { label: 'Silahlar', categories: ITEM_SUBTYPES.WEAPON.map((s) => cat('WEAPON', s.value)) },
  { label: 'Zırh & Takılar', categories: ITEM_SUBTYPES.ARMOR.map((s) => cat('ARMOR', s.value)) },
  {
    label: 'Diğer',
    categories: (['BELT', 'COSTUME', 'USE', 'MATERIAL', 'ETC'] as ItemType[]).flatMap((t) =>
      ITEM_SUBTYPES[t].map((s) => ({ ...cat(t, s.value), label: t === 'BELT' || t === 'ETC' ? labelOf(ITEM_TYPES, t) : labelOf(ITEM_SUBTYPES[t], s.value) })),
    ),
  },
];

/** Wiki menüsündeki canavar bağlantıları (canavarlar ayrı tabloda, item kategorisi değil). */
export const MONSTER_LINKS = [
  { label: 'Tüm canavarlar', path: '/wiki/canavarlar', rank: '' },
  { label: 'Bosslar', path: '/wiki/canavarlar?rank=BOSS', rank: 'BOSS' },
  { label: 'Seçkinler', path: '/wiki/canavarlar?rank=ELITE', rank: 'ELITE' },
  { label: 'Metin taşları', path: '/wiki/canavarlar?rank=STONE', rank: 'STONE' },
] as const;

export function findCategory(type?: string, subtype?: string) {
  for (const g of CATEGORY_GROUPS) {
    const c = g.categories.find((x) => x.type.toLowerCase() === type?.toLowerCase() && x.subtype.toLowerCase() === subtype?.toLowerCase());
    if (c) return { group: g, category: c };
  }
  return null;
}

export function categoryPath(type: string, subtype: string) {
  return `/wiki/c/${type.toLowerCase()}/${subtype.toLowerCase()}`;
}

/** Kategori kartlarında kullanılan basit çizgi ikonlar (24×24). */
const ICONS: Record<string, string> = {
  'WEAPON/SWORD': 'M18 3l3 3-11 11-3-3zM7 14l3 3M4 17l3 3M5 21l-2-2',
  'WEAPON/TWO_HANDED': 'M19 2l3 3-12 12-3-3zM6 13l5 5M3 18l3 3M2 22l2-2',
  'WEAPON/DAGGER': 'M15 4l5 5-7 7-5-5zM8 11l5 5M5 17l2 2M3 21l3-3',
  'WEAPON/BOW': 'M5 3c8 2 14 8 16 16M5 3l16 16M3 9l6-6M15 21l6-6',
  'WEAPON/BELL': 'M12 3a6 6 0 016 6v5l2 3H4l2-3V9a6 6 0 016-6zM10 20a2 2 0 004 0',
  'WEAPON/FAN': 'M12 20L4 8a12 12 0 0116 0zM12 20V9M12 20L8 9M12 20l4-11',
  'WEAPON/CLAW': 'M6 4v9a6 6 0 0012 0V4M10 4v8M14 4v8',
  'WEAPON/ARROW': 'M4 20L20 4M14 4h6v6M4 20l3-1-2-2z',
  'ARMOR/BODY': 'M8 3l4 2 4-2 4 4-3 3v11H7V10L4 7z',
  'ARMOR/HEAD': 'M4 15a8 8 0 0116 0v3H4zM12 7V3M8 18v3M16 18v3',
  'ARMOR/SHIELD': 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  'ARMOR/WRIST': 'M5 12a7 4 0 0014 0 7 4 0 00-14 0zM5 12v3a7 4 0 0014 0v-3',
  'ARMOR/FOOTS': 'M7 3h5v10l7 3v4H5V13zM5 17h14',
  'ARMOR/NECK': 'M5 4c0 6 3 10 7 10s7-4 7-10M12 14v3M10 19a2 2 0 104 0 2 2 0 10-4 0',
  'ARMOR/EAR': 'M12 3a3 3 0 013 3c0 3-3 4-3 7M12 16a3 3 0 100 6 3 3 0 000-6z',
};

export function CategoryIcon({ type, subtype, className = 'h-6 w-6' }: { type: string; subtype: string; className?: string }) {
  const d = ICONS[`${type}/${subtype}`] ?? 'M4 4h16v16H4zM4 9h16M9 4v16';
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const CLASS_SHORT: Record<string, string> = { WARRIOR: 'Sav', NINJA: 'Nin', SURA: 'Sur', SHAMAN: 'Şam', LYCAN: 'Lyc' };

export function ClassPills({ classes }: { classes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {CLASSES.map((c) => {
        const on = classes.length === 0 || classes.includes(c.value);
        return (
          <span
            key={c.value}
            title={c.label}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${on ? 'bg-gold-500/15 text-gold-300' : 'bg-white/[0.03] text-slate-600 line-through'}`}
          >
            {CLASS_SHORT[c.value]}
          </span>
        );
      })}
    </div>
  );
}

export const formatNumber = (n: number) => n.toLocaleString('tr-TR');

export function range(min: number, max: number) {
  return max > 0 ? `${min} - ${max}` : '—';
}
