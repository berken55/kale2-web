import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { GameMapDetail, GameMapSummary } from '@shared/types';
import { api, ApiError } from '../api';
import { EmptyState, Field, PageHeader, Spinner, useToast } from '../components/ui';

export interface MapForm {
  code: string;
  name: string;
  worldMinX: number;
  worldMinZ: number;
  worldMaxX: number;
  worldMaxZ: number;
}

/** Oyundaki haritalar; her haritanın minimap'i üstüne spawn bölgeleri çizilir. */
export function MapListPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [maps, setMaps] = useState<GameMapSummary[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get<GameMapSummary[]>('/api/maps').then(setMaps).catch((e) => toast('error', e.message));
  }, [toast]);

  return (
    <>
      <PageHeader
        title="Haritalar"
        subtitle="Köy gibi haritalarda yaratıkların doğduğu bölgeler"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + Yeni harita
          </button>
        }
      />
      {creating && (
        <div className="card mb-4 p-5">
          <MapSettingsForm
            initial={{ code: 'village1', name: '1. Köy', worldMinX: -260, worldMinZ: -260, worldMaxX: 260, worldMaxZ: 260 }}
            submitLabel="Oluştur"
            onCancel={() => setCreating(false)}
            onSubmit={async (f) => {
              const m = await api.post<GameMapDetail>('/api/maps', f);
              navigate(`/admin/maps/${m.id}`);
            }}
          />
        </div>
      )}
      <div className="card overflow-hidden">
        {!maps ? (
          <div className="p-6">
            <Spinner className="text-gold-400" />
          </div>
        ) : maps.length === 0 ? (
          <EmptyState
            title="Henüz harita yok"
            text="Oyunun köy haritasını ekleyin (kod: village1). Minimap resmi ve dünya sınırlarını oyundaki dışa aktarma aracı verir."
          />
        ) : (
          <ul className="divide-y divide-white/5">
            {maps.map((m) => (
              <li key={m.id}>
                <Link to={`/admin/maps/${m.id}`} className="flex items-center gap-4 p-4 hover:bg-white/[0.02]">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-ink-850">
                    {m.minimapUrl && <img src={m.minimapUrl} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-100">{m.name}</div>
                    <div className="font-mono text-xs text-slate-500">{m.code}</div>
                  </div>
                  <div className="ml-auto text-right text-sm text-slate-400">
                    {m.regionCount} bölge · {m.spawnCount} spawn
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function MapSettingsForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: MapForm;
  submitLabel: string;
  onSubmit: (f: MapForm) => Promise<void>;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const num = (k: keyof MapForm) => (
    <input className="input tabular-nums" type="number" value={f[k]} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} aria-label={k} />
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await onSubmit(f);
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {};
        for (const i of err.issues) map[i.path] ??= i.message;
        if (err.status === 409) map.code = err.message;
        setErrors(map);
      }
      toast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="İsim" error={errors.name}>
          <input className="input" value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Harita kodu" error={errors.code} hint="Oyundaki harita adı (köy: village1)">
          <input className="input font-mono" value={f.code} maxLength={40} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase() })} />
        </Field>
      </div>
      <div>
        <span className="label">Minimap'in kapsadığı dünya dikdörtgeni (metre)</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-xs text-slate-500">
            Min X {num('worldMinX')}
          </label>
          <label className="text-xs text-slate-500">
            Min Z {num('worldMinZ')}
          </label>
          <label className="text-xs text-slate-500">
            Max X {num('worldMaxX')}
          </label>
          <label className="text-xs text-slate-500">
            Max Z {num('worldMaxZ')}
          </label>
        </div>
        {(errors.worldMaxX || errors.worldMaxZ) && <p className="mt-1 text-xs text-red-400">{errors.worldMaxX ?? errors.worldMaxZ}</p>}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Vazgeç
          </button>
        )}
        <button className="btn-primary" disabled={busy}>
          {busy && <Spinner />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
