import { CLASSES, GENDERS, labelOf, subtypeLabel } from '@shared/constants';
import type { BonusType, ItemBonus, ItemStats, ItemUpgrade } from '@shared/types';
import { ItemIcon, rarityColor } from './ui';

interface Props {
  name: string;
  type: string;
  subtype: string;
  rarity: string;
  levelRequired: number;
  classes: string[];
  gender: string;
  stats: ItemStats;
  bonuses: ItemBonus[];
  upgrades: ItemUpgrade[];
  bonusTypes: BonusType[];
  description: string;
  iconUrl: string | null;
  sellPrice: number;
  upgradeLevel: number;
}

/** Oyun içi item açıklama kutusunun (tooltip) önizlemesi. */
export function ItemTooltip(p: Props) {
  const color = rarityColor(p.rarity);
  const up = p.upgrades.find((u) => u.level === p.upgradeLevel);
  const atk = up?.attackBonus ?? 0;
  const matk = up?.magicAttackBonus ?? 0;
  const def = up?.defenseBonus ?? 0;
  const s = p.stats;
  const allowed = p.classes.length ? p.classes.map((c) => labelOf(CLASSES, c)) : null;

  return (
    <div className="rounded-lg border border-[#5c4a26] bg-[#0d0b08]/95 p-4 font-sans text-[13px] leading-relaxed shadow-2xl shadow-black/50">
      <div className="flex items-start gap-3">
        <ItemIcon url={p.iconUrl} name={p.name || '?'} rarity={p.rarity} size={44} />
        <div className="min-w-0">
          <div className="truncate font-semibold" style={{ color }}>
            {p.name || 'İsimsiz item'}
            {p.upgradeLevel > 0 && `+${p.upgradeLevel}`}
          </div>
          <div className="text-xs text-slate-400">{subtypeLabel(p.type, p.subtype)}</div>
        </div>
      </div>

      <div className="my-3 h-px bg-gradient-to-r from-transparent via-[#5c4a26] to-transparent" />

      <div className="space-y-0.5 text-center">
        {p.levelRequired > 0 && <div className="text-slate-300">Seviye: {p.levelRequired}</div>}
        {s.maxAttack > 0 && (
          <div className="text-slate-200">
            Saldırı Değeri {s.minAttack + atk} - {s.maxAttack + atk}
          </div>
        )}
        {s.maxMagicAttack > 0 && (
          <div className="text-slate-200">
            Büyülü Saldırı Değeri {s.minMagicAttack + matk} - {s.maxMagicAttack + matk}
          </div>
        )}
        {s.defense + def > 0 && <div className="text-slate-200">Savunma {s.defense + def}</div>}
        {s.attackSpeed !== 0 && (
          <div className="text-slate-200">
            Saldırı Hızı {s.attackSpeed > 0 ? '+' : ''}
            {s.attackSpeed}%
          </div>
        )}
        {p.bonuses.map((b) => {
          const bt = p.bonusTypes.find((x) => x.id === b.bonusTypeId);
          if (!bt) return null;
          return (
            <div key={b.bonusTypeId} className="text-[#8fc6ff]">
              {bt.name} {b.value > 0 ? '+' : ''}
              {b.value}
              {bt.unit}
            </div>
          );
        })}
        {p.description && <div className="pt-2 text-xs italic text-slate-400">{p.description}</div>}
      </div>

      <div className="my-3 h-px bg-gradient-to-r from-transparent via-[#5c4a26] to-transparent" />

      <div className="space-y-0.5 text-center text-xs">
        <div className="text-slate-400">
          {allowed ? (
            <>
              [Kullanılabilir] <span className="text-[#e6d38c]">{allowed.join(', ')}</span>
            </>
          ) : (
            'Tüm sınıflar kullanabilir'
          )}
        </div>
        {p.gender !== 'ANY' && <div className="text-slate-400">Cinsiyet: {labelOf(GENDERS, p.gender)}</div>}
        {up && p.upgradeLevel > 0 && (
          <div className="text-slate-500">
            Yükseltme başarı şansı: %{up.successRate} · {up.cost.toLocaleString('tr-TR')} Yang
          </div>
        )}
        {p.sellPrice > 0 && <div className="text-[#e6d38c]">Satış: {p.sellPrice.toLocaleString('tr-TR')} Yang</div>}
      </div>
    </div>
  );
}
