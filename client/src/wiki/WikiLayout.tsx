import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../components/ui';
import { CATEGORY_GROUPS, CategoryIcon, MONSTER_LINKS } from './common';

const sideLink = (active: boolean) =>
  `flex items-center gap-2.5 rounded-md border-l-2 px-2 py-1.5 text-sm transition ${
    active ? 'border-brand-400 bg-brand-500/15 text-white' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
  }`;

export function WikiLayout() {
  const navigate = useNavigate();
  const { pathname, search: qs } = useLocation();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  // Ana sayfada arama kutusu ve kategoriler sayfanın kendisinde; yan menü yalnızca mobil menüde açılır.
  const home = pathname === '/wiki' || pathname === '/wiki/';

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/wiki/ara?q=${encodeURIComponent(q.trim())}`);
  };

  const topLink = ({ isActive }: { isActive: boolean }) =>
    `font-display text-[15px] font-bold uppercase tracking-wider transition ${isActive ? 'text-brand-300' : 'text-slate-400 hover:text-white'}`;

  return (
    <div className="app-bg min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link to="/wiki" className="shrink-0">
            <Brand tagline="Wiki" />
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            <NavLink to="/wiki" end className={topLink}>
              Itemler
            </NavLink>
            <NavLink to="/wiki/canavarlar" className={topLink}>
              Canavarlar
            </NavLink>
          </nav>
          {!home && (
            <form onSubmit={search} className="ml-auto hidden w-full max-w-sm sm:flex" role="search">
              <input className="input rounded-r-none" placeholder="Item ara (isim veya vnum)…" aria-label="Item ara" value={q} onChange={(e) => setQ(e.target.value)} />
              <button className="btn-primary rounded-l-none px-3">Ara</button>
            </form>
          )}
          <a href="/" className={`${home ? 'ml-auto' : ''} hidden shrink-0 font-display text-sm font-semibold uppercase tracking-wider text-slate-500 hover:text-brand-300 lg:block`}>
            Ana site →
          </a>
          <button className="btn-ghost btn-sm ml-auto lg:hidden" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            Menü
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-8 sm:px-6">
        <aside
          className={`${menu ? 'block' : 'hidden'} fixed inset-x-0 top-[61px] z-20 max-h-[calc(100vh-61px)] overflow-y-auto border-b border-white/5 bg-ink-900 p-4 lg:static lg:max-h-none lg:w-52 lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0 ${
            home ? '' : 'lg:block'
          }`}
        >
          <nav className="space-y-6 lg:sticky lg:top-24">
            {!home && (
              <form onSubmit={search} className="flex sm:hidden" role="search">
                <input className="input rounded-r-none" placeholder="Item ara…" aria-label="Item ara" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="btn-primary rounded-l-none px-3">Ara</button>
              </form>
            )}
            <div>
              <div className="mb-2 px-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-brand-400">Canavarlar</div>
              <ul className="space-y-0.5">
                {MONSTER_LINKS.map((l) => (
                  <li key={l.path}>
                    <Link to={l.path} onClick={() => setMenu(false)} className={sideLink(pathname + qs === l.path)}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {CATEGORY_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="mb-2 px-2 font-display text-xs font-bold uppercase tracking-[0.2em] text-brand-400">{g.label}</div>
                <ul className="space-y-0.5">
                  {g.categories.map((c) => (
                    <li key={c.path}>
                      <NavLink to={c.path} onClick={() => setMenu(false)} className={({ isActive }) => sideLink(isActive)}>
                        <CategoryIcon type={c.type} subtype={c.subtype} className="h-4 w-4" />
                        {c.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
