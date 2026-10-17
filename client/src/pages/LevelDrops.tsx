import { useEffect, useState } from 'react';
import { MONSTER_RANKS } from '@shared/constants';
import type { DropGroupSummary, DropItemRef, LevelDrop, LevelDropsResponse } from '@shared/types';
import { api } from '../api';
import { DropRowsEditor, emptyRange } from '../components/drops';
import { PageHeader, Spinner, useToast } from '../components/ui';

const RANK_SHORT: Record<string, string> = { NORMAL: 'Nor', ELITE: 'Seç', BOSS: 'Boss', KING: 'Kral', STONE: 'Taş', NPC: 'NPC' };

/** Seviye aralığına göre her yaratıkta geçerli genel drop tablosu (Metin2 common_drop_item). */
export function LevelDropsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<LevelDrop[] | null>(null);
  const [saved, setSaved] = useState('');
  const [items, setItems] = useState<Record<number, DropItemRef>>({});
  const [groups, setGroups] = useState<DropGroupSummary[]>([]);
  const [saving, setSaving] = useState(false);

  const apply = (r: LevelDropsResponse) => {
    setRows(r.levelDrops);
    setSaved(JSON.stringify(r.levelDrops));
    setItems(r.items);
  };

  useEffect(() => {
    api.get<LevelDropsResponse>('/api/level-drops').then(apply).catch((e) => toast('error', e.message));
    api.get<DropGroupSummary[]>('/api/drop-groups').then(setGroups).catch(() => {});
  }, [toast]);

  const dirty = rows !== null && JSON.stringify(rows) !== saved;

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    try {
      apply(await api.put<LevelDropsResponse>('/api/level-drops', { levelDrops: rows }));
      toast('success', 'Genel drop tablosu kaydedildi.');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Genel Drop"
        subtitle="Seviyesi aralıkta olan ve rütbesi seçili her yaratıkta ayrıca zar atılır (iksirler, yükseltme taşları, ruh taşları…)"
        actions={
          <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
            {saving && <Spinner />}
            {dirty ? 'Kaydet' : 'Kaydedildi'}
          </button>
        }
      />
      <div className="card p-5 sm:p-6">
        {!rows ? (
          <Spinner className="text-gold-400" />
        ) : (
          <DropRowsEditor<LevelDrop>
            rows={rows}
            onChange={setRows}
            items={items}
            onItemRef={(i) => setItems((cur) => ({ ...cur, [i.vnum]: i }))}
            groups={groups}
            newRow={(t) => ({ ...t, ...emptyRange(10_000), levelMin: 1, levelMax: 99, ranks: ['NORMAL', 'ELITE'] })}
            extra={{
              head: ['Seviye', 'Rütbe'],
              cells: (r, set) => [
                <div key="lvl" className="flex items-center gap-1">
                  <input className="input w-16 px-2 tabular-nums" type="number" min={1} max={250} aria-label="Min seviye" value={r.levelMin} onChange={(e) => set({ levelMin: Math.max(1, Number(e.target.value) || 1) })} />
                  <span className="text-slate-600">–</span>
                  <input className="input w-16 px-2 tabular-nums" type="number" min={1} max={250} aria-label="Max seviye" value={r.levelMax} onChange={(e) => set({ levelMax: Math.max(1, Number(e.target.value) || 1) })} />
                </div>,
                <div key="rank" className="flex flex-wrap gap-1">
                  {MONSTER_RANKS.filter((k) => k.value !== 'NPC').map((k) => {
                    const on = r.ranks.includes(k.value);
                    return (
                      <button
                        key={k.value}
                        type="button"
                        title={k.label}
                        aria-pressed={on}
                        onClick={() => set({ ranks: on ? r.ranks.filter((x) => x !== k.value) : [...r.ranks, k.value] })}
                        className={`rounded px-1.5 py-0.5 text-[11px] ${on ? 'bg-gold-500/15 text-gold-300' : 'bg-white/[0.03] text-slate-600'}`}
                      >
                        {RANK_SHORT[k.value]}
                      </button>
                    );
                  })}
                </div>,
              ],
            }}
          />
        )}
      </div>
    </>
  );
}
