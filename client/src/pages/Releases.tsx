import { useCallback, useEffect, useState } from 'react';
import { MONSTER_STATS_MODES, type GameConfig, type ReleaseChange, type ReleasePreview, type ReleaseSummary } from '@shared/bundle';
import { api } from '../api';
import { PageHeader, Spinner, useConfirm, useToast } from '../components/ui';

const KIND_LABEL: Record<ReleaseChange['kind'], string> = {
  monster: 'Canavar',
  item: 'Item',
  drop_group: 'Drop grubu',
  level_drops: 'Genel drop',
  config: 'Ayar',
  map: 'Harita',
};
const CHANGE_STYLE: Record<ReleaseChange['change'], [string, string]> = {
  added: ['Yeni', 'bg-emerald-500/10 text-emerald-300'],
  changed: ['Değişti', 'bg-gold-500/10 text-gold-300'],
  removed: ['Silindi', 'bg-red-500/10 text-red-300'],
};

/** Paneldeki taslak veriyi oyuna giden numaralı sürüm (bundle) olarak yayınlar. */
export function ReleasesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [preview, setPreview] = useState<ReleasePreview | null>(null);
  const [releases, setReleases] = useState<ReleaseSummary[] | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<GameConfig | null>(null);

  const load = useCallback(() => {
    api.get<ReleasePreview>('/api/releases/preview').then(setPreview).catch((e) => toast('error', e.message));
    api.get<ReleaseSummary[]>('/api/releases').then(setReleases).catch((e) => toast('error', e.message));
    api.get<GameConfig>('/api/game-config').then(setConfig).catch(() => {});
  }, [toast]);

  const setStatsMode = async (mode: GameConfig['monster_stats']) => {
    try {
      setConfig(await api.put<GameConfig>('/api/game-config', { monster_stats: mode }));
      load();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  useEffect(load, [load]);

  const publish = async () => {
    setBusy(true);
    try {
      const r = await api.post<ReleaseSummary>('/api/releases', { notes });
      toast('success', `v${r.version} yayınlandı. Oyun sunucusu bir dakika içinde alır.`);
      setNotes('');
      load();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const activate = async (r: ReleaseSummary) => {
    if (!(await confirm({ title: `v${r.version} aktif yapılsın mı?`, message: 'Oyun sunucusu bu sürüme döner. Paneldeki taslak veri değişmez.', confirmText: 'Aktif yap' }))) return;
    try {
      await api.post(`/api/releases/${r.id}/activate`);
      toast('success', `v${r.version} aktif.`);
      load();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const blocked = !preview || preview.errors.length > 0 || preview.changes.length === 0;

  return (
    <>
      <PageHeader title="Yayınla" subtitle="Paneldeki değişiklikler oyuna yalnızca yayınlanınca gider. Her yayın numaralı bir sürümdür; eskisine dönülebilir." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-gold-300">Yayınlanacaklar</h2>
            {preview && (
              <span className="text-xs text-slate-500">
                {preview.counts.monsters} canavar · {preview.counts.items} item · {preview.counts.dropGroups} drop grubu · {preview.counts.levelDrops} genel drop · {preview.counts.regions} spawn bölgesi
                {preview.activeVersion ? ` · aktif: v${preview.activeVersion}` : ' · henüz yayın yok'}
              </span>
            )}
          </div>
          {!preview ? (
            <Spinner className="mt-4 text-gold-400" />
          ) : (
            <div className="mt-4 space-y-4 text-sm">
              {preview.errors.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="mb-1 font-medium text-red-300">Yayını engelleyen sorunlar</div>
                  <ul className="space-y-0.5 text-red-200">
                    {preview.errors.map((e) => (
                      <li key={e}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <details className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <summary className="cursor-pointer text-amber-200">{preview.warnings.length} uyarı (yayını engellemez)</summary>
                  <ul className="mt-2 space-y-0.5 text-amber-100/80">
                    {preview.warnings.map((w) => (
                      <li key={w}>• {w}</li>
                    ))}
                  </ul>
                </details>
              )}
              {config && (
                <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <label className="flex flex-wrap items-center gap-3">
                    <span className="text-slate-300">Canavar isim ve statları:</span>
                    <select className="input w-auto py-1" value={config.monster_stats} onChange={(e) => setStatsMode(e.target.value as GameConfig['monster_stats'])}>
                      {MONSTER_STATS_MODES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    {config.monster_stats === 'game'
                      ? 'Oyun kendi isim, saldırganlık ve dengesini korur; panelden yalnızca droplar gelir. Metin2 değerleri oyuna göre ayarlanınca "Paneldeki değerler"e geçin.'
                      : 'İsim, saldırganlık, boss durumu, HP ve hasar panelden gelir. HP ve hasar yaratığın kendi seviyesinde birebir uygulanır, diğer seviyelere oyunun kuralıyla ölçeklenir.'}
                  </p>
                </div>
              )}
              {preview.changes.length === 0 ? (
                <p className="text-slate-400">Aktif sürümden bu yana değişiklik yok.</p>
              ) : (
                <ul className="max-h-[420px] divide-y divide-white/5 overflow-y-auto">
                  {preview.changes.map((c) => (
                    <li key={`${c.kind}-${c.key}`} className="flex items-center gap-3 py-1.5">
                      <span className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] ${CHANGE_STYLE[c.change][1]}`}>{CHANGE_STYLE[c.change][0]}</span>
                      <span className="w-24 shrink-0 text-xs text-slate-500">{KIND_LABEL[c.kind]}</span>
                      <span className="truncate text-slate-200">{c.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
                <input className="input min-w-[220px] flex-1" placeholder="Not (isteğe bağlı): ör. kurt dropları ayarlandı" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
                <button className="btn-primary" onClick={publish} disabled={busy || blocked}>
                  {busy && <Spinner />}
                  Yayınla
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="card h-fit p-4">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Sürümler</h2>
          {!releases ? (
            <Spinner className="text-gold-400" />
          ) : releases.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz yayın yok.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {releases.map((r) => (
                <li key={r.id} className={`rounded-lg border p-3 ${r.isActive ? 'border-gold-500/40 bg-gold-500/5' : 'border-white/5'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-slate-100">v{r.version}</span>
                    {r.isActive ? (
                      <span className="text-xs text-gold-300">Oyunda aktif</span>
                    ) : (
                      <button className="text-xs text-gold-400 hover:text-gold-300" onClick={() => activate(r)}>
                        Bu sürüme dön
                      </button>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {new Date(r.createdAt.replace(' ', 'T') + (r.createdAt.endsWith('Z') ? '' : 'Z')).toLocaleString('tr-TR')} · {r.counts.monsters} canavar · {r.counts.items} item
                  </div>
                  {r.notes && <div className="mt-1 text-xs text-slate-300">{r.notes}</div>}
                  <a href={`/api/releases/${r.id}/bundle`} className="mt-1 inline-block text-xs text-slate-500 hover:text-gold-300">
                    JSON indir
                  </a>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}
