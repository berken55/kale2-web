import type { CharacterClass, Gender, ItemType, MonsterElement, MonsterRace, MonsterRank, Rarity } from './constants';

export interface BonusType {
  id: number;
  code: string;
  name: string;
  unit: '' | '%';
  maxValue: number;
  description: string;
}

export interface ItemBonus {
  bonusTypeId: number;
  value: number;
}

export interface UpgradeMaterial {
  vnum: number;
  count: number;
}

export interface ItemUpgrade {
  level: number;
  attackBonus: number;
  magicAttackBonus: number;
  defenseBonus: number;
  successRate: number;
  cost: number;
  materials: UpgradeMaterial[];
}

export interface ItemStats {
  minAttack: number;
  maxAttack: number;
  minMagicAttack: number;
  maxMagicAttack: number;
  defense: number;
  attackSpeed: number;
}

export interface Item {
  id: number;
  vnum: number;
  /** Oyundaki item kodu (ör. RUSTY_SWORD); droplar oyunda bu kodla eşlenir */
  code: string | null;
  name: string;
  type: ItemType;
  subtype: string;
  rarity: Rarity;
  levelRequired: number;
  classes: CharacterClass[];
  gender: Gender;
  buyPrice: number;
  sellPrice: number;
  stackSize: number;
  tradable: boolean;
  description: string;
  stats: ItemStats;
  bonuses: ItemBonus[];
  upgrades: ItemUpgrade[];
  iconUrl: string | null;
  modelUrl: string | null;
  modelFileName: string | null;
  /** İçe aktarıldıysa kaynak sayfa adresi */
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ItemSummary = Pick<
  Item,
  'id' | 'vnum' | 'name' | 'type' | 'subtype' | 'rarity' | 'levelRequired' | 'classes' | 'iconUrl' | 'modelUrl' | 'updatedAt'
>;

export interface ItemListResponse {
  items: ItemSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ActivityEntry {
  id: number;
  action: 'create' | 'update' | 'delete' | 'upload' | 'import';
  entity: 'item' | 'monster' | 'bonus_type' | 'system';
  entityId: number | null;
  summary: string;
  createdAt: string;
}

export interface DashboardStats {
  totalItems: number;
  totalMonsters: number;
  withModel: number;
  withIcon: number;
  bonusTypes: number;
  byType: Array<{ type: string; count: number }>;
  byRarity: Array<{ rarity: string; count: number }>;
  recentActivity: ActivityEntry[];
}

export interface WikiCatalog {
  total: number;
  groups: Array<{ type: string; subtype: string; count: number }>;
}

export interface WikiItemListResponse {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WikiMaterialRef {
  id: number;
  vnum: number;
  name: string;
  rarity: string;
  iconUrl: string | null;
}

export interface WikiItemDetail {
  item: Item;
  /** İstenen vnum bir yükseltme seviyesine (taban vnum + seviye) karşılık geliyorsa o seviye */
  level: number;
  bonusTypes: BonusType[];
  /** Yükseltme malzemelerinin vnum'a göre item bilgileri (panelde tanımlıysa) */
  materials: Record<number, WikiMaterialRef>;
}

/** Harici bir sayfadan okunan, henüz kaydedilmemiş item taslağı. */
export interface ImportDraft {
  source: { url: string; importer: string; importerName: string };
  item: {
    vnum: number;
    name: string;
    type: string;
    subtype: string;
    rarity: string;
    levelRequired: number;
    classes: string[];
    gender: string;
    buyPrice: number;
    sellPrice: number;
    stackSize: number;
    tradable: boolean;
    description: string;
    stats: ItemStats;
    bonuses: ItemBonus[];
    upgrades: ItemUpgrade[];
    sourceUrl: string;
  };
  /** Kaynakta bulunan ikon ve 3D model adresleri (kayıttan sonra indirilir) */
  assets: { iconUrl: string | null; modelUrl: string | null };
  /** Aynı vnum'a sahip mevcut item */
  existingItemId: number | null;
  /** Panelde karşılığı bulunamayan bonuslar */
  unresolvedBonuses: Array<{ label: string; value: number; unit: string }>;
  /** Panelde tanımlı olmayan yükseltme malzemeleri */
  missingMaterials: Array<{ vnum: number; name: string; url: string | null }>;
  /** Hangi alanların sayfadan okunabildiği */
  found: string[];
  warnings: string[];
}

// ---- Canavarlar ----

export interface Monster {
  id: number;
  vnum: number;
  /** Oyundaki kısa ad (ör. wolf, orc_lord) */
  code: string;
  name: string;
  rank: MonsterRank;
  level: number;
  race: MonsterRace;
  element: MonsterElement;
  hp: number;
  /** Her hpRegenSec saniyede canının yüzde kaçını yeniler */
  hpRegenPct: number;
  hpRegenSec: number;
  exp: number;
  damageMin: number;
  damageMax: number;
  defense: number;
  str: number;
  dex: number;
  vit: number;
  int: number;
  attackSpeed: number;
  moveSpeed: number;
  /** Metre (oyun birimi) */
  attackRange: number;
  aggressive: boolean;
  aggroRange: number;
  /** 0/0 = oyunun genel yang kuralı */
  yangMin: number;
  yangMax: number;
  /** Savunmalar, % (ör. { SWORD: 15, WIND: -30 }) */
  resists: Record<string, number>;
  /** Vuruşta tetiklenme şansları, % (ör. { CRITICAL: 5 }) */
  abilities: Record<string, number>;
  flags: string[];
  modelScale: number;
  description: string;
  iconUrl: string | null;
  modelUrl: string | null;
  modelFileName: string | null;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MonsterSummary = Pick<
  Monster,
  'id' | 'vnum' | 'code' | 'name' | 'rank' | 'level' | 'race' | 'element' | 'hp' | 'exp' | 'aggressive' | 'iconUrl' | 'modelUrl' | 'updatedAt'
>;

export interface MonsterListResponse {
  monsters: MonsterSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type MonsterInput = Omit<Monster, 'id' | 'iconUrl' | 'modelUrl' | 'modelFileName' | 'createdAt' | 'updatedAt'>;

/** Harici bir canavar sayfasından okunan, henüz kaydedilmemiş taslak. */
export interface MonsterImportDraft {
  source: { url: string; importer: string; importerName: string };
  monster: MonsterInput;
  assets: { iconUrl: string | null; modelUrl: string | null };
  existingMonsterId: number | null;
  warnings: string[];
}

export interface WikiMonsterListResponse {
  monsters: MonsterSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- Droplar ----

/** Drop satırında gösterilen item bilgisi */
export interface DropItemRef {
  vnum: number;
  name: string;
  rarity: string;
  type: string;
  iconUrl: string | null;
}

export interface DropRangeFields {
  /** 1/1.000.000; ONE_OF gruplarında ağırlık */
  chancePpm: number;
  countMin: number;
  countMax: number;
  upgradeMin: number;
  upgradeMax: number;
}

/** Yaratık dropu ya da genel drop satırı: ya item ya grup */
export interface DropRow extends DropRangeFields {
  itemVnum: number | null;
  groupId: number | null;
}

export interface LevelDrop extends DropRow {
  levelMin: number;
  levelMax: number;
  ranks: string[];
}

export interface DropGroupEntry extends DropRangeFields {
  itemVnum: number;
}

export interface DropGroupSummary {
  id: number;
  code: string;
  name: string;
  rollMode: 'EACH' | 'ONE_OF';
  rolls: number;
  entryCount: number;
  /** Bu grubu kullanan yaratık ve genel drop satırı sayısı */
  usedByMonsters: number;
  usedByLevelDrops: number;
}

export interface DropGroup {
  id: number;
  code: string;
  name: string;
  rollMode: 'EACH' | 'ONE_OF';
  rolls: number;
  description: string;
  entries: DropGroupEntry[];
  usedBy: Array<{ id: number; vnum: number; name: string }>;
  usedByLevelDrops: number;
  items: Record<number, DropItemRef>;
}

/** GET/PUT /api/monsters/:id/drops ve /api/level-drops yanıtlarında satırlarla birlikte gelen bilgiler */
export interface DropRefs {
  items: Record<number, DropItemRef>;
  groups: Record<number, { id: number; code: string; name: string }>;
}

export interface MonsterDropsResponse extends DropRefs {
  drops: DropRow[];
  /** Bu yaratığa da uygulanan genel drop satırları (salt okunur bilgi) */
  levelDrops: LevelDrop[];
}

export interface LevelDropsResponse extends DropRefs {
  levelDrops: LevelDrop[];
}

export interface DropSimulationResponse {
  kills: number;
  playerLevel: number;
  multiplier: number;
  emptyKills: number;
  lines: Array<{
    item: DropItemRef;
    expectedPerKill: number;
    total: number;
    killsWithDrop: number;
    upgrades: Record<number, number>;
  }>;
}
