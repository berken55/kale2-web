import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ITEM_TYPES, RARITIES, labelOf } from '@shared/constants';
import type { DashboardStats } from '@shared/types';
import { api } from '../api';
import { PageHeader, Spinner } from '../components/ui';

const ACTION_LABEL: Record<string, string> = {
  create: 'Oluşturma',
  update: 'Güncelleme',
  delete: 'Silme',
  upload: 'Yükleme',
  import: 'İçe aktarma',
};

function formatDate(sqlite: string) {
  return new Date(sqlite.replace(' ', 'T') + 'Z').toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<DashboardStats>('/api/dashboard').then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!stats) return <Spinner className="text-brand-400" />;

  const tiles = [
    { label: 'Toplam item', value: stats.totalItems },
    { label: '3D modeli olan', value: stats.withModel, sub: stats.totalItems ? `%${Math.round((stats.withModel / stats.totalItems) * 100)}` : '' },
    { label: 'İkonu olan', value: stats.withIcon, sub: stats.totalItems ? `%${Math.round((stats.withIcon / stats.totalItems) * 100)}` : '' },
    { label: 'Canavar', value: stats.totalMonsters },
    { label: 'Bonus tanımı', value: stats.bonusTypes },
  ];
  const maxType = Math.max(1, ...stats.byType.map((t) => t.count));

  return (
    <>
      <PageHeader
        title="Genel Bakış"
        subtitle="Item veritabanının özeti ve son değişiklikler"
        actions={
          <Link to="/admin/items/new" className="btn-primary">
            + Yeni item
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="card p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">{t.label}</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-3xl text-slate-100 tabular-nums">{t.value.toLocaleString('tr-TR')}</span>
              {t.sub && <span className="text-sm text-slate-500">{t.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Tipe göre itemler</h2>
          {stats.byType.length === 0 && <p className="text-sm text-slate-500">Henüz item yok.</p>}
          <ul className="space-y-3">
            {stats.byType.map((t) => (
              <li key={t.type}>
                <Link to={`/admin/items?type=${t.type}`} className="group block">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-300 group-hover:text-brand-300">{labelOf(ITEM_TYPES, t.type)}</span>
                    <span className="tabular-nums text-slate-500">{t.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(t.count / maxType) * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Nadirlik dağılımı</h2>
          <ul className="space-y-2">
            {RARITIES.map((r) => {
              const count = stats.byRarity.find((x) => x.rarity === r.value)?.count ?? 0;
              return (
                <li key={r.value}>
                  <Link to={`/admin/items?rarity=${r.value}`} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-white/5">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                      <span style={{ color: r.color }}>{r.label}</span>
                    </span>
                    <span className="tabular-nums text-slate-400">{count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-300">Son değişiklikler</h2>
          {stats.recentActivity.length === 0 && <p className="text-sm text-slate-500">Henüz bir değişiklik yapılmadı.</p>}
          <ul className="space-y-3">
            {stats.recentActivity.map((a) => (
              <li key={a.id} className="text-sm">
                {a.entity === 'item' && a.action !== 'delete' && a.entityId ? (
                  <Link to={`/admin/items/${a.entityId}`} className="text-slate-200 hover:text-brand-300">
                    {a.summary}
                  </Link>
                ) : (
                  <span className="text-slate-200">{a.summary}</span>
                )}
                <div className="text-xs text-slate-500">
                  {ACTION_LABEL[a.action] ?? a.action} · {formatDate(a.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
