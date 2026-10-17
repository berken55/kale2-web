export interface RawMaterial {
  vnum: number;
  name: string;
  count: number;
  url: string | null;
}

export interface RawLevel {
  level: number;
  minAttack?: number;
  maxAttack?: number;
  minMagicAttack?: number;
  maxMagicAttack?: number;
  defense?: number;
  successRate?: number;
  cost?: number;
  materials: RawMaterial[];
}

/** Bir site okuyucusunun sayfadan çıkarabildiği ham veriler (her alan opsiyonel). */
export interface RawItem {
  warnings?: string[];
  monsterStats?: Record<string, number | string>;
  vnum?: number;
  name?: string;
  type?: string;
  subtype?: string;
  levelRequired?: number;
  classes?: string[];
  stats: Partial<{
    minAttack: number;
    maxAttack: number;
    minMagicAttack: number;
    maxMagicAttack: number;
    defense: number;
    attackSpeed: number;
  }>;
  bonuses: Array<{ label: string; value: number; unit: '' | '%' }>;
  levels: RawLevel[];
  sellPrice?: number;
  iconUrl?: string | null;
  modelUrl?: string | null;
  /** Tip/alt tip tahmini için ek metin (kategori bağlantıları, adres) */
  categoryText?: string;
  found: string[];
}

export interface SiteImporter {
  id: string;
  name: string;
  example: string;
  matches(url: string): boolean;
  parse(html: string, url: string): RawItem;
}
