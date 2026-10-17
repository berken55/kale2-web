import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import { Brand } from './ui';

const NAV = [
  { to: '/admin', label: 'Genel Bakış', end: true, icon: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10' },
  { to: '/admin/items', label: 'Itemler', end: false, icon: 'M14.5 3.5l6 6L9 21H3v-6zM12 6l6 6' },
  { to: '/admin/monsters', label: 'Canavarlar', end: false, icon: 'M5 9l2-5 3 4h4l3-4 2 5v4a7 7 0 01-14 0zM9 13h.01M15 13h.01M10 17h4' },
  { to: '/admin/drop-groups', label: 'Drop Grupları', end: false, icon: 'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4' },
  { to: '/admin/level-drops', label: 'Genel Drop', end: false, icon: 'M12 3v14m0 0l-5-5m5 5l5-5M5 21h14' },
  { to: '/admin/bonuses', label: 'Bonus Tanımları', end: false, icon: 'M12 3l2.6 5.6L21 9.3l-4.5 4.4 1 6.3L12 17l-5.5 3 1-6.3L3 9.3l6.4-.7z' },
  { to: '/admin/maps', label: 'Haritalar', end: false, icon: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14' },
  { to: '/admin/releases', label: 'Yayınla', end: false, icon: 'M12 3l4 4h-3v7h-2V7H8zM4 15v5h16v-5' },
  { to: '/admin/data', label: 'İçe / Dışa Aktar', end: false, icon: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Layout() {
  const { username, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 font-display text-[15px] font-semibold uppercase tracking-wide transition ${
              isActive
                ? 'border-brand-400 bg-gradient-to-r from-brand-500/20 to-transparent text-white'
                : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`
          }
        >
          <Icon d={n.icon} />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="px-2">
      <Brand tagline="Yönetim Paneli" />
    </div>
  );

  return (
    <div className="app-bg min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col gap-8 border-r border-white/[0.07] bg-ink-900/70 p-4 backdrop-blur lg:flex lg:sticky lg:top-0 lg:h-screen">
        {brand}
        {nav}
        <a href="/wiki" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2 font-display text-[15px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-white/5 hover:text-slate-200">
          <Icon d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 5v16M8 7h7" />
          Wiki ↗
        </a>
        <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2 font-display text-[15px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-white/5 hover:text-slate-200">
          <Icon d="M4 12h16M12 4v16" />
          Website ↗
        </a>
        <div className="mt-auto rounded-lg border border-white/5 p-3 text-xs text-slate-400">
          <div className="truncate">
            Giriş: <span className="text-slate-200">{username}</span>
          </div>
          <button className="mt-2 text-brand-400 hover:text-brand-300" onClick={logout}>
            Çıkış yap
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-ink-900/95 px-4 py-3 backdrop-blur lg:hidden">
        {brand}
        <button className="btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Menü
        </button>
      </header>
      {open && (
        <div className="border-b border-white/5 bg-ink-900 p-4 lg:hidden">
          {nav}
          <button className="mt-3 px-3 text-sm text-brand-400" onClick={logout}>
            Çıkış yap ({username})
          </button>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
