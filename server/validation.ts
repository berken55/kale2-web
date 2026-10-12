import { z } from 'zod';
import {
  CLASSES,
  GENDERS,
  ITEM_SUBTYPES,
  ITEM_TYPES,
  MAX_UPGRADE_LEVEL,
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
