import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { MONSTER_ABILITIES, MONSTER_RANKS, MONSTER_RESISTS, labelOf } from '@shared/constants';
import type { Monster, WikiMonsterListResponse } from '@shared/types';
import { api } from '../api';
import { ModelViewer } from '../components/LazyModelViewer';
import { RankBadge, elementLabel, raceLabel, signedPct } from '../components/monster-ui';
import { EmptyState, Spinner } from '../components/ui';
import { MonsterIcon } from '../pages/MonsterList';
import { formatNumber } from './common';
import { WikiError } from './WikiHome';

/** Oyuncuların gördüğü canavar listesi (rütbeye göre süzülebilir). */
export function WikiMonsterList() {
  const [params] = useSearchParams();
  const rank = params.get('rank') ?? '';
  const [data, setData] = useState<WikiMonsterListResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    const q = new URLSearchParams({ pageSize: '100' });
    if (rank) q.set('rank', rank);
    api
      .get<WikiMonsterListResponse>(`/api/public/monsters?${q}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [rank]);

  if (error) return <WikiError message={error} />;
  const title = rank ? labelOf(MONSTER_RANKS, rank) : 'Canavarlar';

  return (
    <>
      <nav className="mb-2 text-xs text-slate-500">
        <Link to="/wiki" className="hover:text-brand-300">
          Wiki
        </Link>{' '}
        / Canavarlar
      </nav>
      <h1 className="section-title mt-1">{title}</h1>
      <p className="mb-5 mt-1 text-sm text-slate-400">{data ? `${data.total} canavar · seviyeye göre` : ' '}</p>
      {!data ? (
        <Spinner className="text-brand-400" />
      ) : data.monsters.length === 0 ? (
        <EmptyState title="Bu grupta canavar yok" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead className="border-b border-white/5 bg-white/[0.02]">
              <tr>
                <th className="table-head">Canavar</th>
                <th className="table-head">Seviye</th>
                <th className="table-head">Rütbe</th>
                <th className="table-head">Irk</th>
                <th className="table-head text-right">HP</th>
                <th className="table-head text-right">EXP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.monsters.map((m) => (
                <tr key={m.id} className="hover:bg-white/[0.02]">
                  <td className="table-cell">
                    <Link to={`/wiki/canavar/${m.vnum}`} className="flex items-center gap-3 font-medium text-slate-100 hover:text-brand-300">
                      <MonsterIcon url={m.iconUrl} name={m.name} rank={m.rank} size={32} />
                      {m.name}
                    </Link>
                  </td>
                  <td className="table-cell tabular-nums">{m.level}</td>
                  <td className="table-cell">
                    <RankBadge rank={m.rank} />
                  </td>
                  <td className="table-cell text-slate-300">{raceLabel(m.race)}</td>
                  <td className="table-cell text-right tabular-nums">{formatNumber(m.hp)}</td>
                  <td className="table-cell text-right tabular-nums">{formatNumber(m.exp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

type PublicMonster = Omit<Monster, 'code' | 'sourceUrl'>;

export function WikiMonster() {
  const { vnum } = useParams();
  const [m, setM] = useState<PublicMonster | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setM(null);
    setError('');
    api
      .get<PublicMonster>(`/api/public/monsters/${vnum}`)
      .then(setM)
      .catch((e) => setError(e.message));
  }, [vnum]);

  if (error) return <WikiError message={error} />;
  if (!m) return <Spinner className="text-brand-400" />;

  const stats: Array<[string, string]> = [
    ['HP', formatNumber(m.hp)],
    ['EXP', formatNumber(m.exp)],
    ['Hasar', `${m.damageMin} – ${m.damageMax}`],
    ['Savunma', String(m.defense)],
    ['Irk', raceLabel(m.race)],
    ['Element', elementLabel(m.element)],
    ['HP yenilenmesi', m.hpRegenPct ? `%${m.hpRegenPct} / ${m.hpRegenSec} sn` : '—'],
    ['Davranış', m.aggressive ? 'Saldırgan' : 'Vurulunca saldırır'],
    ['STR / DEX', `${m.str} / ${m.dex}`],
    ['VIT / INT', `${m.vit} / ${m.int}`],
    ['Saldırı hızı', String(m.attackSpeed)],
    ['Hareket hızı', String(m.moveSpeed)],
  ];
  const resists = Object.entries(m.resists);
  const abilities = Object.entries(m.abilities);

  return (
    <>
      <nav className="mb-2 text-xs text-slate-500">
        <Link to="/wiki" className="hover:text-brand-300">
          Wiki
        </Link>{' '}
        /{' '}
        <Link to="/wiki/canavarlar" className="hover:text-brand-300">
          Canavarlar
        </Link>
      </nav>
      <div className="flex items-center gap-4">
        <MonsterIcon url={m.iconUrl} name={m.name} rank={m.rank} size={56} />
        <div>
          <h1 className="font-display text-3xl text-white">{m.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-400">
            <RankBadge rank={m.rank} /> Seviye {m.level}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <div>{m.modelUrl ? <ModelViewer url={m.modelUrl} className="aspect-[4/5]" /> : <div className="card p-6 text-center text-sm text-slate-500">3D model yok</div>}</div>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">İstatistikler</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map(([k, v]) => (
                <div key={k} className="rounded-lg bg-white/[0.03] px-3 py-2">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="mt-0.5 tabular-nums text-slate-100">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          {(resists.length > 0 || abilities.length > 0) && (
            <section className="card grid gap-6 p-5 sm:grid-cols-2">
              <PctList title="Savunmalar" entries={resists} labels={MONSTER_RESISTS} />
              <PctList title="Vuruş yetenekleri" entries={abilities} labels={MONSTER_ABILITIES} />
            </section>
          )}
          {m.description && (
            <section className="card whitespace-pre-line p-5 text-sm text-slate-300">{m.description}</section>
          )}
        </div>
      </div>
    </>
  );
}

function PctList({ title, entries, labels }: { title: string; entries: Array<[string, number]>; labels: readonly { value: string; label: string }[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">—</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span className="text-slate-300">{labelOf(labels, k)}</span>
              <span className={`tabular-nums ${v < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{signedPct(v)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
