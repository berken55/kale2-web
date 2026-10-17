import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  MONSTER_ABILITIES,
  MONSTER_ELEMENTS,
  MONSTER_FLAGS,
  MONSTER_RACES,
  MONSTER_RANKS,
  MONSTER_RESISTS,
  type Option,
} from '@shared/constants';
import type { DropGroupSummary, Monster, MonsterDropsResponse, MonsterImportDraft, MonsterInput } from '@shared/types';
import { api, ApiError } from '../api';
import { ModelViewer } from '../components/LazyModelViewer';
import { RankBadge, elementLabel, raceLabel, signedPct } from '../components/monster-ui';
import { EmptyState, Field, NumberInput, PageHeader, Spinner, useConfirm, useToast } from '../components/ui';
import { MediaTab } from './ItemEditor';
import { DropsTab, type DropState } from './MonsterDrops';
import { MonsterIcon, type MonsterImportState } from './MonsterList';

type Form = MonsterInput;

const emptyForm = (vnum: number): Form => ({
  vnum,
  code: '',
  name: '',
  rank: 'NORMAL',
  level: 1,
  race: '',
  element: '',
  hp: 100,
  hpRegenPct: 0,
  hpRegenSec: 0,
  exp: 0,
  damageMin: 0,
  damageMax: 0,
  defense: 0,
  str: 0,
  dex: 0,
  vit: 0,
  int: 0,
  attackSpeed: 100,
  moveSpeed: 100,
  attackRange: 1.5,
  aggressive: false,
  aggroRange: 8,
  yangMin: 0,
  yangMax: 0,
  resists: {},
  abilities: {},
  flags: [],
  modelScale: 1,
  description: '',
  sourceUrl: null,
});

const toForm = (m: Monster): Form => {
  const { id: _i, iconUrl: _a, modelUrl: _b, modelFileName: _c, createdAt: _d, updatedAt: _e, ...form } = m;
  return form;
};

/** İsimden oyun kodu önerisi: "Gri Kurt" → gri_kurt */
const suggestCode = (name: string) =>
  name
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 40);

