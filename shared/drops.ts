// Drop kuralları: panel simülatörü ve ileride oyun sunucusu aynı hesabı kullanır.
// Oranlar 1/1.000.000 (ppm) tamsayıdır: 10.000 ppm = %1.

export const PPM = 1_000_000;

export const pctToPpm = (pct: number) => Math.round(pct * 10_000);
export const ppmToPct = (ppm: number) => ppm / 10_000;

/** %0,05 gibi küçük oranları da okunur gösterir. */
export function formatPct(ppm: number) {
  const pct = ppmToPct(ppm);
  const digits = pct === 0 || pct >= 10 ? 0 : pct >= 1 ? 2 : 4;
  return `%${pct.toLocaleString('tr-TR', { maximumFractionDigits: digits })}`;
}

export const DROP_ROLL_MODES = [
  { value: 'EACH', label: 'Her satır ayrı zar' },
  { value: 'ONE_OF', label: 'Ağırlıklı tek seçim' },
] as const;

export type DropRollMode = (typeof DROP_ROLL_MODES)[number]['value'];

/**
 * Oyuncu yaratıktan çok yüksek seviyedeyse drop şansı düşer (Metin2 kuralı).
 * diff = oyuncu seviyesi − yaratık seviyesi; en büyük eşleşen eşik geçerlidir.
 * İleride game_config tablosundan gelecek; şimdilik varsayılan.
 */
export const DEFAULT_LEVEL_PENALTY: ReadonlyArray<{ diff: number; mult: number }> = [
  { diff: 5, mult: 0.8 },
  { diff: 10, mult: 0.5 },
  { diff: 15, mult: 0.1 },
];

export function levelMultiplier(playerLevel: number, monsterLevel: number, table = DEFAULT_LEVEL_PENALTY) {
  const diff = playerLevel - monsterLevel;
  let mult = 1;
  for (const step of [...table].sort((a, b) => a.diff - b.diff)) if (diff >= step.diff) mult = step.mult;
  return mult;
}

export interface DropRange {
  countMin: number;
  countMax: number;
  upgradeMin: number;
  upgradeMax: number;
}

/** Zar atılacak hale getirilmiş drop tablosu (yaratık dropları + geçerli genel droplar). */
export interface ResolvedDropTable {
  /** Tetiklenince item ya da grup verir; şans seviye çarpanıyla çarpılır */
  rows: Array<DropRange & { chancePpm: number; itemVnum: number | null; groupId: number | null }>;
  groups: Record<number, { rollMode: DropRollMode; rolls: number; entries: Array<DropRange & { chancePpm: number; itemVnum: number }> }>;
}

export interface DropOutcome {
  itemVnum: number;
  count: number;
  upgrade: number;
}

type Rng = () => number;

const between = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

function rollGroup(table: ResolvedDropTable, groupId: number, rng: Rng, out: DropOutcome[]) {
  const g = table.groups[groupId];
  if (!g || !g.entries.length) return;
  if (g.rollMode === 'EACH') {
    for (const e of g.entries) {
      if (rng() * PPM < e.chancePpm) out.push({ itemVnum: e.itemVnum, count: between(rng, e.countMin, e.countMax), upgrade: between(rng, e.upgradeMin, e.upgradeMax) });
    }
    return;
  }
  const total = g.entries.reduce((s, e) => s + e.chancePpm, 0);
  if (total <= 0) return;
  for (let i = 0; i < g.rolls; i++) {
    let pick = rng() * total;
    const e = g.entries.find((x) => (pick -= x.chancePpm) < 0) ?? g.entries[g.entries.length - 1];
    out.push({ itemVnum: e.itemVnum, count: between(rng, e.countMin, e.countMax), upgrade: between(rng, e.upgradeMin, e.upgradeMax) });
  }
}

/** Bir öldürmede düşen itemler. */
export function rollDrops(table: ResolvedDropTable, multiplier: number, rng: Rng = Math.random): DropOutcome[] {
  const out: DropOutcome[] = [];
  for (const r of table.rows) {
    if (rng() * PPM >= r.chancePpm * multiplier) continue;
    if (r.itemVnum !== null) out.push({ itemVnum: r.itemVnum, count: between(rng, r.countMin, r.countMax), upgrade: between(rng, r.upgradeMin, r.upgradeMax) });
    else if (r.groupId !== null) rollGroup(table, r.groupId, rng, out);
  }
  return out;
}

const avg = (min: number, max: number) => (min + max) / 2;

/** Öldürme başına beklenen item adedi (kesin hesap, zar atmadan). */
export function expectedDrops(table: ResolvedDropTable, multiplier: number): Map<number, number> {
  const exp = new Map<number, number>();
  const add = (vnum: number, n: number) => exp.set(vnum, (exp.get(vnum) ?? 0) + n);
  for (const r of table.rows) {
    const p = Math.min(1, (r.chancePpm * multiplier) / PPM);
    if (r.itemVnum !== null) {
      add(r.itemVnum, p * avg(r.countMin, r.countMax));
      continue;
    }
    const g = r.groupId !== null ? table.groups[r.groupId] : undefined;
    if (!g) continue;
    if (g.rollMode === 'EACH') {
      for (const e of g.entries) add(e.itemVnum, p * (e.chancePpm / PPM) * avg(e.countMin, e.countMax));
    } else {
      const total = g.entries.reduce((s, e) => s + e.chancePpm, 0);
      if (total > 0) for (const e of g.entries) add(e.itemVnum, p * g.rolls * (e.chancePpm / total) * avg(e.countMin, e.countMax));
    }
  }
  return exp;
}

export interface SimulationLine {
  itemVnum: number;
  expectedPerKill: number;
  /** Toplam düşen adet */
  total: number;
  /** En az bir tane düşen öldürme sayısı */
  killsWithDrop: number;
  /** Düşen yükseltme seviyeleri: { 0: 12, 3: 1 } */
  upgrades: Record<number, number>;
}

export function simulateDrops(table: ResolvedDropTable, multiplier: number, kills: number, rng: Rng = Math.random) {
  const expected = expectedDrops(table, multiplier);
  const lines = new Map<number, SimulationLine>();
  const line = (vnum: number) => {
    let l = lines.get(vnum);
    if (!l) lines.set(vnum, (l = { itemVnum: vnum, expectedPerKill: expected.get(vnum) ?? 0, total: 0, killsWithDrop: 0, upgrades: {} }));
    return l;
  };
  for (const vnum of expected.keys()) line(vnum);
  let emptyKills = 0;
  for (let k = 0; k < kills; k++) {
    const drops = rollDrops(table, multiplier, rng);
    if (!drops.length) emptyKills++;
    const seen = new Set<number>();
    for (const d of drops) {
      const l = line(d.itemVnum);
      l.total += d.count;
      l.upgrades[d.upgrade] = (l.upgrades[d.upgrade] ?? 0) + d.count;
      if (!seen.has(d.itemVnum)) {
        seen.add(d.itemVnum);
        l.killsWithDrop++;
      }
    }
  }
  return { lines: [...lines.values()].sort((a, b) => b.expectedPerKill - a.expectedPerKill), emptyKills };
}

/** Tekrarlanabilir simülasyon için küçük tohumlu rastgele sayı üreteci (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
