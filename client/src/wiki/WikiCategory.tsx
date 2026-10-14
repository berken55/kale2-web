import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CLASSES, ITEM_TYPES, labelOf, subtypeLabel } from '@shared/constants';
import type { Item, WikiItemListResponse } from '@shared/types';
import { maxLevel, statsAtLevel } from '@shared/upgrade';
import { api } from '../api';
import { EmptyState, ItemIcon, Spinner, rarityColor } from '../components/ui';
import { ClassPills, findCategory, range } from './common';
import { WikiError } from './WikiHome';

const LEVELS = Array.from({ length: 10 }, (_, i) => i);

/** Kategori veya arama sonucu listesi; seçilen +N seviyesindeki değerleri gösterir. */
export function WikiCategory({ searchMode = false }: { searchMode?: boolean }) {
  const { type, subtype } = useParams();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<WikiItemListResponse | null>(null);
  const [error, setError] = useState('');
  const found = findCategory(type, subtype);
  const level = Math.min(9, Math.max(0, Number(params.get('lvl') ?? 0)));
  const cls = params.get('class') ?? '';
  const q = params.get('q') ?? '';

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (!searchMode && !found) return;
    setData(null);
    const query = new URLSearchParams({ pageSize: '100', sort: 'level' });
    if (found) {
      query.set('type', found.category.type);
      query.set('subtype', found.category.subtype);
    }
    if (searchMode) query.set('search', q);
    if (cls) query.set('class', cls);
    api
      .get<WikiItemListResponse>(`/api/public/items?${query}`)
      .then(setData)
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, subtype, q, cls, searchMode]);

  if (error) return <WikiError message={error} />;
  if (!searchMode && !found) return <EmptyState title="Kategori bulunamadı" />;

  const items = data?.items ?? [];
  const showAttack = searchMode ? items.some((i) => i.stats.maxAttack > 0) : found!.category.type === 'WEAPON';
  const showMagic = items.some((i) => i.stats.maxMagicAttack > 0);
  const showDefense = items.some((i) => i.stats.defense > 0 || i.upgrades.some((u) => u.defenseBonus > 0));
  const showSpeed = items.some((i) => i.stats.attackSpeed !== 0);

  return (
    <>
      <nav className="mb-2 text-xs text-slate-500">
        <Link to="/wiki" className="hover:text-gold-300">
          Wiki
        </Link>
        {found && (
          <>
            {' / '}
            {found.group.label}
          </>
        )}
      </nav>
      <h1 className="font-display text-2xl text-gold-300">{searchMode ? `“${q}” için sonuçlar` : found!.category.label}</h1>
      <p className="mt-1 text-sm text-slate-400">{data ? `${data.total} item` : ' '}</p>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-500">Seviye</span>
          <div className="flex overflow-hidden rounded-lg border border-white/10" role="radiogroup" aria-label="Gösterilen yükseltme seviyesi">
            {LEVELS.map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={l === level}
                onClick={() => setParam('lvl', l ? String(l) : '')}
                className={`px-2.5 py-1.5 font-display text-sm tabular-nums transition ${
                  l === level ? 'bg-gold-500 text-ink-950' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                +{l}
              </button>
            ))}
          </div>
        </div>
        <select className="input w-auto" aria-label="Sınıf" value={cls} onChange={(e) => setParam('class', e.target.value)}>
          <option value="">Tüm sınıflar</option>
          {CLASSES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card mt-4 overflow-hidden">
        {!data ? (
          <div className="p-6">
            <Spinner className="text-gold-400" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState title="Item bulunamadı" text={searchMode ? 'Başka bir isim veya vnum deneyin.' : 'Bu kategoride henüz item yok.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-white/5 bg-white/[0.02]">
                <tr>
                  <th className="table-head">Item</th>
                  <th className="table-head">Seviye</th>
                  <th className="table-head">Sınıf</th>
                  {showAttack && <th className="table-head">Saldırı Değeri</th>}
                  {showMagic && <th className="table-head">Büyülü Saldırı</th>}
                  {showDefense && <th className="table-head">Savunma</th>}
                  {showSpeed && <th className="table-head">Hız</th>}
                  <th className="table-head">Yükseltme</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((item) => (
                  <Row key={item.id} item={item} level={level} cols={{ showAttack, showMagic, showDefense, showSpeed }} searchMode={searchMode} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && items.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">Seçilen seviyeye kadar yükseltilemeyen itemlerde, ulaşabildiği en yüksek seviyenin değerleri soluk renkle gösterilir.</p>
      )}
    </>
  );
}

function Row({
  item,
  level,
  cols,
  searchMode,
}: {
  item: Item;
  level: number;
  cols: { showAttack: boolean; showMagic: boolean; showDefense: boolean; showSpeed: boolean };
  searchMode: boolean;
}) {
  const max = maxLevel(item);
  const effective = Math.min(level, max);
  const capped = effective < level;
  const s = statsAtLevel(item, effective);
  const href = `/wiki/item/${item.vnum}${effective ? `?lvl=${effective}` : ''}`;
  const dim = capped ? 'text-slate-500' : 'text-slate-200';
  return (
    <tr className="hover:bg-white/[0.02]">
      <td className="table-cell">
        <Link to={href} className="flex items-center gap-3">
          <ItemIcon url={item.iconUrl} name={item.name} rarity={item.rarity} size={36} />
          <span>
            <span className="font-medium hover:underline" style={{ color: rarityColor(item.rarity) }}>
              {item.name}
              {effective > 0 && `+${effective}`}
            </span>
            <span className="block text-xs text-slate-500">
              {searchMode ? `${labelOf(ITEM_TYPES, item.type)} · ${subtypeLabel(item.type, item.subtype)}` : `#${item.vnum + effective}`}
            </span>
          </span>
        </Link>
      </td>
      <td className="table-cell tabular-nums">{item.levelRequired || '—'}</td>
      <td className="table-cell">
        <ClassPills classes={item.classes} />
      </td>
      {cols.showAttack && <td className={`table-cell whitespace-nowrap tabular-nums ${dim}`}>{range(s.minAttack, s.maxAttack)}</td>}
      {cols.showMagic && <td className={`table-cell whitespace-nowrap tabular-nums ${dim}`}>{range(s.minMagicAttack, s.maxMagicAttack)}</td>}
      {cols.showDefense && <td className={`table-cell whitespace-nowrap tabular-nums ${dim}`}>{s.defense || '—'}</td>}
      {cols.showSpeed && <td className="table-cell tabular-nums text-slate-400">{item.stats.attackSpeed ? `%${item.stats.attackSpeed}` : '—'}</td>}
      <td className="table-cell text-xs text-slate-400">{max > 0 ? `+0 … +${max}` : 'Yok'}</td>
    </tr>
  );
}
