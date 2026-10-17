import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { WikiCatalog, WikiMonsterListResponse } from '@shared/types';
import { api } from '../api';
import { Spinner } from '../components/ui';
import { CATEGORY_GROUPS, CategoryIcon, MONSTER_LINKS, formatNumber, type Category } from './common';

/** Canavar kartı özeti: kayıt sayısı, seviye aralığı ve en yüksek seviyeli canavarın ikonu. */
interface RankSummary {
  total: number;
  minLevel: number;
  maxLevel: number;
  iconUrl: string | null;
}

async function rankSummary(rank: string): Promise<RankSummary> {
  const query = (sort: string) => new URLSearchParams({ pageSize: '1', sort, ...(rank ? { rank } : {}) });
  const [low, high] = await Promise.all([
    api.get<WikiMonsterListResponse>(`/api/public/monsters?${query('level')}`),
    api.get<WikiMonsterListResponse>(`/api/public/monsters?${query('-level')}`),
  ]);
  return { total: low.total, minLevel: low.monsters[0]?.level ?? 0, maxLevel: high.monsters[0]?.level ?? 0, iconUrl: high.monsters[0]?.iconUrl ?? null };
}

const MONSTER_TEXT: Record<string, string> = {
  '': 'Seviyesi, canı ve verdiği EXP',
  BOSS: 'Güçlü bosslar ve düşürdükleri',
  ELITE: 'Sıradan canavarlardan bir adım güçlü',
  STONE: 'Metin taşları ve seviye aralıkları',
};

