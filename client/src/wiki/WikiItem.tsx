import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CLASSES, GENDERS, ITEM_TYPES, labelOf, subtypeLabel } from '@shared/constants';
import type { WikiItemDetail } from '@shared/types';
import { availableLevels, maxLevel, statsAtLevel } from '@shared/upgrade';
import { api, ApiError } from '../api';
import { ItemTooltip } from '../components/ItemTooltip';
import { ModelViewer } from '../components/LazyModelViewer';
import { EmptyState, ItemIcon, Spinner, rarityColor } from '../components/ui';
import { ClassPills, findCategory, formatNumber, range } from './common';
import { WikiError } from './WikiHome';

export function WikiItem() {
  const { vnum } = useParams();
  const [params, setParams] = useSearchParams();
  const [detail, setDetail] = useState<WikiItemDetail | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    api
      .get<WikiItemDetail>(`/api/public/items/${vnum}`)
      .then((d) => {
        setDetail(d);
        // /wiki/item/19 gibi bir seviye vnum'u ile gelindiyse o seviyeyi seç
        if (d.level > 0 && !params.get('lvl')) setParams({ lvl: String(d.level) }, { replace: true });
      })
      .catch((e: ApiError) => setError({ status: e.status, message: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vnum]);

  if (error?.status === 404) {
    return (
      <EmptyState
        title="Item bulunamadı"
        text={`#${vnum} numaralı bir item yok.`}
        action={
          <Link to="/wiki" className="btn-ghost">
            Wiki ana sayfası
          </Link>
        }
      />
    );
  }
  if (error) return <WikiError message={error.message} />;
  if (!detail) return <Spinner className="text-brand-400" />;

  const { item, bonusTypes, materials } = detail;
  const levels = availableLevels(item);
  const top = maxLevel(item);
  const requested = Number(params.get('lvl') ?? 0);
  const level = levels.includes(requested) ? requested : 0;
  const cat = findCategory(item.type, item.subtype);
  const color = rarityColor(item.rarity);
  const sorted = [...item.upgrades].sort((a, b) => a.level - b.level);
  const showAttack = item.stats.maxAttack > 0;
  const showMagic = item.stats.maxMagicAttack > 0;
  const showDefense = item.stats.defense > 0 || item.upgrades.some((u) => u.defenseBonus > 0);
  const current = statsAtLevel(item, level);

  const selectLevel = (l: number) => setParams(l ? { lvl: String(l) } : {}, { replace: true });

  let cumulative = 0;

  return (
    <>
      <nav className="mb-3 text-xs text-slate-500">
        <Link to="/wiki" className="hover:text-brand-300">
          Wiki
        </Link>
        {cat && (
          <>
            {' / '}
            {cat.group.label}
            {' / '}
            <Link to={cat.category.path} className="hover:text-brand-300">
              {cat.category.label}
            </Link>
          </>
        )}
      </nav>

      <div className="flex flex-wrap items-center gap-4">
        <ItemIcon url={item.iconUrl} name={item.name} rarity={item.rarity} size={64} />
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl" style={{ color }}>
            {item.name}
            {level > 0 && <span className="text-brand-300">+{level}</span>}
          </h1>
          <p className="text-sm text-slate-400">
            {labelOf(ITEM_TYPES, item.type)} · {subtypeLabel(item.type, item.subtype)} · Vnum #{item.vnum + level}
          </p>
        </div>
      </div>

      {levels.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Yükseltme seviyesi">
          {Array.from({ length: Math.max(top, 9) + 1 }, (_, l) => l).map((l) => {
            const ok = levels.includes(l);
            return (
              <button
                key={l}
                role="radio"
                aria-checked={l === level}
                disabled={!ok}
                onClick={() => selectLevel(l)}
                className={`min-w-[46px] rounded-lg border px-3 py-2 font-display text-sm tabular-nums transition ${
                  l === level
                    ? 'border-brand-400 bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                    : ok
                      ? 'border-white/10 bg-ink-850 text-slate-300 hover:border-brand-500/50 hover:text-brand-300'
                      : 'cursor-not-allowed border-white/5 text-slate-700'
                }`}
              >
                +{l}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ItemTooltip {...item} bonusTypes={bonusTypes} upgradeLevel={level} />
          {item.modelUrl && <ModelViewer url={item.modelUrl} className="aspect-[4/5]" />}
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">+{level} değerleri</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {showAttack && <Stat label="Saldırı Değeri" value={range(current.minAttack, current.maxAttack)} />}
              {showMagic && <Stat label="Büyülü Saldırı" value={range(current.minMagicAttack, current.maxMagicAttack)} />}
              {showDefense && <Stat label="Savunma" value={String(current.defense)} />}
              {item.stats.attackSpeed !== 0 && <Stat label="Saldırı Hızı" value={`%${item.stats.attackSpeed}`} />}
              <Stat label="Gereken Seviye" value={item.levelRequired ? String(item.levelRequired) : '—'} />
            </dl>
          </section>

          <section className="card grid gap-6 p-5 sm:grid-cols-2">
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Bilgiler</h2>
              <dl className="space-y-2 text-sm">
                <Info label="Kullanabilen">
                  <ClassPills classes={item.classes} />
                </Info>
                {item.classes.length > 0 && (
                  <Info label="">
                    <span className="text-xs text-slate-500">{item.classes.map((c) => labelOf(CLASSES, c)).join(', ')}</span>
                  </Info>
                )}
                <Info label="Cinsiyet">{labelOf(GENDERS, item.gender)}</Info>
                <Info label="Satış fiyatı">{item.sellPrice ? `${formatNumber(item.sellPrice)} Yang` : '—'}</Info>
                {item.buyPrice > 0 && <Info label="Mağaza fiyatı">{formatNumber(item.buyPrice)} Yang</Info>}
                {item.stackSize > 1 && <Info label="Yığın">{item.stackSize}</Info>}
                <Info label="Ticaret">{item.tradable ? 'Yapılabilir' : 'Yapılamaz'}</Info>
              </dl>
            </div>
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Bonuslar</h2>
              {item.bonuses.length === 0 ? (
                <p className="text-sm text-slate-500">Sabit bonus yok.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {item.bonuses.map((b) => {
                    const bt = bonusTypes.find((x) => x.id === b.bonusTypeId);
                    return (
                      <li key={b.bonusTypeId} className="flex justify-between gap-3 text-[#8fc6ff]">
                        <span>{bt?.name}</span>
                        <span className="tabular-nums">
                          {b.value > 0 ? '+' : ''}
                          {b.value}
                          {bt?.unit}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="font-display text-lg text-brand-300">Yükseltme Tablosu</h2>
          <p className="text-xs text-slate-500">Her seviyedeki toplam değerler, demirci başarı şansı, Yang maliyeti ve gerekli malzemeler. Bir satıra tıklayarak o seviyeyi seçin.</p>
        </div>
        {sorted.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Bu item yükseltilemez.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="table-head">Seviye</th>
                  <th className="table-head">Vnum</th>
                  {showAttack && <th className="table-head">Saldırı</th>}
                  {showMagic && <th className="table-head">Büyülü Saldırı</th>}
                  {showDefense && <th className="table-head">Savunma</th>}
                  <th className="table-head">Başarı Şansı</th>
                  <th className="table-head text-right">Yang</th>
                  <th className="table-head text-right">Toplam Yang</th>
                  <th className="table-head">Malzemeler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sorted.map((u) => {
                  const s = statsAtLevel(item, u.level);
                  cumulative += u.cost;
                  const active = u.level === level;
                  return (
                    <tr
                      key={u.level}
                      onClick={() => selectLevel(u.level)}
                      className={`cursor-pointer transition ${active ? 'bg-brand-500/10' : 'hover:bg-white/[0.03]'}`}
                    >
                      <td className={`table-cell font-display ${active ? 'text-brand-300' : 'text-slate-300'}`}>+{u.level}</td>
                      <td className="table-cell tabular-nums text-slate-500">{item.vnum + u.level}</td>
                      {showAttack && (
                        <td className="table-cell whitespace-nowrap tabular-nums">
                          {range(s.minAttack, s.maxAttack)}
                          {u.attackBonus > 0 && <span className="ml-1.5 text-xs text-emerald-400">+{u.attackBonus}</span>}
                        </td>
                      )}
                      {showMagic && (
                        <td className="table-cell whitespace-nowrap tabular-nums">
                          {range(s.minMagicAttack, s.maxMagicAttack)}
                          {u.magicAttackBonus > 0 && <span className="ml-1.5 text-xs text-emerald-400">+{u.magicAttackBonus}</span>}
                        </td>
                      )}
                      {showDefense && (
                        <td className="table-cell whitespace-nowrap tabular-nums">
                          {s.defense}
                          {u.defenseBonus > 0 && <span className="ml-1.5 text-xs text-emerald-400">+{u.defenseBonus}</span>}
                        </td>
                      )}
                      <td className="table-cell">
                        {u.level === 0 ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${u.successRate}%`, background: u.successRate >= 70 ? '#34d399' : u.successRate >= 40 ? '#fbbf24' : '#f87171' }}
                              />
                            </div>
                            <span className="tabular-nums text-sm">%{u.successRate}</span>
                          </div>
                        )}
                      </td>
                      <td className="table-cell text-right tabular-nums">{u.cost ? formatNumber(u.cost) : '—'}</td>
                      <td className="table-cell text-right tabular-nums text-slate-400">{cumulative ? formatNumber(cumulative) : '—'}</td>
                      <td className="table-cell">
                        {u.materials.length === 0 ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {u.materials.map((m, i) => {
                              const ref = materials[m.vnum];
                              const chip = (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-ink-850 py-0.5 pl-0.5 pr-2 text-xs">
                                  <ItemIcon url={ref?.iconUrl ?? null} name={ref?.name ?? '?'} rarity={ref?.rarity ?? 'COMMON'} size={20} />
                                  <span className="text-slate-300">{ref?.name ?? `#${m.vnum}`}</span>
                                  <span className="text-slate-500">×{m.count}</span>
                                </span>
                              );
                              return ref ? (
                                <Link key={i} to={`/wiki/item/${m.vnum}`} onClick={(e) => e.stopPropagation()} className="hover:brightness-125">
                                  {chip}
                                </Link>
                              ) : (
                                <span key={i}>{chip}</span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {item.description && <p className="mt-6 text-sm italic text-slate-400">{item.description}</p>}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-ink-850 p-3">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-display text-lg tabular-nums text-slate-100">{value}</dd>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-200">{children}</dd>
    </div>
  );
}
