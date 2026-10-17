import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WikiCatalog } from '@shared/types';
import { api } from '../api';
import { Spinner } from '../components/ui';
import { CATEGORY_GROUPS, CategoryIcon, MONSTER_LINKS } from './common';

export function WikiHome() {
  const [catalog, setCatalog] = useState<WikiCatalog | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<WikiCatalog>('/api/public/catalog').then(setCatalog).catch((e) => setError(e.message));
  }, []);

  if (error) return <WikiError message={error} />;
  if (!catalog) return <Spinner className="text-gold-400" />;

  const count = (type: string, subtype: string) => catalog.groups.find((g) => g.type === type && g.subtype === subtype)?.count ?? 0;

  return (
    <>
      <div className="mb-8">
        <h1 className="font-display text-3xl text-gold-300">Item Veritabanı</h1>
        <p className="mt-1 text-sm text-slate-400">
          {catalog.total.toLocaleString('tr-TR')} item · silah, zırh ve takıların +0 … +9 değerleri, yükseltme şansları ve malzemeleri
        </p>
      </div>
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">Canavarlar</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {MONSTER_LINKS.map((l) => (
            <Link key={l.path} to={l.path} className="card p-4 font-medium text-slate-100 transition hover:border-gold-500/40 hover:bg-ink-850">
              {l.label}
            </Link>
          ))}
        </div>
      </section>
      {CATEGORY_GROUPS.map((g) => {
        const cats = g.label === 'Diğer' ? g.categories.filter((c) => count(c.type, c.subtype) > 0) : g.categories;
        if (!cats.length) return null;
        return (
          <section key={g.label} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">{g.label}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {cats.map((c) => {
                const n = count(c.type, c.subtype);
                return (
                  <Link
                    key={c.path}
                    to={c.path}
                    className={`card group flex items-center gap-3 p-4 transition hover:border-gold-500/40 hover:bg-ink-850 ${n === 0 ? 'opacity-50' : ''}`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gold-500/20 bg-gold-500/10 text-gold-400 group-hover:text-gold-300">
                      <CategoryIcon type={c.type} subtype={c.subtype} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-100">{c.label}</span>
                      <span className="text-xs text-slate-500">{n} item</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

export function WikiError({ message }: { message: string }) {
  return (
    <div className="card p-8 text-center">
      <div className="font-display text-lg text-slate-200">Wiki görüntülenemiyor</div>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
      <a href="/" className="btn-ghost mt-4">
        Yönetim paneline git
      </a>
    </div>
  );
}
