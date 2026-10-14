import type { CharacterClass, Gender, ItemType, Rarity } from './constants';

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
  entity: 'item' | 'bonus_type' | 'system';
  entityId: number | null;
  summary: string;
  createdAt: string;
}

export interface DashboardStats {
  totalItems: number;
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
