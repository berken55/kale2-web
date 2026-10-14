import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CATEGORY_GROUPS, CategoryIcon } from './common';

export function WikiLayout() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);

  const search = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/wiki/ara?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link to="/wiki" className="flex shrink-0 items-center gap-2">
            <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
              <path d="M4 28V10l4 3V6l4 3V4h8v5l4-3v7l4-3v18z" fill="#d4a53a" />
            </svg>
            <div>
              <div className="font-display text-lg leading-none text-gold-300">Kale2</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Item Wiki</div>
            </div>
          </Link>
          <form onSubmit={search} className="ml-auto flex w-full max-w-md" role="search">
            <input className="input rounded-r-none" placeholder="Item ara (isim veya vnum)…" aria-label="Item ara" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-primary rounded-l-none px-3">Ara</button>
          </form>
          <button className="btn-ghost btn-sm lg:hidden" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            Menü
          </button>
          <a href="/" className="hidden shrink-0 text-xs text-slate-500 hover:text-gold-300 lg:block">
            Yönetim paneli →
          </a>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 sm:px-6">
        <aside className={`${menu ? 'block' : 'hidden'} fixed inset-x-0 top-[57px] z-20 max-h-[calc(100vh-57px)] overflow-y-auto border-b border-white/5 bg-ink-900 p-4 lg:static lg:block lg:max-h-none lg:w-52 lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0`}>
          <nav className="space-y-5 lg:sticky lg:top-24">
            {CATEGORY_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</div>
                <ul className="space-y-0.5">
                  {g.categories.map((c) => (
                    <li key={c.path}>
                      <NavLink
                        to={c.path}
                        onClick={() => setMenu(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition ${
                            isActive ? 'bg-gold-500/15 text-gold-300' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                          }`
                        }
                      >
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
