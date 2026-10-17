import { z } from 'zod';
import {
  CLASSES,
  GENDERS,
  ITEM_SUBTYPES,
  ITEM_TYPES,
  MAX_UPGRADE_LEVEL,
  MONSTER_ABILITIES,
  MONSTER_ELEMENTS,
  MONSTER_FLAGS,
  MONSTER_RACES,
  MONSTER_RANKS,
  MONSTER_RESISTS,
  RARITIES,
  type ItemType,
} from '../shared/constants.ts';

const values = <T extends { value: string }>(list: readonly T[]) =>
  list.map((o) => o.value) as [T['value'], ...T['value'][]];

const int = (min = 0, max = 2_000_000_000) => z.coerce.number().int().min(min).max(max);

export const itemInputSchema = z
  .object({
    vnum: int(1),
    name: z.string().trim().min(1, 'İsim zorunludur.').max(64),
    type: z.enum(values(ITEM_TYPES)),
    subtype: z.string().min(1),
    rarity: z.enum(values(RARITIES)).default('COMMON'),
    levelRequired: int(0, 250).default(0),
    classes: z.array(z.enum(values(CLASSES))).default([]),
    gender: z.enum(values(GENDERS)).default('ANY'),
    buyPrice: int().default(0),
    sellPrice: int().default(0),
    stackSize: int(1, 1000).default(1),
    tradable: z.boolean().default(true),
    description: z.string().max(2000).default(''),
    stats: z
      .object({
        minAttack: int(0, 100_000).default(0),
        maxAttack: int(0, 100_000).default(0),
        minMagicAttack: int(0, 100_000).default(0),
        maxMagicAttack: int(0, 100_000).default(0),
        defense: int(0, 100_000).default(0),
        attackSpeed: int(-100, 100).default(0),
      })
      .default({}),
    bonuses: z
      .array(z.object({ bonusTypeId: int(1), value: z.coerce.number().min(-100_000).max(100_000) }))
      .max(10, 'Bir iteme en fazla 10 bonus eklenebilir.')
      .default([]),
    sourceUrl: z.string().url().max(2000).nullable().optional(),
    upgrades: z
      .array(
        z.object({
          level: int(0, MAX_UPGRADE_LEVEL),
          attackBonus: int(0, 100_000).default(0),
          magicAttackBonus: int(0, 100_000).default(0),
          defenseBonus: int(0, 100_000).default(0),
          successRate: int(0, 100).default(100),
          cost: int().default(0),
          materials: z.array(z.object({ vnum: int(1), count: int(1, 1000) })).max(5).default([]),
        }),
      )
      .default([]),
  })
  .superRefine((item, ctx) => {
    const subtypes = ITEM_SUBTYPES[item.type as ItemType];
    if (!subtypes.some((s) => s.value === item.subtype)) {
      ctx.addIssue({ code: 'custom', path: ['subtype'], message: 'Bu tip için geçersiz alt tip.' });
    }
    if (item.stats.minAttack > item.stats.maxAttack) {
      ctx.addIssue({ code: 'custom', path: ['stats', 'minAttack'], message: 'Min saldırı, max saldırıdan büyük olamaz.' });
    }
    if (item.stats.minMagicAttack > item.stats.maxMagicAttack) {
      ctx.addIssue({
        code: 'custom',
        path: ['stats', 'minMagicAttack'],
        message: 'Min büyü saldırısı, max büyü saldırısından büyük olamaz.',
      });
    }
    const bonusIds = item.bonuses.map((b) => b.bonusTypeId);
    if (new Set(bonusIds).size !== bonusIds.length) {
      ctx.addIssue({ code: 'custom', path: ['bonuses'], message: 'Aynı bonus birden fazla kez eklenemez.' });
    }
    const levels = item.upgrades.map((u) => u.level);
    if (new Set(levels).size !== levels.length) {
      ctx.addIssue({ code: 'custom', path: ['upgrades'], message: 'Aynı yükseltme seviyesi birden fazla kez tanımlanamaz.' });
    }
  });

export type ItemInput = z.infer<typeof itemInputSchema>;

const real = (min: number, max: number) => z.coerce.number().finite().min(min).max(max);

/** Anahtarları verilen listeden olan { ANAHTAR: yüzde } nesnesi */
const percentMap = (keys: readonly { value: string }[], min: number, max: number) =>
  z
    .record(z.string(), real(min, max))
    .default({})
    .superRefine((map, ctx) => {
      const allowed = new Set(keys.map((k) => k.value));
      for (const key of Object.keys(map)) {
        if (!allowed.has(key)) ctx.addIssue({ code: 'custom', path: [key], message: `Tanımsız anahtar: ${key}` });
      }
    });

