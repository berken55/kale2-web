import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DROP_ROLL_MODES } from '@shared/drops';
import type { DropGroup, DropGroupEntry, DropGroupSummary, DropItemRef } from '@shared/types';
import { api, ApiError } from '../api';
import { DropRowsEditor, emptyRange } from '../components/drops';
import { EmptyState, Field, NumberInput, PageHeader, Spinner, useConfirm, useToast } from '../components/ui';

export function DropGroupListPage() {
  const [groups, setGroups] = useState<DropGroupSummary[] | null>(null);
  const toast = useToast();

  useEffect(() => {
    api.get<DropGroupSummary[]>('/api/drop-groups').then(setGroups).catch((e) => toast('error', e.message));
  }, [toast]);

  return (
    <>
      <PageHeader
        title="Drop Grupları"
        subtitle="Birden çok yaratığın paylaştığı drop listeleri (ör. seviye 20–30 iksirleri, boss sandığı)"
        actions={
          <Link to="/admin/drop-groups/new" className="btn-primary">
            + Yeni grup
          </Link>
        }
      />
      <div className="card overflow-hidden">
        {!groups ? (
          <div className="p-6">
            <Spinner className="text-brand-400" />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            title="Henüz drop grubu yok"
            text="Aynı itemleri birçok yaratığa düşürtmek istediğinizde bir grup oluşturun ve yaratığın Droplar sekmesinden ekleyin."
            action={
              <Link to="/admin/drop-groups/new" className="btn-primary">
                + Yeni grup
              </Link>
            }
          />
        ) : (
          <table className="w-full">
            <thead className="border-b border-white/5 bg-white/[0.02]">
              <tr>
                <th className="table-head">Grup</th>
                <th className="table-head">Kural</th>
                <th className="table-head text-right">Item</th>
                <th className="table-head text-right">Kullanan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {groups.map((g) => (
                <tr key={g.id} className="hover:bg-white/[0.02]">
                  <td className="table-cell">
                    <Link to={`/admin/drop-groups/${g.id}`} className="font-medium text-slate-100 hover:text-brand-300">
                      {g.name}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{g.code}</div>
                  </td>
                  <td className="table-cell text-sm text-slate-300">
                    {g.rollMode === 'EACH' ? 'Her satır ayrı zar' : `Ağırlıklı ${g.rolls} seçim`}
                  </td>
                  <td className="table-cell text-right tabular-nums">{g.entryCount}</td>
                  <td className="table-cell text-right text-sm text-slate-400">
                    {g.usedByMonsters} yaratık{g.usedByLevelDrops ? ` · ${g.usedByLevelDrops} genel` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

type Form = Pick<DropGroup, 'code' | 'name' | 'rollMode' | 'rolls' | 'description' | 'entries'>;
const EMPTY: Form = { code: '', name: '', rollMode: 'EACH', rolls: 1, description: '', entries: [] };

export function DropGroupEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [group, setGroup] = useState<DropGroup | null>(null);
  const [form, setForm] = useState<Form | null>(isNew ? EMPTY : null);
  const [saved, setSaved] = useState(JSON.stringify(EMPTY));
  const [items, setItems] = useState<Record<number, DropItemRef>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const apply = (g: DropGroup) => {
    const f: Form = { code: g.code, name: g.name, rollMode: g.rollMode, rolls: g.rolls, description: g.description, entries: g.entries };
    setGroup(g);
    setForm(f);
    setSaved(JSON.stringify(f));
    setItems(g.items);
  };

  useEffect(() => {
    if (isNew) {
      setGroup(null);
      setForm(EMPTY);
      setSaved(JSON.stringify(EMPTY));
      return;
    }
    api.get<DropGroup>(`/api/drop-groups/${id}`).then(apply).catch((e) => setLoadError(e.message));
  }, [id, isNew]);

  const dirty = form !== null && JSON.stringify(form) !== saved;

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setErrors({});
    try {
      const g = isNew ? await api.post<DropGroup>('/api/drop-groups', form) : await api.put<DropGroup>(`/api/drop-groups/${id}`, form);
      apply(g);
      toast('success', isNew ? 'Grup oluşturuldu.' : 'Değişiklikler kaydedildi.');
      if (isNew) navigate(`/admin/drop-groups/${g.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        const map: Record<string, string> = {};
        for (const issue of e.issues) map[issue.path.split('.')[0]] ??= issue.message;
        if (e.status === 409) map.code = e.message;
        setErrors(map);
      }
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!group) return;
    if (!(await confirm({ title: 'Grup silinsin mi?', message: `"${group.name}" kalıcı olarak silinecek.`, confirmText: 'Sil', danger: true }))) return;
    try {
      await api.del(`/api/drop-groups/${group.id}`);
      toast('success', 'Grup silindi.');
      navigate('/admin/drop-groups');
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  if (loadError) return <EmptyState title="Grup yüklenemedi" text={loadError} action={<Link to="/admin/drop-groups" className="btn-ghost">Listeye dön</Link>} />;
  if (!form) return <Spinner className="text-brand-400" />;
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  return (
    <>
      <PageHeader
        title={isNew ? 'Yeni Drop Grubu' : form.name || 'İsimsiz grup'}
        subtitle={group ? `${group.usedBy.length} yaratık kullanıyor` : undefined}
        actions={
          <>
            <Link to="/admin/drop-groups" className="btn-ghost">
              ← Liste
            </Link>
            {group && (
              <button className="btn-danger" onClick={remove}>
                Sil
              </button>
            )}
            <button className="btn-primary" onClick={save} disabled={saving || (!dirty && !isNew)}>
              {saving && <Spinner />}
              {isNew ? 'Oluştur' : dirty ? 'Kaydet' : 'Kaydedildi'}
            </button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="card space-y-6 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="İsim" error={errors.name}>
              <input className="input" value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Kod" error={errors.code} hint="Oyunun ve bundle'ın kullandığı kısa ad (ör. wolf_common)">
              <input className="input font-mono" value={form.code} maxLength={40} onChange={(e) => set({ code: e.target.value.toLowerCase() })} />
            </Field>
            <Field label="Kural" hint={form.rollMode === 'EACH' ? 'Her item kendi şansıyla bağımsız düşer.' : 'Ağırlığa göre her seçimde tek item düşer.'}>
              <select className="input" value={form.rollMode} onChange={(e) => set({ rollMode: e.target.value as Form['rollMode'] })}>
                {DROP_ROLL_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            {form.rollMode === 'ONE_OF' && (
              <Field label="Seçim sayısı" error={errors.rolls} hint="Grup tetiklenince kaç item seçilir">
                <NumberInput value={form.rolls} min={1} max={20} onChange={(v) => set({ rolls: v })} aria-label="Seçim sayısı" />
              </Field>
            )}
            <div className="sm:col-span-2">
              <Field label="Açıklama">
                <textarea className="input min-h-[70px]" value={form.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />
              </Field>
            </div>
          </div>
          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Itemler</h3>
            <DropRowsEditor<DropGroupEntry>
              rows={form.entries}
              onChange={(entries) => set({ entries })}
              items={items}
              onItemRef={(i) => setItems((cur) => ({ ...cur, [i.vnum]: i }))}
              weight={form.rollMode === 'ONE_OF'}
              newRow={(t) => ({ itemVnum: t.itemVnum!, ...emptyRange(form.rollMode === 'ONE_OF' ? 1 : 100_000) })}
            />
            {errors.entries && <p className="mt-2 text-xs text-red-400">{errors.entries}</p>}
          </section>
        </div>
        <aside className="card h-fit p-4 text-sm">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Kullanan yaratıklar</h2>
          {!group || group.usedBy.length === 0 ? (
            <p className="text-slate-500">Henüz hiçbir yaratık bu grubu kullanmıyor.</p>
          ) : (
            <ul className="space-y-1">
              {group.usedBy.map((m) => (
                <li key={m.id}>
                  <Link to={`/admin/monsters/${m.id}`} className="text-slate-200 hover:text-brand-300">
                    {m.name}
                  </Link>{' '}
                  <span className="text-xs text-slate-500">#{m.vnum}</span>
                </li>
              ))}
            </ul>
          )}
          {group && group.usedByLevelDrops > 0 && <p className="mt-2 text-slate-400">{group.usedByLevelDrops} genel drop satırında kullanılıyor.</p>}
        </aside>
      </div>
    </>
  );
}
