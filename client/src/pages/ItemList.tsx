import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CLASSES, ITEM_SUBTYPES, ITEM_TYPES, RARITIES, labelOf, subtypeLabel, type ItemType } from '@shared/constants';
import type { Item, ItemListResponse } from '@shared/types';
import { api } from '../api';
import { ImportDialog, type ImportResult } from '../components/ImportDialog';
import type { ImportState } from './ItemEditor';
import { EmptyState, ItemIcon, PageHeader, RarityBadge, Spinner, useConfirm, useToast } from '../components/ui';

const PAGE_SIZE = 25;

export function ItemListPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<ItemListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [reload, setReload] = useState(0);
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);

  const openImported = (r: ImportResult & { target: 'new' | 'existing' }) => {
    const state: ImportState = { importDraft: r.draft, importAssets: r.assets };
    setImportOpen(false);
    navigate(r.target === 'existing' && r.draft.existingItemId ? `/items/${r.draft.existingItemId}` : '/items/new', { state });
  };

  const type = params.get('type') ?? '';
  const page = Number(params.get('page') ?? 1);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'type') next.delete('subtype');
    setParams(next, { replace: true });
  };

  // Aramayı yazarken her tuşta istek atmamak için bekle
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('search') ?? '') !== search) setParam('search', search);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams(params);
    q.set('pageSize', String(PAGE_SIZE));
    if (!q.get('sort')) q.set('sort', 'vnum');
    api
      .get<ItemListResponse>(`/api/items?${q}`)
      .then(setData)
      .catch((e) => toast('error', e.message))
      .finally(() => setLoading(false));
  }, [params, reload, toast]);

  const remove = async (id: number, name: string) => {
    if (!(await confirm({ title: 'Item silinsin mi?', message: `"${name}" ve yüklenmiş dosyaları kalıcı olarak silinecek.`, confirmText: 'Sil', danger: true })))
      return;
    try {
      await api.del(`/api/items/${id}`);
      toast('success', 'Item silindi.');
      setReload((r) => r + 1);
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const clone = async (id: number) => {
    try {
      const copy = await api.post<Item>(`/api/items/${id}/clone`);
      toast('success', `Kopya oluşturuldu (#${copy.vnum}).`);
      navigate(`/items/${copy.id}`);
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const hasFilters = ['search', 'type', 'subtype', 'rarity', 'class', 'hasModel'].some((k) => params.get(k));

  return (
    <>
      <PageHeader
        title="Itemler"
        subtitle={data ? `${data.total.toLocaleString('tr-TR')} item` : ' '}
        actions={
          <>
            <button className="btn-ghost" onClick={() => setImportOpen(true)}>
              Linkten içe aktar
            </button>
            <Link to="/items/new" className="btn-primary">
              + Yeni item
            </Link>
          </>
        }
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onConfirm={openImported} />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <input
          className="input lg:col-span-2"
          placeholder="İsim veya vnum ile ara…"
          aria-label="Ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input" aria-label="Tip" value={type} onChange={(e) => setParam('type', e.target.value)}>
          <option value="">Tüm tipler</option>
          {ITEM_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Alt tip"
          value={params.get('subtype') ?? ''}
          disabled={!type}
          onChange={(e) => setParam('subtype', e.target.value)}
        >
          <option value="">Tüm alt tipler</option>
          {type &&
            ITEM_SUBTYPES[type as ItemType].map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
        </select>
        <select className="input" aria-label="Nadirlik" value={params.get('rarity') ?? ''} onChange={(e) => setParam('rarity', e.target.value)}>
          <option value="">Tüm nadirlikler</option>
          {RARITIES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Sınıf" value={params.get('class') ?? ''} onChange={(e) => setParam('class', e.target.value)}>
          <option value="">Tüm sınıflar</option>
          {CLASSES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-6">
          <select className="input w-auto" aria-label="3D model" value={params.get('hasModel') ?? ''} onChange={(e) => setParam('hasModel', e.target.value)}>
            <option value="">3D model: hepsi</option>
            <option value="true">3D modeli olanlar</option>
            <option value="false">3D modeli olmayanlar</option>
          </select>
          <select className="input w-auto" aria-label="Sıralama" value={params.get('sort') ?? 'vnum'} onChange={(e) => setParam('sort', e.target.value)}>
            <option value="vnum">Vnum (artan)</option>
            <option value="-vnum">Vnum (azalan)</option>
            <option value="name">İsim (A-Z)</option>
            <option value="-name">İsim (Z-A)</option>
            <option value="level">Seviye (artan)</option>
            <option value="-level">Seviye (azalan)</option>
            <option value="-updated">Son güncellenen</option>
          </select>
          {hasFilters && (
            <button
              className="text-sm text-gold-400 hover:text-gold-300"
              onClick={() => {
                setSearch('');
                setParams({}, { replace: true });
              }}
            >
              Filtreleri temizle
            </button>
          )}
          {loading && <Spinner className="text-gold-400" />}
        </div>
      </div>

      <div className="card overflow-hidden">
        {data && data.items.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Eşleşen item yok' : 'Henüz item tanımlanmadı'}
            text={hasFilters ? 'Filtreleri değiştirmeyi deneyin.' : 'İlk itemi oluşturarak başlayın ya da JSON dosyasından içe aktarın.'}
            action={
              !hasFilters && (
                <Link to="/items/new" className="btn-primary">
                  + Yeni item
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-white/5 bg-white/[0.02]">
                <tr>
                  <th className="table-head">Item</th>
                  <th className="table-head">Vnum</th>
                  <th className="table-head">Tip</th>
                  <th className="table-head">Seviye</th>
                  <th className="table-head">Sınıf</th>
                  <th className="table-head">Nadirlik</th>
                  <th className="table-head">3D</th>
                  <th className="table-head text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data?.items.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02]">
                    <td className="table-cell">
                      <Link to={`/items/${item.id}`} className="flex items-center gap-3 font-medium text-slate-100 hover:text-gold-300">
                        <ItemIcon url={item.iconUrl} name={item.name} rarity={item.rarity} size={36} />
                        {item.name}
                      </Link>
                    </td>
                    <td className="table-cell tabular-nums text-slate-400">{item.vnum}</td>
                    <td className="table-cell text-slate-300">
                      {labelOf(ITEM_TYPES, item.type)}
                      <div className="text-xs text-slate-500">{subtypeLabel(item.type, item.subtype)}</div>
                    </td>
                    <td className="table-cell tabular-nums">{item.levelRequired || '—'}</td>
                    <td className="table-cell text-xs text-slate-400">
                      {item.classes.length ? item.classes.map((c) => labelOf(CLASSES, c)).join(', ') : 'Hepsi'}
                    </td>
                    <td className="table-cell">
                      <RarityBadge rarity={item.rarity} />
                    </td>
                    <td className="table-cell">
                      {item.modelUrl ? <span className="text-emerald-400">Var</span> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="table-cell">
                      <div className="flex justify-end gap-1.5">
                        <Link to={`/items/${item.id}`} className="btn-ghost btn-sm">
                          Düzenle
                        </Link>
                        <button className="btn-ghost btn-sm" onClick={() => clone(item.id)}>
                          Kopyala
                        </button>
                        <button className="btn-danger btn-sm" onClick={() => remove(item.id, item.name)}>
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>
            Sayfa {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>
              ← Önceki
            </button>
            <button className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setParam('page', String(page + 1))}>
              Sonraki →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