const TABS = [
  { key: 'general', label: 'Genel', fields: ['vnum', 'code', 'name', 'rank', 'level', 'race', 'element', 'description'] },
  { key: 'combat', label: 'Savaş Değerleri', fields: ['hp', 'hpRegenPct', 'hpRegenSec', 'exp', 'damageMin', 'damageMax', 'defense', 'str', 'dex', 'vit', 'int', 'attackSpeed', 'moveSpeed', 'yangMin', 'yangMax'] },
  { key: 'ai', label: 'Davranış', fields: ['aggressive', 'aggroRange', 'attackRange', 'flags'] },
  { key: 'resists', label: 'Dirençler', fields: ['resists', 'abilities'] },
  { key: 'drops', label: 'Droplar', fields: ['drops'] },
  { key: 'media', label: 'İkon & 3D Model', fields: ['modelScale'] },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function MonsterEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const confirm = useConfirm();

  const [monster, setMonster] = useState<Monster | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState('');
  const [tab, setTab] = useState<TabKey>('general');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [drops, setDrops] = useState<DropState | null>(null);
  const [savedDrops, setSavedDrops] = useState('');
  const [groups, setGroups] = useState<DropGroupSummary[]>([]);
  // İçe aktarma taslağı yalnızca ilk açılışta uygulanır
  const incoming = useRef<MonsterImportDraft | null>((location.state as MonsterImportState | null)?.importDraft ?? null);
  const [importInfo, setImportInfo] = useState<{ draft: MonsterImportDraft; useIcon: boolean; useModel: boolean } | null>(null);

  const takeIncoming = (current: Form) => {
    const draft = incoming.current;
    if (!draft) return null;
    incoming.current = null;
    navigate(location.pathname, { replace: true, state: null });
    setImportInfo({ draft, useIcon: !!draft.assets.iconUrl, useModel: !!draft.assets.modelUrl });
    // Mevcut bir canavar güncelleniyorsa oyun kodu ve model ölçeği korunur
    return isNew ? draft.monster : { ...draft.monster, code: current.code, modelScale: current.modelScale };
  };

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    setForm(null);
    if (isNew) {
      setMonster(null);
      setCodeTouched(false);
      api
        .get<{ vnum: number }>('/api/monsters/next-vnum')
        .then(({ vnum }) => {
          if (cancelled) return;
          const f = emptyForm(vnum);
          const imported = takeIncoming(f);
          if (imported) setCodeTouched(true);
          setForm(imported ?? f);
          setSaved(JSON.stringify(f));
        })
        .catch((e) => setLoadError(e.message));
    } else {
      setCodeTouched(true);
      api
        .get<Monster>(`/api/monsters/${id}`)
        .then((m) => {
          if (cancelled) return;
          setMonster(m);
          const f = toForm(m);
          setForm(takeIncoming(f) ?? f);
          setSaved(JSON.stringify(f));
        })
        .catch((e) => setLoadError(e.message));
      api
        .get<MonsterDropsResponse>(`/api/monsters/${id}/drops`)
        .then((d) => {
          if (cancelled) return;
          setDrops(d);
          setSavedDrops(JSON.stringify(d.drops));
        })
        .catch((e) => toast('error', `Droplar yüklenemedi: ${e.message}`));
      api.get<DropGroupSummary[]>('/api/drop-groups').then(setGroups).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  const formDirty = form !== null && JSON.stringify(form) !== saved;
  const dropsDirty = drops !== null && JSON.stringify(drops.drops) !== savedDrops;
  const dirty = formDirty || dropsDirty;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const update = useCallback(<K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const { [key as string]: _, ...rest } = e;
      return rest;
    });
  }, []);

  /** Kaynaktaki ikon/3D modeli kaydedilen canavara indirir. */
  const downloadAssets = async (target: Monster): Promise<Monster> => {
    if (!importInfo) return target;
    let current = target;
    const jobs: Array<['icon' | 'model', string | null, boolean]> = [
      ['icon', importInfo.draft.assets.iconUrl, importInfo.useIcon],
      ['model', importInfo.draft.assets.modelUrl, importInfo.useModel],
    ];
    for (const [kind, url, enabled] of jobs) {
      if (!url || !enabled) continue;
      try {
        const result = await api.post<Monster & { importWarnings?: string[] }>(`/api/monsters/${target.id}/remote-media`, { kind, url });
        for (const warning of result.importWarnings ?? []) toast('error', warning);
        current = result;
        toast('success', kind === 'icon' ? 'İkon kaynaktan indirildi.' : '3D model kaynaktan indirildi.');
      } catch (e) {
        toast('error', `${kind === 'icon' ? 'İkon' : '3D model'} indirilemedi: ${(e as Error).message}`);
      }
    }
    return current;
  };

  const save = useCallback(async () => {
    if (!form || saving) return;
    setSaving(true);
    setErrors({});
    try {
      let result = isNew
        ? await api.post<Monster>('/api/monsters', form)
        : formDirty || importInfo
          ? await api.put<Monster>(`/api/monsters/${id}`, form)
          : monster!;
      if (!isNew && drops && dropsDirty) {
        try {
          const d = await api.put<MonsterDropsResponse>(`/api/monsters/${id}/drops`, { drops: drops.drops });
          setDrops(d);
          setSavedDrops(JSON.stringify(d.drops));
        } catch (err) {
          setTab('drops');
          throw err;
        }
      } else if (!isNew && drops && formDirty && (form.level !== monster?.level || form.rank !== monster?.rank)) {
        // Seviye/rütbe değişince uygulanan genel droplar değişir
        api.get<MonsterDropsResponse>(`/api/monsters/${id}/drops`).then((d) => setDrops((cur) => (cur ? { ...d, drops: cur.drops, items: { ...d.items, ...cur.items } } : d))).catch(() => {});
      }
      if (importInfo) {
        result = await downloadAssets(result);
        setImportInfo(null);
      }
      const f = toForm(result);
      setMonster(result);
      setForm(f);
      setSaved(JSON.stringify(f));
      toast('success', isNew ? 'Canavar oluşturuldu.' : 'Değişiklikler kaydedildi.');
      if (isNew) navigate(`/admin/monsters/${result.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        const map: Record<string, string> = {};
        for (const issue of e.issues) map[issue.path.split('.')[0]] ??= issue.message;
        if (e.status === 409) map[e.message.includes('kodu') ? 'code' : 'vnum'] = e.message;
        setErrors(map);
        // Hatanın olduğu sekmeye geç
        const first = Object.keys(map)[0];
        const target = TABS.find((t) => (t.fields as readonly string[]).includes(first));
        if (target) setTab(target.key);
      }
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, saving, isNew, id, navigate, toast, importInfo, drops, dropsDirty, formDirty, monster]);

  // Ctrl/Cmd + S ile kaydet
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const remove = async () => {
    if (!monster) return;
    if (!(await confirm({ title: 'Canavar silinsin mi?', message: `"${monster.name}" ve yüklenmiş dosyaları kalıcı olarak silinecek.`, confirmText: 'Sil', danger: true })))
      return;
    try {
      await api.del(`/api/monsters/${monster.id}`);
      setSaved(JSON.stringify(form));
      toast('success', 'Canavar silindi.');
      navigate('/admin/monsters');
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  if (loadError) {
    return (
      <EmptyState
        title="Canavar yüklenemedi"
        text={loadError}
        action={
          <Link to="/admin/monsters" className="btn-ghost">
            Listeye dön
          </Link>
        }
      />
    );
  }
  if (!form) return <Spinner className="text-gold-400" />;

  const setName = (name: string) => {
    update('name', name);
    if (!codeTouched) update('code', suggestCode(name));
  };

  return (
    <>
      <PageHeader
        title={isNew ? 'Yeni Canavar' : form.name || 'İsimsiz canavar'}
        subtitle={isNew ? 'Yeni bir canavar, boss ya da Metin taşı tanımlayın' : `Vnum #${monster?.vnum} · ${monster?.code}`}
        actions={
          <>
            <Link to="/admin/monsters" className="btn-ghost">
              ← Liste
            </Link>
            {!isNew && monster && (
              <a href={`/wiki/canavar/${monster.vnum}`} target="_blank" rel="noreferrer" className="btn-ghost">
                Wiki'de gör ↗
              </a>
            )}
            {!isNew && (
              <button className="btn-danger" onClick={remove}>
                Sil
              </button>
            )}
            <button className="btn-primary" onClick={save} disabled={saving || (!dirty && !isNew && !importInfo)} title="Ctrl + S">
              {saving && <Spinner />}
              {isNew ? 'Oluştur' : dirty || importInfo ? 'Kaydet' : 'Kaydedildi'}
            </button>
          </>
        }
      />

      {importInfo && (
        <div className="mb-5 rounded-xl border border-gold-500/30 bg-gold-500/5 p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-medium text-gold-300">{importInfo.draft.source.importerName} kaynağından içe aktarıldı — henüz kaydedilmedi</div>
              <a href={importInfo.draft.source.url} target="_blank" rel="noreferrer" className="break-all text-xs text-slate-400 hover:text-gold-300">
                {importInfo.draft.source.url}
              </a>
            </div>
            <button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => setImportInfo(null)}>
              Bildirimi kapat
            </button>
          </div>
          {importInfo.draft.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-amber-200">
              {importInfo.draft.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}
          {(importInfo.draft.assets.iconUrl || importInfo.draft.assets.modelUrl) && (
            <div className="mt-3 flex flex-wrap gap-4 text-slate-300">
              <span className="text-slate-400">Kaydedince indir:</span>
              {importInfo.draft.assets.iconUrl && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-gold-500" checked={importInfo.useIcon} onChange={(e) => setImportInfo({ ...importInfo, useIcon: e.target.checked })} />
                  İkon
                </label>
              )}
              {importInfo.draft.assets.modelUrl && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-gold-500" checked={importInfo.useModel} onChange={(e) => setImportInfo({ ...importInfo, useModel: e.target.checked })} />
                  3D model
                </label>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-white/5">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition ${
                  tab === t.key ? 'border-gold-500 text-gold-300' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
                {(t.fields as readonly string[]).some((f) => errors[f]) && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-400 align-middle" />}
              </button>
            ))}
          </div>

          <div className="card p-5 sm:p-6">
            {tab === 'general' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Vnum" error={errors.vnum} hint="Metin2 numarası; drop ve spawn tablolarında bu numara kullanılır.">
                  <NumberInput value={form.vnum} min={1} onChange={(v) => update('vnum', v)} aria-label="Vnum" />
                </Field>
                <Field label="Oyun kodu" error={errors.code} hint="Oyundaki kısa ad (ör. wolf, orc_lord). Oyun canavarı bu adla tanır.">
                  <input
                    className="input font-mono"
                    value={form.code}
                    maxLength={40}
                    onChange={(e) => {
                      setCodeTouched(true);
                      update('code', e.target.value.toLowerCase());
                    }}
                  />
                </Field>
                <Field label="İsim" error={errors.name}>
                  <input className="input" value={form.name} maxLength={64} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Seviye" error={errors.level}>
                  <NumberInput value={form.level} min={1} max={250} onChange={(v) => update('level', v)} aria-label="Seviye" />
                </Field>
                <Field label="Rütbe" error={errors.rank} hint="Metin taşları da canavardır: rütbe = Metin Taşı.">
                  <Select options={MONSTER_RANKS} value={form.rank} onChange={(v) => update('rank', v as Form['rank'])} />
                </Field>
                <Field label="Irk" error={errors.race} hint="Oyuncu bonusları buna göre işler (ör. Hayvanlara Karşı Güç).">
                  <Select options={MONSTER_RACES} value={form.race} onChange={(v) => update('race', v as Form['race'])} />
                </Field>
                <Field label="Element" error={errors.element}>
                  <Select options={MONSTER_ELEMENTS} value={form.element} onChange={(v) => update('element', v as Form['element'])} />
                </Field>
                <div />
                <div className="sm:col-span-2">
                  <Field label="Açıklama" error={errors.description}>
                    <textarea className="input min-h-[90px]" value={form.description} maxLength={2000} onChange={(e) => update('description', e.target.value)} />
                  </Field>
                </div>
                {form.sourceUrl && (
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    Kaynak:{' '}
                    <a href={form.sourceUrl} target="_blank" rel="noreferrer" className="break-all hover:text-gold-300">
                      {form.sourceUrl}
                    </a>
                  </p>
                )}
              </div>
            )}

            {tab === 'combat' && (
              <div className="space-y-6">
                <Group title="Yaşam ve ödül">
                  <Num label="HP" k="hp" form={form} update={update} errors={errors} min={1} />
                  <Num label="HP yenilenmesi (%)" k="hpRegenPct" form={form} update={update} errors={errors} max={100} />
                  <Num label="Yenilenme aralığı (sn)" k="hpRegenSec" form={form} update={update} errors={errors} />
                  <Num label="EXP" k="exp" form={form} update={update} errors={errors} />
                  <Num label="Min yang" k="yangMin" form={form} update={update} errors={errors} hint="0 / 0 = genel yang kuralı" />
                  <Num label="Max yang" k="yangMax" form={form} update={update} errors={errors} />
                </Group>
                <Group title="Saldırı ve savunma">
                  <Num label="Min hasar" k="damageMin" form={form} update={update} errors={errors} />
                  <Num label="Max hasar" k="damageMax" form={form} update={update} errors={errors} />
                  <Num label="Savunma" k="defense" form={form} update={update} errors={errors} />
                  <Num label="Saldırı hızı" k="attackSpeed" form={form} update={update} errors={errors} min={1} hint="100 = normal" />
                  <Num label="Hareket hızı" k="moveSpeed" form={form} update={update} errors={errors} min={1} hint="100 = normal" />
                </Group>
                <Group title="Statlar">
                  <Num label="STR" k="str" form={form} update={update} errors={errors} />
                  <Num label="DEX" k="dex" form={form} update={update} errors={errors} />
                  <Num label="VIT" k="vit" form={form} update={update} errors={errors} />
                  <Num label="INT" k="int" form={form} update={update} errors={errors} />
                </Group>
              </div>
            )}

            {tab === 'ai' && (
              <div className="space-y-6">
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-gold-500" checked={form.aggressive} onChange={(e) => update('aggressive', e.target.checked)} />
                  <span>
                    <span className="text-sm text-slate-200">Saldırgan</span>
                    <span className="block text-xs text-slate-500">Oyuncuyu fark edince kendisi saldırır; kapalıysa yalnızca vurulunca karşılık verir.</span>
                  </span>
                </label>
                <Group title="Mesafeler (metre)">
                  <Num label="Fark etme mesafesi" k="aggroRange" form={form} update={update} errors={errors} step={0.5} />
                  <Num label="Saldırı menzili" k="attackRange" form={form} update={update} errors={errors} step={0.1} hint="Yakın dövüş ≈ 1.5, okçu ≈ 8" />
                </Group>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-300">Özellikler</h3>
                  <div className="flex flex-wrap gap-2">
                    {MONSTER_FLAGS.map((f) => {
                      const on = form.flags.includes(f.value);
                      return (
                        <button
                          key={f.value}
                          type="button"
                          aria-pressed={on}
                          onClick={() => update('flags', on ? form.flags.filter((x) => x !== f.value) : [...form.flags, f.value])}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            on ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-white/10 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                  {errors.flags && <p className="mt-1 text-xs text-red-400">{errors.flags}</p>}
                </div>
              </div>
            )}

            {tab === 'resists' && (
              <div className="space-y-6">
                <PercentGrid
                  title="Savunmalar"
                  hint="Bu silah / elementten aldığı hasar ne kadar azalır (%). Eksi değer zayıflık demektir (ör. Rüzgar −30)."
                  options={MONSTER_RESISTS}
                  value={form.resists}
                  min={-100}
                  onChange={(v) => update('resists', v)}
                  error={errors.resists}
                />
                <PercentGrid
                  title="Vuruş yetenekleri"
                  hint="Canavarın her vuruşunda tetiklenme şansı (%)."
                  options={MONSTER_ABILITIES}
                  value={form.abilities}
                  min={0}
                  onChange={(v) => update('abilities', v)}
                  error={errors.abilities}
                />
              </div>
            )}

            {tab === 'drops' &&
              (monster && drops ? (
                <DropsTab
                  monster={{ id: monster.id, level: monster.level, rank: monster.rank }}
                  value={drops}
                  onChange={setDrops}
                  groups={groups}
                  dirty={dirty}
                  error={errors.drops}
                />
              ) : monster ? (
                <Spinner className="text-gold-400" />
              ) : (
                <EmptyState title="Önce canavarı oluşturun" text="Drop ekleyebilmek için canavarı bir kez kaydetmeniz gerekiyor." />
              ))}

            {tab === 'media' && (
              <div className="space-y-6">
                <div className="max-w-xs">
                  <Num label="Model ölçeği" k="modelScale" form={form} update={update} errors={errors} step={0.05} hint="Oyunda modelin büyüklüğü (1 = olduğu gibi)" />
                </div>
                {monster ? (
                  <MediaTab item={monster} onChange={setMonster} base="/api/monsters" />
                ) : (
                  <EmptyState title="Önce canavarı oluşturun" text="İkon ve 3D model yükleyebilmek için canavarı bir kez kaydetmeniz gerekiyor." />
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">Özet</h2>
          <MonsterCard form={form} iconUrl={monster?.iconUrl ?? importInfo?.draft.assets.iconUrl ?? null} />
          {monster?.modelUrl && <ModelViewer url={monster.modelUrl} className="aspect-square" />}
        </aside>
      </div>
    </>
  );
}

// ------------------------------------------------------------------
type Update = <K extends keyof Form>(key: K, value: Form[K]) => void;
type NumKey = { [K in keyof Form]: Form[K] extends number ? K : never }[keyof Form];

function Num({
  label,
  k,
  form,
  update,
  errors,
  min = 0,
  max,
  step,
  hint,
}: {
  label: string;
  k: NumKey;
  form: Form;
  update: Update;
  errors: Record<string, string>;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  return (
    <Field label={label} error={errors[k]} hint={hint}>
      <NumberInput value={form[k]} min={min} max={max} step={step} onChange={(v) => update(k, v)} aria-label={label} />
    </Field>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-slate-300">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Select({ options, value, onChange }: { options: readonly Option[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Boş bırakılan alan kaydedilmez; 0 dışındaki değerler { ANAHTAR: yüzde } olarak tutulur. */
function PercentGrid({
  title,
  hint,
  options,
  value,
  min,
  onChange,
  error,
}: {
  title: string;
  hint: string;
  options: readonly Option[];
  value: Record<string, number>;
  min: number;
  onChange: (v: Record<string, number>) => void;
  error?: string;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      <p className="mb-3 mt-0.5 text-xs text-slate-500">{hint}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {options.map((o) => (
          <label key={o.value} className="block">
            <span className="label">{o.label}</span>
            <input
              type="number"
              className={`input tabular-nums ${value[o.value] < 0 ? 'text-red-300' : value[o.value] > 0 ? 'text-emerald-300' : ''}`}
              min={min}
              max={100}
              placeholder="0"
              value={value[o.value] ?? ''}
              onChange={(e) => {
                const next = { ...value };
                const n = Number(e.target.value);
                if (e.target.value === '' || n === 0) delete next[o.value];
                else next[o.value] = n;
                onChange(next);
              }}
            />
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </section>
  );
}

function MonsterCard({ form, iconUrl }: { form: Form; iconUrl: string | null }) {
  const resists = Object.entries(form.resists);
  const rows: Array<[string, string]> = [
    ['HP', form.hp.toLocaleString('tr-TR')],
    ['EXP', form.exp.toLocaleString('tr-TR')],
    ['Hasar', `${form.damageMin} – ${form.damageMax}`],
    ['Savunma', String(form.defense)],
    ['Irk', raceLabel(form.race)],
    ['Element', elementLabel(form.element)],
  ];
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-3">
        <MonsterIcon url={iconUrl} name={form.name || '?'} rank={form.rank} size={48} />
        <div className="min-w-0">
          <div className="truncate font-display text-gold-300">{form.name || 'İsimsiz'}</div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
            <RankBadge rank={form.rank} /> Sv. {form.level}
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className="tabular-nums text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="text-xs text-slate-400">{form.aggressive ? 'Saldırgan' : 'Vurulunca saldırır'}</div>
      {resists.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {resists.map(([k, v]) => (
            <span key={k} className={`rounded px-1.5 py-0.5 text-[11px] ${v < 0 ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
              {MONSTER_RESISTS.find((r) => r.value === k)?.label ?? k} {signedPct(v)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
