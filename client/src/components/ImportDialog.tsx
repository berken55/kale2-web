import { useEffect, useState, type FormEvent } from 'react';
import { CLASSES, ITEM_SUBTYPES, ITEM_TYPES, labelOf, type ItemType } from '@shared/constants';
import type { ImportDraft, Item } from '@shared/types';
import { api, uploadFile } from '../api';
import { Spinner, useToast } from './ui';

export interface ImportAssets {
  iconUrl: string | null;
  modelUrl: string | null;
}

export interface ImportResult {
  draft: ImportDraft;
  assets: ImportAssets;
}

const FOUND_LABELS: Record<string, string> = {
  vnum: 'Vnum',
  name: 'İsim',
  levelRequired: 'Seviye',
  classes: 'Sınıflar',
  stats: 'Güç değerleri',
  upgrades: 'Yükseltme tablosu',
  bonuses: 'Bonuslar',
};

/**
 * Harici bir item sayfasının linkini alır, sunucuda okutur ve sonucu önizletir.
 * Hiçbir şey otomatik kaydedilmez; onaylanan taslak düzenleyicide açılır.
 */
export function ImportDialog({
  open,
  onClose,
  onConfirm,
  initialUrl = '',
  refreshOf,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: ImportResult & { target: 'new' | 'existing' }) => void;
  initialUrl?: string;
  /** "Kaynaktan güncelle" modunda güncellenecek item */
  refreshOf?: Item;
}) {
  const toast = useToast();
  const [vnum, setVnum] = useState('');
  const [cookieConfigured, setCookieConfigured] = useState(false);
  const [cookieBusy, setCookieBusy] = useState(false);
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [useIcon, setUseIcon] = useState(true);
  const [useModel, setUseModel] = useState(true);
  const [target, setTarget] = useState<'new' | 'existing'>('existing');
  const [materials, setMaterials] = useState<{ running: boolean; done: number; failed: string[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    setVnum('');
    api.get<{ cookieConfigured: boolean }>('/api/import/sources').then((s) => setCookieConfigured(s.cookieConfigured)).catch(() => {});
    setDraft(null);
    setError('');
    setMaterials(null);
    if (initialUrl) fetchDraft(initialUrl, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !loading && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  const fetchDraft = async (u: string, requestedVnum = vnum) => {
    setLoading(true);
    setError('');
    setDraft(null);
    try {
      const d = await api.post<ImportDraft>('/api/import/url', { url: u, ...(requestedVnum ? { vnum: Number(requestedVnum) } : {}) });
      setDraft(d);
      setUseIcon(!!d.assets.iconUrl);
      setUseModel(!!d.assets.modelUrl);
      setTarget(d.existingItemId ? 'existing' : 'new');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) fetchDraft(url.trim());
  };

  const setItem = (patch: Partial<ImportDraft['item']>) => setDraft((d) => (d ? { ...d, item: { ...d.item, ...patch } } : d));

  /** Eksik yükseltme malzemelerini aynı kaynaktan okuyup doğrudan "Malzeme" olarak kaydeder. */
  const importMaterials = async () => {
    if (!draft) return;
    const list = draft.missingMaterials.filter((m) => m.url);
    setMaterials({ running: true, done: 0, failed: [] });
    const failed: string[] = [];
    for (const m of list) {
      try {
        const md = await api.post<ImportDraft>('/api/import/url', { url: m.url, type: 'MATERIAL', subtype: 'REFINE' });
        if (!md.existingItemId) {
          const created = await api.post<Item>('/api/items', { ...md.item, stackSize: 200, upgrades: [], bonuses: [] });
          if (md.assets.iconUrl) {
            await api.post(`/api/items/${created.id}/remote-media`, { kind: 'icon', url: md.assets.iconUrl }).catch(() => {});
          }
        }
      } catch (e) {
        failed.push(`${m.name}: ${(e as Error).message}`);
      }
      setMaterials((s) => s && { ...s, done: s.done + 1 });
    }
    setMaterials({ running: false, done: list.length, failed });
    setDraft((d) => (d ? { ...d, missingMaterials: d.missingMaterials.filter((m) => !m.url || failed.some((f) => f.startsWith(m.name))) } : d));
    if (!failed.length) toast('success', `${list.length} malzeme oluşturuldu.`);
  };

  const confirm = async () => {
    if (!draft) return;
    let item = draft.item;
    if (!refreshOf && target === 'new' && draft.existingItemId) {
      const { vnum } = await api.get<{ vnum: number }>('/api/items/next-vnum');
      item = { ...item, vnum };
    }
    onConfirm({
      draft: { ...draft, item },
      assets: { iconUrl: useIcon ? draft.assets.iconUrl : null, modelUrl: useModel ? draft.assets.modelUrl : null },
      target: refreshOf ? 'existing' : target,
    });
  };

  if (!open) return null;
  const it = draft?.item;
  const top = it ? Math.max(0, ...it.upgrades.map((u) => u.level)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:py-12" onClick={() => !loading && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="card w-full max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <h2 id="import-title" className="font-display text-xl text-brand-300">
          {refreshOf ? 'Kaynaktan güncelle' : 'Linkten içe aktar'}
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Metin2Alerts eşya / canavar / NPC veya m2icondb eşya / canavar / 3D bağlantısını yapıştırın. Özellikleri kontrol edip kaydedin; model ve dokular kayıt sırasında indirilir.
        </p>

        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input
            className="input"
            placeholder="https://metin2alerts.com/en/wiki/item/180-poison-sword"
            aria-label="Item linki"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
            disabled={!!refreshOf}
          />
          <button className="btn-primary shrink-0" disabled={loading || cookieBusy || !url.trim()}>
            {loading && <Spinner />} {draft ? 'Yeniden oku' : 'Getir'}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <label>Vnum (3D linkinde yoksa)
            <input className="input mt-1" type="number" min="1" max="2000000000" value={vnum} onChange={(e) => setVnum(e.target.value)} placeholder="Otomatik" disabled={loading} />
          </label>
          <label className="btn-ghost btn-sm cursor-pointer">
            {cookieBusy ? 'Yükleniyor…' : cookieConfigured ? 'Çerezi yenile (cookies.txt)' : 'Çerez yükle (cookies.txt)'}
            <input className="hidden" type="file" accept=".txt" disabled={cookieBusy || loading} onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setCookieBusy(true);
              try {
                await uploadFile('/api/import/cookies', file);
                setCookieConfigured(true);
                toast('success', 'Çerez yüklendi. Bağlantıyı yeniden getirebilirsiniz.');
              } catch (error) { setError((error as Error).message); }
              finally { setCookieBusy(false); }
            }} />
          </label>
          {cookieConfigured && <button className="btn-ghost btn-sm" disabled={cookieBusy || loading} onClick={async () => {
            try { await api.del('/api/import/cookies'); setCookieConfigured(false); }
            catch (error) { setError((error as Error).message); }
          }}>Çerezi sil</button>}
          <span>m2icondb modelleri için çerez gerekmez.</span>
        </div>
        {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

        {draft && it && (
          <div className="mt-5 space-y-5">
            <div className="flex gap-4 rounded-lg border border-white/5 bg-ink-850 p-4">
              {draft.assets.iconUrl && (
                <img src={draft.assets.iconUrl} referrerPolicy="no-referrer" alt="" className="h-12 w-12 shrink-0 rounded border border-white/10 object-contain [image-rendering:pixelated]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-100">{it.name}</div>
                <div className="text-xs text-slate-500">
                  Vnum #{it.vnum} · Seviye {it.levelRequired || '—'} · {it.classes.length ? it.classes.map((c) => labelOf(CLASSES, c)).join(', ') : 'Sınıf bilgisi yok'}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {it.stats.maxAttack > 0 && `Saldırı ${it.stats.minAttack}-${it.stats.maxAttack} · `}
                  {it.stats.maxMagicAttack > 0 && `Büyü ${it.stats.minMagicAttack}-${it.stats.maxMagicAttack} · `}
                  {it.stats.defense > 0 && `Savunma ${it.stats.defense} · `}
                  {it.upgrades.length ? `Yükseltme +0…+${top}` : 'Yükseltme tablosu yok'} · {it.bonuses.length} bonus
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Tip</span>
                <select
                  className="input"
                  value={it.type}
                  onChange={(e) => setItem({ type: e.target.value, subtype: ITEM_SUBTYPES[e.target.value as ItemType][0].value })}
                >
                  {ITEM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Alt tip</span>
                <select className="input" value={it.subtype} onChange={(e) => setItem({ subtype: e.target.value })}>
                  {ITEM_SUBTYPES[it.type as ItemType].map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
              {Object.entries(FOUND_LABELS).map(([k, label]) => {
                const ok = draft.found.includes(k);
                return (
                  <span key={k} className={`rounded-full px-2 py-0.5 ${ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                    {ok ? '✓' : '!'} {label}
                  </span>
                );
              })}
            </div>

            {draft.warnings.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-200">
                {draft.warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            )}

            {draft.unresolvedBonuses.length > 0 && (
              <div className="text-sm">
                <div className="text-slate-300">Panelde karşılığı olmayan bonuslar (taslağa eklenmedi):</div>
                <ul className="mt-1 list-inside list-disc text-slate-400">
                  {draft.unresolvedBonuses.map((b) => (
                    <li key={b.label}>
                      {b.label} +{b.value}
                      {b.unit}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-slate-500">Bunları "Bonus Tanımları" sayfasından ekleyip tekrar okutabilirsiniz.</p>
              </div>
            )}

            {draft.missingMaterials.length > 0 && (
              <div className="rounded-lg border border-white/5 p-3 text-sm">
                <div className="text-slate-300">Panelde tanımlı olmayan yükseltme malzemeleri ({draft.missingMaterials.length}):</div>
                <div className="mt-1 text-xs text-slate-400">{draft.missingMaterials.map((m) => `${m.name} (#${m.vnum})`).join(', ')}</div>
                {draft.missingMaterials.some((m) => m.url) && (
                  <button type="button" className="btn-ghost btn-sm mt-3" disabled={materials?.running} onClick={importMaterials}>
                    {materials?.running && <Spinner />}
                    {materials?.running ? `Oluşturuluyor… ${materials.done}/${draft.missingMaterials.filter((m) => m.url).length}` : 'Bunları da malzeme olarak içe aktar'}
                  </button>
                )}
                {materials && !materials.running && materials.failed.length > 0 && (
                  <ul className="mt-2 text-xs text-red-300">
                    {materials.failed.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {(draft.assets.iconUrl || draft.assets.modelUrl) && (
              <div className="space-y-2 text-sm">
                <div className="text-slate-300">Kaydettikten sonra kaynaktan indirilecek dosyalar:</div>
                {draft.assets.iconUrl && (
                  <label className="flex items-center gap-2 text-slate-300">
                    <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={useIcon} onChange={(e) => setUseIcon(e.target.checked)} />
                    İkon
                  </label>
                )}
                {draft.assets.modelUrl && (
                  <label className="flex items-center gap-2 text-slate-300">
                    <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={useModel} onChange={(e) => setUseModel(e.target.checked)} />
                    3D model <span className="truncate text-xs text-slate-500">({decodeURIComponent(draft.assets.modelUrl.split('/').pop() ?? '')})</span>
                  </label>
                )}
              </div>
            )}

            {!refreshOf && draft.existingItemId && (
              <fieldset className="space-y-2 rounded-lg border border-brand-500/20 bg-brand-500/5 p-3 text-sm">
                <legend className="px-1 text-brand-300">#{it.vnum} vnum'lu item panelde zaten var</legend>
                <label className="flex items-center gap-2 text-slate-300">
                  <input type="radio" name="target" className="accent-brand-500" checked={target === 'existing'} onChange={() => setTarget('existing')} />
                  Mevcut itemi bu verilerle güncelle (kaydetmeden önce düzenleyicide görürsünüz)
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <input type="radio" name="target" className="accent-brand-500" checked={target === 'new'} onChange={() => setTarget('new')} />
                  Yeni bir vnum ile ayrı item olarak oluştur
                </label>
              </fieldset>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
            Vazgeç
          </button>
          <button type="button" className="btn-primary" disabled={!draft || loading || materials?.running} onClick={confirm}>
            Düzenleyicide aç
          </button>
        </div>
      </div>
    </div>
  );
}
