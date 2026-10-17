import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MONSTER_RACES, MONSTER_RANKS } from '@shared/constants';
import type { Monster, MonsterImportDraft, MonsterListResponse } from '@shared/types';
import { api } from '../api';
import { RankBadge, raceLabel, rankColor } from '../components/monster-ui';
import { EmptyState, ItemIcon, PageHeader, Spinner, useConfirm, useToast } from '../components/ui';

const PAGE_SIZE = 25;

/** Linkten içe aktarmadan sonra düzenleyiciye router state ile gelen veri */
export interface MonsterImportState {
  importDraft: MonsterImportDraft;
}

export function MonsterListPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<MonsterListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [reload, setReload] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const page = Number(params.get('page') ?? 1);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
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
    if (!q.get('sort')) q.set('sort', 'level');
    api
      .get<MonsterListResponse>(`/api/monsters?${q}`)
      .then(setData)
      .catch((e) => toast('error', e.message))
      .finally(() => setLoading(false));
  }, [params, reload, toast]);

  const remove = async (id: number, name: string) => {
    if (!(await confirm({ title: 'Canavar silinsin mi?', message: `"${name}" ve yüklenmiş dosyaları kalıcı olarak silinecek.`, confirmText: 'Sil', danger: true })))
      return;
    try {
      await api.del(`/api/monsters/${id}`);
      toast('success', 'Canavar silindi.');
      setReload((r) => r + 1);
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const clone = async (id: number) => {
    try {
      const copy = await api.post<Monster>(`/api/monsters/${id}/clone`);
      toast('success', `Kopya oluşturuldu (#${copy.vnum}).`);
      navigate(`/admin/monsters/${copy.id}`);
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const openImported = (draft: MonsterImportDraft) => {
    setImportOpen(false);
    const state: MonsterImportState = { importDraft: draft };
    navigate(draft.existingMonsterId ? `/admin/monsters/${draft.existingMonsterId}` : '/admin/monsters/new', { state });
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const hasFilters = ['search', 'rank', 'race', 'levelMin', 'levelMax', 'hasModel'].some((k) => params.get(k));

  return (
    <>
      <PageHeader
        title="Canavarlar"
        subtitle={data ? `${data.total.toLocaleString('tr-TR')} canavar` : ' '}
        actions={
          <>
            <button className="btn-ghost" onClick={() => setImportOpen(true)}>
              Linkten içe aktar
            </button>
            <Link to="/admin/monsters/new" className="btn-primary">
              + Yeni canavar
            </Link>
          </>
        }
      />
      <MonsterImportDialog open={importOpen} onClose={() => setImportOpen(false)} onConfirm={openImported} />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <input
          className="input lg:col-span-2"
          placeholder="İsim, oyun kodu veya vnum ile ara…"
          aria-label="Ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input" aria-label="Rütbe" value={params.get('rank') ?? ''} onChange={(e) => setParam('rank', e.target.value)}>
          <option value="">Tüm rütbeler</option>
          {MONSTER_RANKS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select className="input" aria-label="Irk" value={params.get('race') ?? ''} onChange={(e) => setParam('race', e.target.value)}>
          <option value="">Tüm ırklar</option>
          {MONSTER_RACES.filter((r) => r.value).map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2 lg:col-span-2">
          <input
            className="input"
            type="number"
            min={0}
            placeholder="Min seviye"
            aria-label="En düşük seviye"
            value={params.get('levelMin') ?? ''}
            onChange={(e) => setParam('levelMin', e.target.value)}
          />
          <input
            className="input"
            type="number"
            min={0}
            placeholder="Max seviye"
            aria-label="En yüksek seviye"
            value={params.get('levelMax') ?? ''}
            onChange={(e) => setParam('levelMax', e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-6">
          <select className="input w-auto" aria-label="3D model" value={params.get('hasModel') ?? ''} onChange={(e) => setParam('hasModel', e.target.value)}>
            <option value="">3D model: hepsi</option>
            <option value="true">3D modeli olanlar</option>
            <option value="false">3D modeli olmayanlar</option>
          </select>
          <select className="input w-auto" aria-label="Sıralama" value={params.get('sort') ?? 'level'} onChange={(e) => setParam('sort', e.target.value)}>
            <option value="level">Seviye (artan)</option>
            <option value="-level">Seviye (azalan)</option>
            <option value="vnum">Vnum (artan)</option>
            <option value="name">İsim (A-Z)</option>
            <option value="-hp">HP (yüksekten)</option>
            <option value="-exp">EXP (yüksekten)</option>
            <option value="-updated">Son güncellenen</option>
          </select>
          {hasFilters && (
            <button
              className="text-sm text-brand-400 hover:text-brand-300"
              onClick={() => {
                setSearch('');
                setParams({}, { replace: true });
              }}
            >
              Filtreleri temizle
            </button>
          )}
          {loading && <Spinner className="text-brand-400" />}
        </div>
      </div>

      <div className="card overflow-hidden">
        {data && data.monsters.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Eşleşen canavar yok' : 'Henüz canavar tanımlanmadı'}
            text={hasFilters ? 'Filtreleri değiştirmeyi deneyin.' : 'İlk canavarı oluşturun ya da metin2alerts sayfasından içe aktarın.'}
            action={
              !hasFilters && (
                <Link to="/admin/monsters/new" className="btn-primary">
                  + Yeni canavar
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-white/5 bg-white/[0.02]">
                <tr>
                  <th className="table-head">Canavar</th>
                  <th className="table-head">Vnum</th>
                  <th className="table-head">Rütbe</th>
                  <th className="table-head">Seviye</th>
                  <th className="table-head">Irk</th>
                  <th className="table-head text-right">HP</th>
                  <th className="table-head text-right">EXP</th>
                  <th className="table-head">3D</th>
                  <th className="table-head text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data?.monsters.map((m) => (
                  <tr key={m.id} className="hover:bg-white/[0.02]">
                    <td className="table-cell">
                      <Link to={`/admin/monsters/${m.id}`} className="flex items-center gap-3 font-medium text-slate-100 hover:text-brand-300">
                        <MonsterIcon url={m.iconUrl} name={m.name} rank={m.rank} size={36} />
                        <span>
                          {m.name}
                          <span className="block font-mono text-xs font-normal text-slate-500">{m.code}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="table-cell tabular-nums text-slate-400">{m.vnum}</td>
                    <td className="table-cell">
                      <RankBadge rank={m.rank} />
                    </td>
                    <td className="table-cell tabular-nums">{m.level}</td>
                    <td className="table-cell text-slate-300">
                      {raceLabel(m.race)}
                      {m.aggressive && <div className="text-xs text-red-300/80">Saldırgan</div>}
                    </td>
                    <td className="table-cell text-right tabular-nums">{m.hp.toLocaleString('tr-TR')}</td>
                    <td className="table-cell text-right tabular-nums">{m.exp.toLocaleString('tr-TR')}</td>
                    <td className="table-cell">
                      {m.modelUrl ? <span className="text-emerald-400">Var</span> : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="table-cell">
                      <div className="flex justify-end gap-1.5">
                        <Link to={`/admin/monsters/${m.id}`} className="btn-ghost btn-sm">
                          Düzenle
                        </Link>
                        <button className="btn-ghost btn-sm" onClick={() => clone(m.id)}>
                          Kopyala
                        </button>
                        <button className="btn-danger btn-sm" onClick={() => remove(m.id, m.name)}>
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

export function MonsterIcon({ url, name, rank, size = 40 }: { url: string | null; name: string; rank: string; size?: number }) {
  // Kenar rengi rütbeyi gösterir; ItemIcon nadirlik rengini kullanıyor
  const color = rankColor(rank);
  return url ? (
    <div className="shrink-0 overflow-hidden rounded-md border bg-ink-800" style={{ width: size, height: size, borderColor: `${color}66` }}>
      <img src={url} alt="" className="h-full w-full object-contain [image-rendering:pixelated]" />
    </div>
  ) : (
    <ItemIcon url={null} name={name} rarity="COMMON" size={size} />
  );
}

/** metin2alerts / m2icondb canavar sayfasının linkini okutur; onaylanan taslak düzenleyicide açılır. */
function MonsterImportDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (d: MonsterImportDraft) => void }) {
  const [url, setUrl] = useState('');
  const [vnum, setVnum] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<MonsterImportDraft | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl('');
    setVnum('');
    setError('');
    setDraft(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !loading && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setDraft(null);
    try {
      setDraft(await api.post<MonsterImportDraft>('/api/monsters/import', { url: url.trim(), ...(vnum ? { vnum: Number(vnum) } : {}) }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;
  const m = draft?.monster;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !loading && onClose()}>
      <div role="dialog" aria-modal="true" className="card max-h-[90vh] w-full max-w-xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-display text-lg text-brand-300">Linkten canavar içe aktar</h2>
        <p className="mt-1 text-sm text-slate-400">
          metin2alerts canavar sayfası (ör. <span className="font-mono text-xs">metin2alerts.com/en/wiki/mob/101-wild-dog</span>) ya da m2icondb canavar
          bağlantısı. Hiçbir şey otomatik kaydedilmez.
        </p>
        <form onSubmit={submit} className="mt-4 flex flex-wrap gap-2">
          <input className="input min-w-[240px] flex-1" placeholder="https://…" aria-label="Canavar sayfası linki" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
          <input className="input w-28" type="number" min={1} placeholder="Vnum" aria-label="Vnum (isteğe bağlı)" value={vnum} onChange={(e) => setVnum(e.target.value)} />
          <button className="btn-primary" disabled={loading || !url.trim()}>
            {loading && <Spinner />}
            Getir
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        {draft && m && (
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex items-center gap-3">
              {draft.assets.iconUrl && (
                <img src={draft.assets.iconUrl} referrerPolicy="no-referrer" alt="" className="h-12 w-12 rounded border border-white/10 object-contain" />
              )}
              <div>
                <div className="font-medium text-slate-100">
                  {m.name} <span className="text-slate-500">#{m.vnum}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                  <RankBadge rank={m.rank} /> Sv. {m.level} · {raceLabel(m.race)} · <span className="font-mono">{m.code}</span>
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              {[
                ['HP', m.hp],
                ['EXP', m.exp],
                ['Hasar', `${m.damageMin} – ${m.damageMax}`],
                ['Savunma', m.defense],
                ['Direnç', Object.keys(m.resists).length],
                ['3D model', draft.assets.modelUrl ? 'var' : 'yok'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-white/[0.03] px-2 py-1.5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="tabular-nums text-slate-200">{typeof v === 'number' ? v.toLocaleString('tr-TR') : v}</dd>
                </div>
              ))}
            </dl>
            {draft.warnings.length > 0 && (
              <ul className="space-y-0.5 text-amber-200">
                {draft.warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            )}
            {draft.existingMonsterId && <p className="text-slate-300">Bu vnum zaten kayıtlı; mevcut canavarın düzenleyicisinde açılacak.</p>}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={loading}>
            Vazgeç
          </button>
          <button className="btn-primary" disabled={!draft} onClick={() => draft && onConfirm(draft)}>
            Düzenleyicide aç
          </button>
        </div>
      </div>
    </div>
  );
}