export function WikiHome() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<WikiCatalog | null>(null);
  const [ranks, setRanks] = useState<Record<string, RankSummary>>({});
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get<WikiCatalog>('/api/public/catalog').then(setCatalog).catch((e) => setError(e.message));
    Promise.all(MONSTER_LINKS.map((l) => rankSummary(l.rank).then((s) => [l.rank, s] as const)))
      .then((entries) => setRanks(Object.fromEntries(entries)))
      .catch(() => {});
  }, []);

  if (error) return <WikiError message={error} />;
  if (!catalog) return <Spinner className="text-brand-400" />;

  const count = (c: Category) => catalog.groups.find((g) => g.type === c.type && g.subtype === c.subtype)?.count ?? 0;
  const search = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/wiki/ara?q=${encodeURIComponent(q.trim())}`);
  };
  const monsterTotal = ranks['']?.total;

  return (
    <>
      <section className="mb-14 max-w-3xl">
        <h1 className="font-display text-[clamp(4rem,12vw,8.5rem)] font-black uppercase leading-[0.82] tracking-tight">
          <span className="block bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">Kale2</span>
          <span className="block bg-gradient-to-b from-brand-300 to-brand-600 bg-clip-text text-transparent">Wiki</span>
        </h1>
        <p className="mt-6 max-w-xl font-display text-xl font-medium leading-snug text-slate-300">
          Itemlerin +0 … +9 değerleri, yükseltme şansları ve canavarlar.
          <br />
          Bir şeyi merak ettiğinde önce buraya bak.
        </p>
        <form onSubmit={search} role="search" className="mt-7 flex items-center gap-2 rounded-xl border border-brand-500/30 bg-ink-900/80 p-2 shadow-lg shadow-black/40 focus-within:border-brand-400/70">
          <svg viewBox="0 0 24 24" className="ml-2 h-5 w-5 shrink-0 text-brand-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base text-slate-100 outline-none placeholder:text-slate-500"
            placeholder="Item ara (isim veya vnum)"
            aria-label="Item ara"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn-primary px-6">Ara</button>
        </form>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="pill pill-active">{formatNumber(catalog.total)} item</span>
          {monsterTotal !== undefined && (
            <Link to="/wiki/canavarlar" className="pill">
              {formatNumber(monsterTotal)} canavar
            </Link>
          )}
          {ranks.BOSS && ranks.BOSS.total > 0 && (
            <Link to="/wiki/canavarlar?rank=BOSS" className="pill">
              {formatNumber(ranks.BOSS.total)} boss
            </Link>
          )}
        </div>
      </section>

      <Section title="Canavarlar" subtitle="Seviyesi, canı, verdiği EXP ve düşürdükleri.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MONSTER_LINKS.map((l) => {
            const s = ranks[l.rank];
            return (
              <Link key={l.path} to={l.path} className="card-link group relative flex min-h-[190px] flex-col overflow-hidden p-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-3xl font-extrabold uppercase leading-none text-white">{l.label}</h3>
                  <Arrow />
                </div>
                <p className="mt-2 font-display text-sm font-semibold text-slate-400">
                  {s ? (s.total ? `${s.total} kayıt · Lv. ${s.minLevel}–${s.maxLevel}` : 'Henüz kayıt yok') : ' '}
                </p>
                <p className="mt-1 text-xs text-slate-500">{MONSTER_TEXT[l.rank]}</p>
                {s?.iconUrl ? (
                  <img src={s.iconUrl} alt="" className="pointer-events-none absolute -bottom-2 right-3 h-28 w-28 object-contain opacity-90 drop-shadow-[0_8px_24px_rgba(61,139,255,0.35)] transition group-hover:scale-105" />
                ) : (
                  <svg viewBox="0 0 24 24" className="pointer-events-none absolute -bottom-3 right-2 h-28 w-28 text-brand-500/15 transition group-hover:text-brand-400/25" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 9l2-5 3 4h4l3-4 2 5v4a7 7 0 01-14 0zM9 13h.01M15 13h.01M10 17h4" />
                  </svg>
                )}
                <span aria-hidden className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-brand-500/10 blur-2xl transition group-hover:bg-brand-500/20" />
              </Link>
            );
          })}
        </div>
      </Section>

      {CATEGORY_GROUPS.filter((g) => g.label !== 'Diğer').map((g) => (
        <Section key={g.label} title={g.label}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {g.categories.map((c) => {
              const n = count(c);
              return (
                <Link key={c.path} to={c.path} className={`card-link group flex items-center gap-4 p-4 ${n === 0 ? 'opacity-50' : ''}`}>
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-brand-500/25 bg-brand-500/10 text-brand-300 transition group-hover:border-brand-400/60 group-hover:text-white">
                    <CategoryIcon type={c.type} subtype={c.subtype} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-bold uppercase leading-tight text-white">{c.label}</span>
                    <span className="font-display text-sm font-medium text-slate-400">{n} item</span>
                  </span>
                  <Arrow />
                </Link>
              );
            })}
          </div>
        </Section>
      ))}

      {CATEGORY_GROUPS.filter((g) => g.label === 'Diğer').map((g) => {
        const cats = g.categories.filter((c) => count(c) > 0);
        if (!cats.length) return null;
        return (
          <Section key={g.label} title={g.label}>
            <ul className="grid gap-x-10 border-t border-white/[0.07] md:grid-cols-2">
              {cats.map((c) => (
                <li key={c.path} className="border-b border-white/[0.07]">
                  <Link to={c.path} className="group flex items-center gap-4 px-2 py-3.5 transition hover:bg-white/[0.03]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-ink-850 text-brand-300">
                      <CategoryIcon type={c.type} subtype={c.subtype} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-display text-lg font-bold uppercase text-white">{c.label}</span>
                    <span className="font-display text-sm font-bold tabular-nums text-slate-400">{count(c)}</span>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-brand-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
    </>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="section-title">{title}</h2>
      {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-brand-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function WikiError({ message }: { message: string }) {
  return (
    <div className="card p-8 text-center">
      <div className="font-display text-lg text-slate-200">Wiki görüntülenemiyor</div>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
      <a href="/" className="btn-ghost mt-4">
        Ana siteye git
      </a>
    </div>
  );
}
