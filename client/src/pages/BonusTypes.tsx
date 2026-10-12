import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { BonusType } from '@shared/types';
import { api } from '../api';
import { Field, NumberInput, PageHeader, Spinner, useConfirm, useToast } from '../components/ui';

type Row = BonusType & { usageCount: number };
type Draft = Omit<BonusType, 'id'>;

const EMPTY: Draft = { code: '', name: '', unit: '', maxValue: 0, description: '' };

export function BonusTypesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editing, setEditing] = useState<{ id: number | null; draft: Draft } | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const load = () =>
    api
      .get<Row[]>('/api/bonus-types')
      .then(setRows)
      .catch((e) => toast('error', e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return (rows ?? []).filter((r) => !q || r.name.toLocaleLowerCase('tr-TR').includes(q) || r.code.toLowerCase().includes(q));
  }, [rows, search]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) await api.put(`/api/bonus-types/${editing.id}`, editing.draft);
      else await api.post('/api/bonus-types', editing.draft);
      toast('success', editing.id ? 'Bonus güncellendi.' : 'Bonus eklendi.');
      setEditing(null);
      load();
    } catch (err) {
      toast('error', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Row) => {
    if (!(await confirm({ title: 'Bonus silinsin mi?', message: `"${r.name}" tanımı silinecek.`, confirmText: 'Sil', danger: true }))) return;
    try {
      await api.del(`/api/bonus-types/${r.id}`);
      toast('success', 'Bonus silindi.');
      load();
    } catch (err) {
      toast('error', (err as Error).message);
    }
  };

  const setDraft = <K extends keyof Draft>(k: K, v: Draft[K]) => setEditing((e) => e && { ...e, draft: { ...e.draft, [k]: v } });

  return (
    <>
      <PageHeader
        title="Bonus Tanımları"
        subtitle="Itemlere eklenebilecek bonus (efsun) türleri ve üst sınırları"
        actions={
          <button className="btn-primary" onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}>
            + Yeni bonus
          </button>
        }
      />

      {editing && (
        <form onSubmit={submit} className="card mb-6 p-5">
          <h2 className="mb-4 font-display text-gold-300">{editing.id ? 'Bonusu düzenle' : 'Yeni bonus'}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Kod" hint="Örn. ATTBONUS_HUMAN">
              <input
                className="input font-mono uppercase"
                value={editing.draft.code}
                onChange={(e) => setDraft('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                required
                autoFocus
              />
            </Field>
            <Field label="İsim">
              <input className="input" value={editing.draft.name} onChange={(e) => setDraft('name', e.target.value)} required />
            </Field>
            <Field label="Birim">
              <select className="input" value={editing.draft.unit} onChange={(e) => setDraft('unit', e.target.value as Draft['unit'])}>
                <option value="">Sabit değer</option>
                <option value="%">Yüzde (%)</option>
              </select>
            </Field>
            <Field label="Üst sınır" hint="0 = sınırsız">
              <NumberInput value={editing.draft.maxValue} min={0} step={0.1} onChange={(v) => setDraft('maxValue', v)} />
            </Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <Field label="Açıklama">
                <input className="input" value={editing.draft.description} onChange={(e) => setDraft('description', e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" disabled={busy}>
              {busy && <Spinner />} Kaydet
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
              Vazgeç
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-white/5 p-4">
          <input className="input max-w-sm" placeholder="Bonus ara…" aria-label="Bonus ara" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {!rows ? (
          <div className="p-6">
            <Spinner className="text-gold-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead className="border-b border-white/5 bg-white/[0.02]">
                <tr>
                  <th className="table-head">İsim</th>
                  <th className="table-head">Kod</th>
                  <th className="table-head">Üst sınır</th>
                  <th className="table-head">Kullanım</th>
                  <th className="table-head text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="table-cell text-[#8fc6ff]">
                      {r.name}
                      {r.description && <div className="text-xs text-slate-500">{r.description}</div>}
                    </td>
                    <td className="table-cell font-mono text-xs text-slate-400">{r.code}</td>
                    <td className="table-cell tabular-nums">{r.maxValue > 0 ? `${r.maxValue}${r.unit}` : 'Sınırsız'}</td>
                    <td className="table-cell tabular-nums text-slate-400">{r.usageCount} item</td>
                    <td className="table-cell">
                      <div className="flex justify-end gap-1.5">
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => {
                            const { id, usageCount: _u, ...draft } = r;
                            setEditing({ id, draft });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          Düzenle
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          disabled={r.usageCount > 0}
                          title={r.usageCount > 0 ? 'Itemlerde kullanılan bonus silinemez' : undefined}
                          onClick={() => remove(r)}
                        >
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
    </>
  );
}