export const monsterInputSchema = z
  .object({
    vnum: int(1),
    code: z
      .string()
      .trim()
      .min(1, 'Oyun kodu zorunludur.')
      .max(40)
      .regex(/^[a-z][a-z0-9_]*$/, 'Oyun kodu küçük harfle başlamalı; yalnızca küçük harf, rakam ve alt çizgi içerebilir.'),
    name: z.string().trim().min(1, 'İsim zorunludur.').max(64),
    rank: z.enum(values(MONSTER_RANKS)).default('NORMAL'),
    level: int(1, 250),
    race: z.enum(values(MONSTER_RACES)).default(''),
    element: z.enum(values(MONSTER_ELEMENTS)).default(''),
    hp: int(1),
    hpRegenPct: int(0, 100).default(0),
    hpRegenSec: int(0, 3600).default(0),
    exp: int().default(0),
    damageMin: int(0, 1_000_000).default(0),
    damageMax: int(0, 1_000_000).default(0),
    defense: int(0, 1_000_000).default(0),
    str: int(0, 10_000).default(0),
    dex: int(0, 10_000).default(0),
    vit: int(0, 10_000).default(0),
    int: int(0, 10_000).default(0),
    attackSpeed: int(1, 1000).default(100),
    moveSpeed: int(1, 1000).default(100),
    attackRange: real(0.1, 100).default(1.5),
    aggressive: z.boolean().default(false),
    aggroRange: real(0, 200).default(8),
    yangMin: int().default(0),
    yangMax: int().default(0),
    resists: percentMap(MONSTER_RESISTS, -100, 100),
    abilities: percentMap(MONSTER_ABILITIES, 0, 100),
    flags: z.array(z.enum(values(MONSTER_FLAGS))).max(MONSTER_FLAGS.length).default([]),
    modelScale: real(0.01, 100).default(1),
    description: z.string().max(2000).default(''),
    sourceUrl: z.string().url().max(2000).nullable().default(null),
  })
  .superRefine((m, ctx) => {
    if (m.damageMin > m.damageMax) {
      ctx.addIssue({ code: 'custom', path: ['damageMin'], message: 'Min hasar, max hasardan büyük olamaz.' });
    }
    if (m.yangMin > m.yangMax) {
      ctx.addIssue({ code: 'custom', path: ['yangMin'], message: 'Min yang, max yangdan büyük olamaz.' });
    }
    if (new Set(m.flags).size !== m.flags.length) {
      ctx.addIssue({ code: 'custom', path: ['flags'], message: 'Aynı özellik birden fazla kez eklenemez.' });
    }
  });

export type MonsterInputParsed = z.infer<typeof monsterInputSchema>;

export const bonusTypeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, 'Kod yalnızca büyük harf, rakam ve alt çizgi içerebilir.'),
  name: z.string().trim().min(1, 'İsim zorunludur.').max(80),
  unit: z.enum(['', '%']).default(''),
  maxValue: z.coerce.number().min(0).max(1_000_000).default(0),
  description: z.string().max(500).default(''),
});

export type BonusTypeInput = z.infer<typeof bonusTypeInputSchema>;

export function formatZodError(error: z.ZodError) {
  return {
    error: error.issues[0]?.message ?? 'Geçersiz veri.',
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}

// ---- Droplar ----
const dropRange = {
  chancePpm: int(0, 1_000_000),
  countMin: int(1, 10_000).default(1),
  countMax: int(1, 10_000).default(1),
  upgradeMin: int(0, MAX_UPGRADE_LEVEL).default(0),
  upgradeMax: int(0, MAX_UPGRADE_LEVEL).default(0),
};

type RangeLike = { countMin: number; countMax: number; upgradeMin: number; upgradeMax: number };
const checkRange = (r: RangeLike, ctx: z.RefinementCtx) => {
  if (r.countMin > r.countMax) ctx.addIssue({ code: 'custom', path: ['countMin'], message: 'Min adet, max adetten büyük olamaz.' });
  if (r.upgradeMin > r.upgradeMax) ctx.addIssue({ code: 'custom', path: ['upgradeMin'], message: 'Min yükseltme, max yükseltmeden büyük olamaz.' });
};

const dropTarget = {
  itemVnum: int(1).nullable().default(null),
  groupId: int(1).nullable().default(null),
};
const checkTarget = (r: { itemVnum: number | null; groupId: number | null }, ctx: z.RefinementCtx) => {
  if ((r.itemVnum === null) === (r.groupId === null)) {
    ctx.addIssue({ code: 'custom', path: ['itemVnum'], message: 'Her drop satırı ya bir item ya da bir drop grubu olmalı.' });
  }
};

export const dropRowSchema = z.object({ ...dropTarget, ...dropRange }).superRefine((r, ctx) => {
  checkTarget(r, ctx);
  checkRange(r, ctx);
});

export const monsterDropsSchema = z.object({ drops: z.array(dropRowSchema).max(100, 'Bir yaratığa en fazla 100 drop satırı eklenebilir.') });

export const levelDropSchema = z
  .object({
    ...dropTarget,
    ...dropRange,
    levelMin: int(1, 250),
    levelMax: int(1, 250),
    ranks: z.array(z.enum(values(MONSTER_RANKS))).min(1, 'En az bir rütbe seçin.'),
  })
  .superRefine((r, ctx) => {
    checkTarget(r, ctx);
    checkRange(r, ctx);
    if (r.levelMin > r.levelMax) ctx.addIssue({ code: 'custom', path: ['levelMin'], message: 'Min seviye, max seviyeden büyük olamaz.' });
  });

export const levelDropsSchema = z.object({ levelDrops: z.array(levelDropSchema).max(500) });

export const dropGroupInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Kod zorunludur.')
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, 'Kod küçük harfle başlamalı; yalnızca küçük harf, rakam ve alt çizgi içerebilir.'),
  name: z.string().trim().min(1, 'İsim zorunludur.').max(80),
  rollMode: z.enum(['EACH', 'ONE_OF']).default('EACH'),
  rolls: int(1, 20).default(1),
  description: z.string().max(500).default(''),
  entries: z
    .array(z.object({ itemVnum: int(1), ...dropRange }).superRefine(checkRange))
    .max(200, 'Bir grupta en fazla 200 satır olabilir.')
    .default([]),
});

export type DropRowInput = z.infer<typeof dropRowSchema>;
export type LevelDropInput = z.infer<typeof levelDropSchema>;
export type DropGroupInput = z.infer<typeof dropGroupInputSchema>;

export const simulateSchema = z.object({
  kills: int(1, 100_000).default(10_000),
  playerLevel: int(1, 250).optional(),
  seed: int(0, 2_147_483_647).optional(),
});
