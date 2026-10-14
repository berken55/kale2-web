import type { Item } from './types';

export interface LevelStats {
  level: number;
  minAttack: number;
  maxAttack: number;
  minMagicAttack: number;
  maxMagicAttack: number;
  defense: number;
}

/** Itemin belirli bir yükseltme seviyesindeki toplam güç değerleri (taban + seviye artışı). */
export function statsAtLevel(item: Pick<Item, 'stats' | 'upgrades'>, level: number): LevelStats {
  const up = item.upgrades.find((u) => u.level === level);
  const s = item.stats;
  const atk = up?.attackBonus ?? 0;
  const matk = up?.magicAttackBonus ?? 0;
  return {
    level,
    minAttack: s.maxAttack > 0 ? s.minAttack + atk : 0,
    maxAttack: s.maxAttack > 0 ? s.maxAttack + atk : 0,
    minMagicAttack: s.maxMagicAttack > 0 ? s.minMagicAttack + matk : 0,
    maxMagicAttack: s.maxMagicAttack > 0 ? s.maxMagicAttack + matk : 0,
    defense: s.defense + (up?.defenseBonus ?? 0),
  };
}

/** Tanımlı yükseltme seviyeleri; tablo yoksa yalnızca +0. */
export function availableLevels(item: Pick<Item, 'upgrades'>): number[] {
  const levels = new Set([0, ...item.upgrades.map((u) => u.level)]);
  return [...levels].sort((a, b) => a - b);
}

export function maxLevel(item: Pick<Item, 'upgrades'>): number {
  return Math.max(0, ...item.upgrades.map((u) => u.level));
}
