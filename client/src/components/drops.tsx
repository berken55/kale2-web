import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MAX_UPGRADE_LEVEL } from '@shared/constants';
import { formatPct, pctToPpm, ppmToPct } from '@shared/drops';
import type { DropGroupSummary, DropItemRef, DropRangeFields, ItemListResponse } from '@shared/types';
import { api } from '../api';
import { ItemIcon, Spinner } from './ui';

/** Yüzde girilir, ppm saklanır. Yazarken "0,05" gibi ara değerler bozulmasın diye metin olarak tutulur. */
export function PctInput({ ppm, onChange, weight = false, className = '' }: { ppm: number; onChange: (ppm: number) => void; weight?: boolean; className?: string }) {
  const show = (v: number) => (weight ? String(v) : String(ppmToPct(v)).replace('.', ','));
  const [text, setText] = useState(show(ppm));
  const last = useRef(ppm);
  useEffect(() => {
    if (ppm !== last.current) setText(show(ppm));
    last.current = ppm;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ppm]);
  return (
    <div className="relative">
      {!weight && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">%</span>}
      <input
        className={`input tabular-nums ${weight ? '' : 'pl-6'} ${className}`}
        inputMode="decimal"
        aria-label={weight ? 'Ağırlık' : 'Şans (%)'}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(',', '.'));
          if (e.target.value.trim() === '' || !Number.isFinite(n)) return;
          const next = weight ? Math.max(0, Math.min(1_000_000, Math.round(n))) : Math.max(0, Math.min(1_000_000, pctToPpm(n)));
          last.current = next;
          onChange(next);
        }}
        onBlur={() => setText(show(ppm))}
      />
    </div>
  );
}

