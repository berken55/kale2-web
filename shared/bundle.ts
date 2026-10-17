// Oyuna giden veri paketi (bundle) biçimi. Oyun tarafı: game/globals/game_data.gd
// Değişiklikte BUNDLE_FORMAT_VERSION artırılır; oyun bilmediği sürümü reddeder ve eskisiyle devam eder.

export const BUNDLE_FORMAT = 'kale2-bundle';
export const BUNDLE_FORMAT_VERSION = 1;

export interface BundleFile {
  url: string;
  sha256: string;
}

export type Range = [number, number];

export const MONSTER_STATS_MODES = [
  { value: 'game', label: 'Oyunun kendi değerleri' },
  { value: 'panel', label: 'Paneldeki değerler' },
] as const;
export type MonsterStatsMode = (typeof MONSTER_STATS_MODES)[number]['value'];

/** Panelden değiştirilebilen oyun ayarları ve varsayılanları */
export interface GameConfig {
  monster_stats: MonsterStatsMode;
}
export const DEFAULT_GAME_CONFIG: GameConfig = { monster_stats: 'game' };

/** Item ya da grup veren drop satırı. item: vnum, code: oyunun item kodu (yoksa oyunda düşmez). */
export interface BundleDrop {
  item?: number;
  code?: string | null;
  group?: string;
  ppm: number;
  count: Range;
  upgrade: Range;
}

export interface BundleItem {
  vnum: number;
  code: string | null;
  name: string;
  type: string;
  subtype: string;
  rarity: string;
  level: number;
  stack: number;
  icon: BundleFile | null;
  model: BundleFile | null;
}

export interface BundleMonster {
  vnum: number;
  code: string;
  name: string;
  rank: string;
  level: number;
  race: string;
  element: string;
  hp: number;
  /** [yüzde, saniye] */
  hp_regen: Range;
  exp: number;
  damage: Range;
  defense: number;
  stats: { str: number; dex: number; vit: number; int: number };
  /** 100 = normal */
  attack_speed: number;
  move_speed: number;
  attack_range: number;
  aggressive: boolean;
  aggro_range: number;
  /** [0, 0] = oyunun genel yang kuralı */
  yang: Range;
  resists: Record<string, number>;
  abilities: Record<string, number>;
  flags: string[];
  model: (BundleFile & { scale: number }) | null;
  icon: BundleFile | null;
  drops: BundleDrop[];
}

export interface BundleDropGroup {
  name: string;
  mode: 'EACH' | 'ONE_OF';
  rolls: number;
  entries: Array<Omit<BundleDrop, 'group'> & { item: number }>;
}

export interface BundleLevelDrop extends BundleDrop {
  level: Range;
  ranks: string[];
}

export interface BundleSpawn {
  /** Yaratığın oyun kodu ve vnum'u; seviye yaratık kaydındaki seviye */
  monster: string;
  vnum: number;
  kind: 'PACK' | 'BOSS' | 'STONE' | 'EVENT';
  max_alive: number;
  pack: Range;
  /** Saniye */
  respawn: Range;
  announce: boolean;
  schedule: string;
  leader: string | null;
}

export interface BundleRegion {
  code: string;
  name: string;
  shape: 'CIRCLE' | 'POLYGON';
  x: number;
  z: number;
  radius: number;
  points: Array<[number, number]>;
  level: Range;
  spawns: BundleSpawn[];
}

export interface BundleMap {
  name: string;
  /** [min_x, min_z, max_x, max_z] dünya koordinatı */
  rect: [number, number, number, number];
  regions: BundleRegion[];
}

/** Bundle'ın içerik kısmı; sha256 bunun üzerinden hesaplanır (sürüm numarası ve tarih hariç). */
export interface BundleContent {
  config: {
    /**
     * game: oyun isim, davranış ve statları kendi mobs.json değerlerinden alır; panelden yalnızca droplar gelir.
     * panel: isim, saldırganlık, boss, HP, hasar, menzil ve hızlar da panelden (yaratık seviyesinde birebir; diğer seviyelere ölçeklenir).
     */
    monster_stats: MonsterStatsMode;
    /** diff = oyuncu seviyesi − yaratık seviyesi; en büyük eşleşen eşiğin çarpanı */
    drop_level_penalty: Array<{ diff: number; mult: number }>;
  };
  items: BundleItem[];
  monsters: BundleMonster[];
  drop_groups: Record<string, BundleDropGroup>;
  level_drops: BundleLevelDrop[];
  /** Harita kodu (village1) → bölgeler */
  maps: Record<string, BundleMap>;
}

export interface Bundle extends BundleContent {
  format: typeof BUNDLE_FORMAT;
  format_version: number;
  version: number;
  sha256: string;
  created_at: string;
}

export interface ReleaseSummary {
  id: number;
  version: number;
  sha256: string;
  notes: string;
  createdAt: string;
  isActive: boolean;
  counts: { items: number; monsters: number; dropGroups: number; levelDrops: number; maps: number; regions: number };
}

export interface ReleaseChange {
  kind: 'item' | 'monster' | 'drop_group' | 'level_drops' | 'config' | 'map';
  key: string;
  name: string;
  change: 'added' | 'removed' | 'changed';
}

export interface ReleasePreview {
  errors: string[];
  warnings: string[];
  sha256: string;
  counts: ReleaseSummary['counts'];
  /** Aktif sürüme göre fark; aktif sürüm yoksa her şey "added" */
  activeVersion: number | null;
  changes: ReleaseChange[];
}
