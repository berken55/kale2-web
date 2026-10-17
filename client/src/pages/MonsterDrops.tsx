import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MONSTER_RANKS, labelOf } from '@shared/constants';
import { formatPct } from '@shared/drops';
import type { DropGroupSummary, DropItemRef, DropRow, DropSimulationResponse, MonsterDropsResponse } from '@shared/types';
import { api } from '../api';
import { DropRowsEditor, emptyRange } from '../components/drops';
import { ItemIcon, Spinner, useToast } from '../components/ui';

export type DropState = MonsterDropsResponse;

const n = (v: number, digits = 2) => v.toLocaleString('tr-TR', { maximumFractionDigits: digits });

/** "Yaklaşık kaç öldürmede bir" — 1'den küçük beklentiler için okunur özet */
function perKills(expected: number) {
  if (expected <= 0) return '—';
  if (expected >= 1) return `öldürme başına ${n(expected)}`;
  return `~${n(1 / expected, 0)} öldürmede bir`;
}

export function DropsTab({
  monster,
  value,
  onChange,
  groups,
  dirty,
  error,
}: {
  monster: { id: number; level: number; rank: string };
  value: DropState;
  onChange: (v: DropState) => void;
  groups: DropGroupSummary[];
  dirty: boolean;
  error?: string;
}) {
  const addItemRef = (item: DropItemRef) => onChange({ ...value, items: { ...value.items, [item.vnum]: item } });

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-slate-300">Bu yaratığın dropları</h3>
        <p className="mb-3 mt-0.5 text-xs text-slate-500">
          Her satır öldürmede ayrı zar atar. Şans, oyuncu yaratıktan 5+ seviye yüksekse düşer (5: ×0,8 · 10: ×0,5 · 15: ×0,1). Grup satırı tetiklenince grubun
          kendi kuralıyla item seçilir.
        </p>
        <DropRowsEditor<DropRow>
          rows={value.drops}
          onChange={(drops) => onChange({ ...value, drops })}
          items={value.items}
          onItemRef={addItemRef}
          groups={groups}
          newRow={(target) => ({ ...target, ...emptyRange(target.groupId ? 1_000_000 : 10_000) })}
        />
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-300">Genel droplar</h3>
          <Link to="/admin/level-drops" className="text-xs text-gold-400 hover:text-gold-300">
            Genel drop tablosunu düzenle →
          </Link>
        </div>
        <p className="mb-3 mt-0.5 text-xs text-slate-500">
          Seviye {monster.level} · {labelOf(MONSTER_RANKS, monster.rank)} yaratıklarına uygulanan satırlar (kayıtlı seviye ve rütbeye göre).
        </p>
        {value.levelDrops.length === 0 ? (
          <p className="text-sm text-slate-500">Bu yaratığa uygulanan genel drop yok.</p>
        ) : (
          <ul className="divide-y divide-white/5 text-sm">
            {value.levelDrops.map((d, i) => {
              const item = d.itemVnum !== null ? value.items[d.itemVnum] : undefined;
              const group = d.groupId !== null ? value.groups[d.groupId] : undefined;
              return (
                <li key={i} className="flex items-center gap-2 py-2">
                  {item ? <ItemIcon url={item.iconUrl} name={item.name} rarity={item.rarity} size={24} /> : <span className="rounded bg-gold-500/10 px-1.5 py-0.5 text-[11px] text-gold-300">Grup</span>}
                  <span className="text-slate-200">{item?.name ?? group?.name ?? '?'}</span>
                  <span className="text-xs text-slate-500">
                    Sv. {d.levelMin}–{d.levelMax}
                  </span>
                  <span className="ml-auto tabular-nums text-slate-300">{formatPct(d.chancePpm)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Simulator monster={monster} dirty={dirty} />
    </div>
  );
}

function Simulator({ monster, dirty }: { monster: { id: number; level: number }; dirty: boolean }) {
  const toast = useToast();
  const [kills, setKills] = useState(10_000);
  const [playerLevel, setPlayerLevel] = useState(monster.level);
  const [result, setResult] = useState<DropSimulationResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setResult(await api.post<DropSimulationResponse>(`/api/monsters/${monster.id}/simulate-drops`, { kills, playerLevel }));
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <h3 className="text-sm font-semibold text-slate-300">Drop simülatörü</h3>
      <p className="mb-3 mt-0.5 text-xs text-slate-500">Yaratığı birçok kez öldürüp ne çıktığını gösterir. Kayıtlı droplar kullanılır.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label">Öldürme</span>
          <select className="input w-auto" value={kills} onChange={(e) => setKills(Number(e.target.value))}>
            {[1_000, 10_000, 100_000].map((k) => (
              <option key={k} value={k}>
                {k.toLocaleString('tr-TR')}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Oyuncu seviyesi</span>
          <input className="input w-24 tabular-nums" type="number" min={1} max={250} value={playerLevel} onChange={(e) => setPlayerLevel(Math.max(1, Math.min(250, Number(e.target.value) || 1)))} />
        </label>
        <button className="btn-primary" onClick={run} disabled={busy || dirty} title={dirty ? 'Önce değişiklikleri kaydedin' : undefined}>
          {busy && <Spinner />}
          Simüle et
        </button>
        {dirty && <span className="text-xs text-amber-200">Kaydedilmemiş değişiklikler var; simülasyon kayıtlı dropları kullanır.</span>}
      </div>

      {result && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-slate-400">
            {result.kills.toLocaleString('tr-TR')} öldürme · oyuncu Sv. {result.playerLevel} · şans çarpanı ×{n(result.multiplier)} · hiçbir şey düşmeyen öldürme %
            {n((result.emptyKills / result.kills) * 100, 1)}
          </p>
          {result.lines.length === 0 ? (
            <p className="text-sm text-slate-500">Bu yaratık hiçbir şey düşürmüyor.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="border-b border-white/5">
                  <tr>
                    <th className="table-head">Item</th>
                    <th className="table-head text-right">Toplam</th>
                    <th className="table-head text-right">Düştüğü öldürme</th>
                    <th className="table-head">Beklenen</th>
                    <th className="table-head">Yükseltme</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {result.lines.map((l) => (
                    <tr key={l.item.vnum}>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <ItemIcon url={l.item.iconUrl} name={l.item.name} rarity={l.item.rarity} size={24} />
                          <span className="text-slate-100">{l.item.name}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{l.total.toLocaleString('tr-TR')}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">%{n((l.killsWithDrop / result.kills) * 100, 2)}</td>
                      <td className="py-2 pr-3 text-slate-300">{perKills(l.expectedPerKill)}</td>
                      <td className="py-2 text-xs text-slate-400">
                        {Object.entries(l.upgrades)
                          .filter(([lvl]) => lvl !== '0' || Object.keys(l.upgrades).length > 1)
                          .map(([lvl, c]) => `+${lvl}: ${c}`)
                          .join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