/** Panelde tanımlı itemlerde isim / vnum ile arama yapan seçici. */
export function ItemPicker({ onPick, placeholder = 'Item ekle: isim veya vnum…' }: { onPick: (item: DropItemRef) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DropItemRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get<ItemListResponse>(`/api/items?search=${encodeURIComponent(q.trim())}&pageSize=8&sort=name`)
        .then((r) => setResults(r.items.map((i) => ({ vnum: i.vnum, name: i.name, rarity: i.rarity, type: i.type, iconUrl: i.iconUrl }))))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <input
        className="input"
        placeholder={placeholder}
        aria-label="Item ara"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {loading && <Spinner className="absolute right-3 top-3 text-brand-400" />}
      {open && q.trim() && !loading && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-white/10 bg-ink-900 shadow-xl">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">Eşleşen item yok. Önce Itemler sayfasında tanımlayın.</div>
          ) : (
            results.map((r) => (
              <button
                key={r.vnum}
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/5"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(r);
                  setQ('');
                  setOpen(false);
                }}
              >
                <ItemIcon url={r.iconUrl} name={r.name} rarity={r.rarity} size={28} />
                <span className="text-slate-100">{r.name}</span>
                <span className="ml-auto text-xs tabular-nums text-slate-500">#{r.vnum}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type Row = DropRangeFields & { itemVnum: number | null; groupId?: number | null };

function MinMax({ min, max, lo, hi, onChange, label }: { min: number; max: number; lo: number; hi: number; onChange: (min: number, max: number) => void; label: string }) {
  const clamp = (v: number) => Math.max(lo, Math.min(hi, Math.round(v) || lo));
  return (
    <div className="flex items-center gap-1">
      <input className="input w-16 px-2 tabular-nums" type="number" min={lo} max={hi} aria-label={`${label} min`} value={min} onChange={(e) => {
        const v = clamp(Number(e.target.value));
        onChange(v, Math.max(v, max));
      }} />
      <span className="text-slate-600">–</span>
      <input className="input w-16 px-2 tabular-nums" type="number" min={lo} max={hi} aria-label={`${label} max`} value={max} onChange={(e) => {
        const v = clamp(Number(e.target.value));
        onChange(Math.min(min, v), v);
      }} />
    </div>
  );
}

/**
 * Drop satırları tablosu: yaratık dropları, genel droplar ve grup satırları aynı bileşeni kullanır.
 * `groups` verilirse satır olarak drop grubu da eklenebilir; `weight` ONE_OF grupları için ağırlık gösterir.
 */
export function DropRowsEditor<T extends Row>({
  rows,
  onChange,
  items,
  onItemRef,
  groups,
  weight = false,
  newRow,
  extra,
  showUpgrade = true,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  items: Record<number, DropItemRef>;
  onItemRef: (item: DropItemRef) => void;
  groups?: DropGroupSummary[];
  weight?: boolean;
  newRow: (target: { itemVnum: number | null; groupId: number | null }) => T;
  extra?: { head: string[]; cells: (row: T, set: (patch: Partial<T>) => void) => ReactNode[] };
  showUpgrade?: boolean;
}) {
  const set = (i: number, patch: Partial<T>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const totalWeight = weight ? rows.reduce((s, r) => s + r.chancePpm, 0) : 0;
  const usableGroups = groups?.filter((g) => !rows.some((r) => r.groupId === g.id)) ?? [];

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-white/5">
              <tr>
                <th className="table-head">Drop</th>
                {extra?.head.map((h) => (
                  <th key={h} className="table-head">
                    {h}
                  </th>
                ))}
                <th className="table-head">{weight ? 'Ağırlık' : 'Şans'}</th>
                <th className="table-head">Adet</th>
                {showUpgrade && <th className="table-head">Yükseltme</th>}
                <th className="table-head" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r, i) => {
                const item = r.itemVnum !== null ? items[r.itemVnum] : undefined;
                const group = r.groupId ? groups?.find((g) => g.id === r.groupId) : undefined;
                return (
                  <tr key={i}>
                    <td className="py-2 pr-3">
                      {item ? (
                        <div className="flex items-center gap-2">
                          <ItemIcon url={item.iconUrl} name={item.name} rarity={item.rarity} size={28} />
                          <span className="text-slate-100">{item.name}</span>
                          <span className="text-xs tabular-nums text-slate-500">#{item.vnum}</span>
                        </div>
                      ) : r.groupId ? (
                        <div>
                          <span className="rounded bg-brand-500/10 px-1.5 py-0.5 text-[11px] text-brand-300">Grup</span>{' '}
                          <a href={`/admin/drop-groups/${r.groupId}`} target="_blank" rel="noreferrer" className="text-slate-100 hover:text-brand-300">
                            {group?.name ?? `#${r.groupId}`}
                          </a>
                          {group && <span className="ml-1 text-xs text-slate-500">({group.entryCount} item)</span>}
                        </div>
                      ) : (
                        <span className="text-red-300">#{r.itemVnum} (tanımsız)</span>
                      )}
                    </td>
                    {extra?.cells(r, (patch) => set(i, patch)).map((c, k) => (
                      <td key={k} className="py-2 pr-3">
                        {c}
                      </td>
                    ))}
                    <td className="w-36 py-2 pr-3">
                      <PctInput ppm={r.chancePpm} weight={weight} onChange={(v) => set(i, { chancePpm: v } as Partial<T>)} />
                      {weight && totalWeight > 0 && <div className="mt-0.5 text-[11px] text-slate-500">{formatPct(Math.round((r.chancePpm / totalWeight) * 1_000_000))} seçilir</div>}
                    </td>
                    <td className="py-2 pr-3">
                      {r.groupId ? (
                        <span className="text-xs text-slate-600">grupta</span>
                      ) : (
                        <MinMax label="Adet" min={r.countMin} max={r.countMax} lo={1} hi={10_000} onChange={(a, b) => set(i, { countMin: a, countMax: b } as Partial<T>)} />
                      )}
                    </td>
                    {showUpgrade && (
                      <td className="py-2 pr-3">
                        {r.groupId || (item && !['WEAPON', 'ARMOR'].includes(item.type)) ? (
                          <span className="text-xs text-slate-600">—</span>
                        ) : (
                          <MinMax label="Yükseltme" min={r.upgradeMin} max={r.upgradeMax} lo={0} hi={MAX_UPGRADE_LEVEL} onChange={(a, b) => set(i, { upgradeMin: a, upgradeMax: b } as Partial<T>)} />
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap py-2 text-right">
                      <button type="button" className="px-1.5 text-slate-500 hover:text-slate-200" aria-label="Yukarı taşı" onClick={() => move(i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="px-1.5 text-slate-500 hover:text-slate-200" aria-label="Aşağı taşı" onClick={() => move(i, 1)}>
                        ↓
                      </button>
                      <button type="button" className="ml-1 px-1.5 text-red-400 hover:text-red-300" aria-label="Satırı sil" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <ItemPicker
          onPick={(item) => {
            onItemRef(item);
            onChange([...rows, newRow({ itemVnum: item.vnum, groupId: null })]);
          }}
        />
        {groups && (
          <select
            className="input"
            aria-label="Drop grubu ekle"
            value=""
            disabled={!usableGroups.length}
            onChange={(e) => e.target.value && onChange([...rows, newRow({ itemVnum: null, groupId: Number(e.target.value) })])}
          >
            <option value="">{groups.length ? '+ Drop grubu ekle' : 'Henüz drop grubu yok'}</option>
            {usableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.entryCount} item)
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export const emptyRange = (chancePpm: number) => ({ chancePpm, countMin: 1, countMax: 1, upgradeMin: 0, upgradeMax: 0 });
