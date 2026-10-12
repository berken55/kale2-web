import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CLASSES,
  GENDERS,
  ICON_EXTENSIONS,
  ITEM_SUBTYPES,
  ITEM_TYPES,
  MAX_ICON_BYTES,
  MAX_MODEL_BYTES,
  MAX_UPGRADE_LEVEL,
  MODEL_EXTENSIONS,
  RARITIES,
  type ItemType,
} from '@shared/constants';
import type { BonusType, Item, ItemBonus, ItemStats, ItemUpgrade } from '@shared/types';
import { api, ApiError, uploadFile } from '../api';
import { ItemTooltip } from '../components/ItemTooltip';
import { EmptyState, Field, NumberInput, PageHeader, Spinner, useConfirm, useToast } from '../components/ui';

// three.js büyük bir paket; yalnızca 3D model gösterilirken yüklenir
const LazyModelViewer = lazy(() => import('../components/ModelViewer').then((m) => ({ default: m.ModelViewer })));

function ModelViewer(props: { url: string; className?: string }) {
  return (
    <Suspense fallback={<div className={`flex items-center justify-center rounded-xl border border-white/10 bg-ink-850 ${props.className ?? ''}`}><Spinner className="text-gold-400" /></div>}>
      <LazyModelViewer {...props} />
    </Suspense>
  );
}

type Form = Omit<Item, 'id' | 'iconUrl' | 'modelUrl' | 'modelFileName' | 'createdAt' | 'updatedAt'>;

const EMPTY_STATS: ItemStats = { minAttack: 0, maxAttack: 0, minMagicAttack: 0, maxMagicAttack: 0, defense: 0, attackSpeed: 0 };

const emptyForm = (vnum: number): Form => ({
  vnum,
  name: '',
  type: 'WEAPON',
  subtype: 'SWORD',
  rarity: 'COMMON',
  levelRequired: 0,
  classes: [],
  gender: 'ANY',
  buyPrice: 0,
  sellPrice: 0,
  stackSize: 1,
  tradable: true,
  description: '',
  stats: { ...EMPTY_STATS },
  bonuses: [],
  upgrades: [],
});

const toForm = (item: Item): Form => {
  const { id: _i, iconUrl: _a, modelUrl: _b, modelFileName: _c, createdAt: _d, updatedAt: _e, ...form } = item;
  return form;
};

const showsAttack = (type: string) => type === 'WEAPON';
const showsDefense = (type: string) => ['ARMOR', 'BELT', 'COSTUME'].includes(type);
const isEquipment = (type: string) => ['WEAPON', 'ARMOR', 'BELT', 'COSTUME'].includes(type);

/** Kaydederken, seçilen tipte gösterilmeyen güç değerlerini sıfırlar. */
function normalizeForSave(form: Form): Form {
  const stats = { ...form.stats };
  if (!showsAttack(form.type)) Object.assign(stats, { minAttack: 0, maxAttack: 0, minMagicAttack: 0, maxMagicAttack: 0, attackSpeed: 0 });
  if (!showsDefense(form.type)) stats.defense = 0;
  return { ...form, stats, stackSize: isEquipment(form.type) ? 1 : form.stackSize };
}

const TABS = [
  { key: 'general', label: 'Genel' },
  { key: 'stats', label: 'Güç Değerleri' },
  { key: 'bonuses', label: 'Bonuslar' },
  { key: 'upgrades', label: 'Yükseltme' },
  { key: 'media', label: 'İkon & 3D Model' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function ItemEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();

  const [item, setItem] = useState<Item | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [bonusTypes, setBonusTypes] = useState<BonusType[]>([]);
  const [tab, setTab] = useState<TabKey>('general');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewLevel, setPreviewLevel] = useState(0);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    setLoadError('');
    setForm(null);
    api.get<BonusType[]>('/api/bonus-types').then(setBonusTypes).catch(() => {});
    if (isNew) {
      setItem(null);
      api
        .get<{ vnum: number }>('/api/items/next-vnum')
        .then(({ vnum }) => {
          const f = emptyForm(vnum);
          setForm(f);
          setSaved(JSON.stringify(f));
        })
        .catch((e) => setLoadError(e.message));
    } else {
      api
        .get<Item>(`/api/items/${id}`)
        .then((it) => {
          setItem(it);
          const f = toForm(it);
          setForm(f);
          setSaved(JSON.stringify(f));
        })
        .catch((e) => setLoadError(e.message));
    }
  }, [id, isNew]);

  const dirty = form !== null && JSON.stringify(form) !== saved;

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

  const save = useCallback(async () => {
    if (!form || saving) return;
    setSaving(true);
    setErrors({});
    try {
      const body = normalizeForSave(form);
      const result = isNew ? await api.post<Item>('/api/items', body) : await api.put<Item>(`/api/items/${id}`, body);
      const f = toForm(result);
      setItem(result);
      setForm(f);
      setSaved(JSON.stringify(f));
      toast('success', isNew ? 'Item oluşturuldu.' : 'Değişiklikler kaydedildi.');
      if (isNew) navigate(`/items/${result.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        const map: Record<string, string> = {};
        for (const issue of e.issues) map[issue.path.split('.')[0]] ??= issue.message;
        if (e.status === 409 && e.message.includes('vnum')) map.vnum = e.message;
        setErrors(map);
        // Hatanın olduğu sekmeye geç
        const first = Object.keys(map)[0];
        if (first === 'stats') setTab('stats');
        else if (first === 'bonuses') setTab('bonuses');
        else if (first === 'upgrades') setTab('upgrades');
        else if (first) setTab('general');
      }
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [form, saving, isNew, id, navigate, toast]);

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
    if (!item) return;
    if (!(await confirm({ title: 'Item silinsin mi?', message: `"${item.name}" ve yüklenmiş dosyaları kalıcı olarak silinecek.`, confirmText: 'Sil', danger: true })))
      return;
    try {
      await api.del(`/api/items/${item.id}`);
      setSaved(JSON.stringify(form));
      toast('success', 'Item silindi.');
      navigate('/items');
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  if (loadError) {
    return (
      <EmptyState
        title="Item yüklenemedi"
        text={loadError}
        action={
          <Link to="/items" className="btn-ghost">
            Listeye dön
          </Link>
        }
      />
    );
  }
  if (!form) return <Spinner className="text-gold-400" />;

  const tabErrors: Partial<Record<TabKey, boolean>> = {
    general: ['vnum', 'name', 'type', 'subtype', 'levelRequired', 'buyPrice', 'sellPrice', 'stackSize', 'description'].some((k) => errors[k]),
    stats: !!errors.stats,
    bonuses: !!errors.bonuses,
    upgrades: !!errors.upgrades,
  };

  return (
    <>
      <PageHeader
        title={isNew ? 'Yeni Item' : form.name || 'İsimsiz item'}
        subtitle={isNew ? 'Yeni bir item tanımlayın' : `Vnum #${item?.vnum}`}
        actions={
          <>
            <Link to="/items" className="btn-ghost">
              ← Liste
            </Link>
            {!isNew && (
              <button className="btn-danger" onClick={remove}>
                Sil
              </button>
            )}
            <button className="btn-primary" onClick={save} disabled={saving || (!dirty && !isNew)} title="Ctrl + S">
              {saving && <Spinner />}
              {isNew ? 'Oluştur' : dirty ? 'Kaydet' : 'Kaydedildi'}
            </button>
          </>
        }
      />

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
                {tabErrors[t.key] && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-400 align-middle" />}
                {t.key === 'bonuses' && form.bonuses.length > 0 && <span className="ml-1.5 text-xs text-slate-500">{form.bonuses.length}</span>}
                {t.key === 'upgrades' && form.upgrades.length > 0 && <span className="ml-1.5 text-xs text-slate-500">{form.upgrades.length}</span>}
              </button>
            ))}
          </div>

          <div className="card p-5 sm:p-6">
            {tab === 'general' && <GeneralTab form={form} update={update} errors={errors} />}
            {tab === 'stats' && <StatsTab form={form} update={update} error={errors.stats} />}
            {tab === 'bonuses' && <BonusesTab bonuses={form.bonuses} bonusTypes={bonusTypes} onChange={(b) => update('bonuses', b)} error={errors.bonuses} />}
            {tab === 'upgrades' && (
              <UpgradesTab form={form} upgrades={form.upgrades} onChange={(u) => update('upgrades', u)} error={errors.upgrades} />
            )}
            {tab === 'media' &&
              (item ? (
                <MediaTab item={item} onChange={setItem} />
              ) : (
                <EmptyState title="Önce itemi oluşturun" text="İkon ve 3D model yükleyebilmek için itemi bir kez kaydetmeniz gerekiyor." />
              ))}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-8 xl:self-start">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">Oyun içi önizleme</h2>
            {form.upgrades.length > 0 && (
              <select
                className="input w-auto py-1 text-xs"
                aria-label="Önizleme yükseltme seviyesi"
                value={previewLevel}
                onChange={(e) => setPreviewLevel(Number(e.target.value))}
              >
                <option value={0}>+0</option>
                {form.upgrades
                  .filter((u) => u.level > 0)
                  .map((u) => (
                    <option key={u.level} value={u.level}>
                      +{u.level}
                    </option>
                  ))}
              </select>
            )}
          </div>
          <ItemTooltip
            {...normalizeForSave(form)}
            bonusTypes={bonusTypes}
            iconUrl={item?.iconUrl ?? null}
            upgradeLevel={form.upgrades.some((u) => u.level === previewLevel) ? previewLevel : 0}
          />
          {item?.modelUrl && <ModelViewer url={item.modelUrl} className="aspect-square" />}
        </aside>
      </div>
    </>
  );
}

// ------------------------------------------------------------------
type Update = <K extends keyof Form>(key: K, value: Form[K]) => void;

function GeneralTab({ form, update, errors }: { form: Form; update: Update; errors: Record<string, string> }) {
  const subtypes = ITEM_SUBTYPES[form.type as ItemType];
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="İsim" error={errors.name}>
        <input className="input" value={form.name} maxLength={64} onChange={(e) => update('name', e.target.value)} placeholder="Örn. Zehir Kılıcı" />
      </Field>
      <Field label="Vnum" hint="Oyundaki benzersiz item numarası" error={errors.vnum}>
        <NumberInput value={form.vnum} min={1} onChange={(v) => update('vnum', v)} />
      </Field>
      <Field label="Nadirlik">
        <select className="input" value={form.rarity} onChange={(e) => update('rarity', e.target.value as Form['rarity'])}>
          {RARITIES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tip" error={errors.type}>
        <select
          className="input"
          value={form.type}
          onChange={(e) => {
            const type = e.target.value as ItemType;
            update('type', type);
            update('subtype', ITEM_SUBTYPES[type][0].value);
          }}
        >
          {ITEM_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Alt tip" error={errors.subtype}>
        <select className="input" value={form.subtype} onChange={(e) => update('subtype', e.target.value)}>
          {subtypes.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Gereken seviye" error={errors.levelRequired}>
        <NumberInput value={form.levelRequired} min={0} max={250} onChange={(v) => update('levelRequired', v)} />
      </Field>

      <div className="sm:col-span-2 lg:col-span-3">
        <span className="label">Kullanabilen sınıflar</span>
        <div className="flex flex-wrap gap-2">
          {CLASSES.map((c) => {
            const on = form.classes.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                onClick={() => update('classes', on ? form.classes.filter((x) => x !== c.value) : [...form.classes, c.value])}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  on ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-500">Hiçbiri seçilmezse tüm sınıflar kullanabilir.</p>
      </div>

      <Field label="Cinsiyet">
        <select className="input" value={form.gender} onChange={(e) => update('gender', e.target.value as Form['gender'])}>
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mağaza fiyatı (Yang)" error={errors.buyPrice}>
        <NumberInput value={form.buyPrice} min={0} onChange={(v) => update('buyPrice', v)} />
      </Field>
      <Field label="Satış fiyatı (Yang)" error={errors.sellPrice}>
        <NumberInput value={form.sellPrice} min={0} onChange={(v) => update('sellPrice', v)} />
      </Field>
      {!isEquipment(form.type) && (
        <Field label="Yığın boyutu" hint="Bir slotta kaç adet taşınabilir" error={errors.stackSize}>
          <NumberInput value={form.stackSize} min={1} max={1000} onChange={(v) => update('stackSize', v)} />
        </Field>
      )}
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300">
        <input type="checkbox" className="h-4 w-4 accent-gold-500" checked={form.tradable} onChange={(e) => update('tradable', e.target.checked)} />
        Ticareti yapılabilir
      </label>

      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Açıklama" error={errors.description}>
          <textarea className="input min-h-[90px]" maxLength={2000} value={form.description} onChange={(e) => update('description', e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

function StatsTab({ form, update, error }: { form: Form; update: Update; error?: string }) {
  const s = form.stats;
  const set = (key: keyof ItemStats, v: number) => update('stats', { ...s, [key]: v });

  if (!showsAttack(form.type) && !showsDefense(form.type)) {
    return <EmptyState title="Bu tip için güç değeri yok" text="Güç değerleri silah ve ekipman tiplerinde tanımlanır. Bonus ekleyebilirsiniz." />;
  }
  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {showsAttack(form.type) && (
        <>
          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Fiziksel saldırı</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Min saldırı">
                <NumberInput value={s.minAttack} min={0} onChange={(v) => set('minAttack', v)} />
              </Field>
              <Field label="Max saldırı">
                <NumberInput value={s.maxAttack} min={0} onChange={(v) => set('maxAttack', v)} />
              </Field>
              <Field label="Saldırı hızı (%)" hint="Silahın temel hız bonusu">
                <NumberInput value={s.attackSpeed} min={-100} max={100} onChange={(v) => set('attackSpeed', v)} />
              </Field>
            </div>
          </section>
          <section>
            <h3 className="mb-3 text-sm font-semibold text-slate-300">Büyülü saldırı</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Min büyü saldırısı">
                <NumberInput value={s.minMagicAttack} min={0} onChange={(v) => set('minMagicAttack', v)} />
              </Field>
              <Field label="Max büyü saldırısı">
                <NumberInput value={s.maxMagicAttack} min={0} onChange={(v) => set('maxMagicAttack', v)} />
              </Field>
            </div>
          </section>
        </>
      )}
      {showsDefense(form.type) && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Savunma</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Savunma">
              <NumberInput value={s.defense} min={0} onChange={(v) => set('defense', v)} />
            </Field>
          </div>
        </section>
      )}
      <p className="text-xs text-slate-500">Yükseltme seviyelerinin eklediği değerler “Yükseltme” sekmesinden tanımlanır.</p>
    </div>
  );
}

function BonusesTab({
  bonuses,
  bonusTypes,
  onChange,
  error,
}: {
  bonuses: ItemBonus[];
  bonusTypes: BonusType[];
  onChange: (b: ItemBonus[]) => void;
  error?: string;
}) {
  const used = new Set(bonuses.map((b) => b.bonusTypeId));
  const available = bonusTypes.filter((b) => !used.has(b.id));
  const [adding, setAdding] = useState('');

  const add = () => {
    const bt = bonusTypes.find((b) => b.id === Number(adding));
    if (!bt) return;
    onChange([...bonuses, { bonusTypeId: bt.id, value: bt.maxValue > 0 ? Math.min(bt.maxValue, 1) : 1 }]);
    setAdding('');
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = [...bonuses];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };

  return (
    <div>
      <p className="mb-4 text-sm text-slate-400">
        Iteme sabit olarak işlenen bonuslar (efsunlar). Değerler, bonus tanımındaki üst sınırı aşamaz. En fazla 10 bonus.
      </p>
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {bonuses.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">Bu iteme henüz bonus eklenmedi.</p>
      ) : (
        <ul className="space-y-2">
          {bonuses.map((b, i) => {
            const bt = bonusTypes.find((x) => x.id === b.bonusTypeId);
            const over = bt && bt.maxValue > 0 && Math.abs(b.value) > bt.maxValue;
            return (
              <li key={b.bonusTypeId} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-ink-850 p-3">
                <div className="min-w-[180px] flex-1">
                  <div className="text-sm text-[#8fc6ff]">{bt?.name ?? 'Bilinmeyen bonus'}</div>
                  <div className="text-xs text-slate-500">
                    {bt?.code}
                    {bt && bt.maxValue > 0 && ` · en fazla ${bt.maxValue}${bt.unit}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <NumberInput
                    aria-label={`${bt?.name} değeri`}
                    className={`w-28 ${over ? 'border-red-500/60' : ''}`}
                    value={b.value}
                    step={0.1}
                    onChange={(v) => onChange(bonuses.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                  />
                  <span className="w-4 text-sm text-slate-500">{bt?.unit}</span>
                </div>
                <div className="flex gap-1">
                  <button className="btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Yukarı taşı">
                    ↑
                  </button>
                  <button className="btn-ghost btn-sm" disabled={i === bonuses.length - 1} onClick={() => move(i, 1)} aria-label="Aşağı taşı">
                    ↓
                  </button>
                  <button className="btn-danger btn-sm" onClick={() => onChange(bonuses.filter((_, j) => j !== i))}>
                    Kaldır
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {bonuses.length < 10 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <select className="input max-w-sm" aria-label="Eklenecek bonus" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Bonus seçin…</option>
            {available.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
          <button className="btn-ghost" disabled={!adding} onClick={add}>
            + Ekle
          </button>
          <Link to="/bonuses" className="self-center text-sm text-gold-400 hover:text-gold-300">
            Bonus tanımlarını yönet
          </Link>
        </div>
      )}
    </div>
  );
}

function UpgradesTab({
  form,
  upgrades,
  onChange,
  error,
}: {
  form: Form;
  upgrades: ItemUpgrade[];
  onChange: (u: ItemUpgrade[]) => void;
  error?: string;
}) {
  const [gen, setGen] = useState({ maxLevel: 9, attackStep: 0, defenseStep: 0, startRate: 100, rateDrop: 10, baseCost: 1000, costFactor: 2 });
  const sorted = useMemo(() => [...upgrades].sort((a, b) => a.level - b.level), [upgrades]);
  const attack = showsAttack(form.type);
  const defense = showsDefense(form.type);

  useEffect(() => {
    // Varsayılan artış değerlerini item tipine göre öner
    setGen((g) => ({
      ...g,
      attackStep: g.attackStep || (attack ? Math.max(1, Math.round(form.stats.maxAttack * 0.15)) : 0),
      defenseStep: g.defenseStep || (defense ? Math.max(1, Math.round(form.stats.defense * 0.15)) : 0),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = () => {
    const rows: ItemUpgrade[] = [];
    for (let level = 0; level <= gen.maxLevel; level++) {
      rows.push({
        level,
        attackBonus: attack ? gen.attackStep * level : 0,
        magicAttackBonus: attack && form.stats.maxMagicAttack > 0 ? gen.attackStep * level : 0,
        defenseBonus: defense ? gen.defenseStep * level : 0,
        successRate: level === 0 ? 100 : Math.max(1, Math.min(100, gen.startRate - gen.rateDrop * (level - 1))),
        cost: level === 0 ? 0 : Math.round(gen.baseCost * Math.pow(gen.costFactor, level - 1)),
        materials: upgrades.find((u) => u.level === level)?.materials ?? [],
      });
    }
    onChange(rows);
  };

  const set = (level: number, patch: Partial<ItemUpgrade>) => onChange(upgrades.map((u) => (u.level === level ? { ...u, ...patch } : u)));

  const addLevel = () => {
    const next = sorted.length ? sorted[sorted.length - 1].level + 1 : 0;
    if (next > MAX_UPGRADE_LEVEL) return;
    const prev = sorted[sorted.length - 1];
    onChange([
      ...upgrades,
      {
        level: next,
        attackBonus: prev?.attackBonus ?? 0,
        magicAttackBonus: prev?.magicAttackBonus ?? 0,
        defenseBonus: prev?.defenseBonus ?? 0,
        successRate: prev ? Math.max(1, prev.successRate - 10) : 100,
        cost: prev?.cost ?? 0,
        materials: [],
      },
    ]);
  };

  const setGenField = (k: keyof typeof gen) => (v: number) => setGen((g) => ({ ...g, [k]: v }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        Her yükseltme seviyesinde (+0 … +{MAX_UPGRADE_LEVEL}) temel değere eklenecek güç, başarı şansı, Yang maliyeti ve gerekli malzemeler.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <details className="rounded-lg border border-white/10 bg-ink-850 p-4" open={upgrades.length === 0}>
        <summary className="cursor-pointer text-sm font-medium text-gold-300">Otomatik tablo oluşturucu</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Son seviye">
            <NumberInput value={gen.maxLevel} min={0} max={MAX_UPGRADE_LEVEL} onChange={setGenField('maxLevel')} />
          </Field>
          {attack && (
            <Field label="Seviye başı saldırı artışı">
              <NumberInput value={gen.attackStep} min={0} onChange={setGenField('attackStep')} />
            </Field>
          )}
          {defense && (
            <Field label="Seviye başı savunma artışı">
              <NumberInput value={gen.defenseStep} min={0} onChange={setGenField('defenseStep')} />
            </Field>
          )}
          <Field label="+1 başarı şansı (%)">
            <NumberInput value={gen.startRate} min={1} max={100} onChange={setGenField('startRate')} />
          </Field>
          <Field label="Seviye başı şans düşüşü">
            <NumberInput value={gen.rateDrop} min={0} max={100} onChange={setGenField('rateDrop')} />
          </Field>
          <Field label="+1 maliyeti (Yang)">
            <NumberInput value={gen.baseCost} min={0} onChange={setGenField('baseCost')} />
          </Field>
          <Field label="Maliyet çarpanı" hint="Her seviyede maliyet bu oranla artar">
            <NumberInput value={gen.costFactor} min={1} max={10} step={0.1} onChange={setGenField('costFactor')} />
          </Field>
        </div>
        <button className="btn-primary mt-4" onClick={generate}>
          Tabloyu oluştur
        </button>
        {upgrades.length > 0 && <span className="ml-3 text-xs text-slate-500">Mevcut tablo değiştirilir, malzemeler korunur.</span>}
      </details>

      {sorted.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-white/5">
              <tr>
                <th className="table-head">Seviye</th>
                {attack && <th className="table-head">+Saldırı</th>}
                {attack && <th className="table-head">+Büyü saldırısı</th>}
                {defense && <th className="table-head">+Savunma</th>}
                <th className="table-head">Başarı %</th>
                <th className="table-head">Maliyet (Yang)</th>
                <th className="table-head">Malzemeler (vnum × adet)</th>
                <th className="table-head" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sorted.map((u) => (
                <tr key={u.level}>
                  <td className="table-cell font-display text-gold-300">+{u.level}</td>
                  {attack && (
                    <td className="table-cell">
                      <NumberInput aria-label={`+${u.level} saldırı`} className="w-24" value={u.attackBonus} min={0} onChange={(v) => set(u.level, { attackBonus: v })} />
                    </td>
                  )}
                  {attack && (
                    <td className="table-cell">
                      <NumberInput
                        aria-label={`+${u.level} büyü saldırısı`}
                        className="w-24"
                        value={u.magicAttackBonus}
                        min={0}
                        onChange={(v) => set(u.level, { magicAttackBonus: v })}
                      />
                    </td>
                  )}
                  {defense && (
                    <td className="table-cell">
                      <NumberInput aria-label={`+${u.level} savunma`} className="w-24" value={u.defenseBonus} min={0} onChange={(v) => set(u.level, { defenseBonus: v })} />
                    </td>
                  )}
                  <td className="table-cell">
                    <NumberInput aria-label={`+${u.level} başarı`} className="w-20" value={u.successRate} min={0} max={100} onChange={(v) => set(u.level, { successRate: v })} />
                  </td>
                  <td className="table-cell">
                    <NumberInput aria-label={`+${u.level} maliyet`} className="w-32" value={u.cost} min={0} onChange={(v) => set(u.level, { cost: v })} />
                  </td>
                  <td className="table-cell">
                    <MaterialsEditor value={u.materials} onChange={(m) => set(u.level, { materials: m })} />
                  </td>
                  <td className="table-cell text-right">
                    <button className="btn-ghost btn-sm" aria-label={`+${u.level} seviyesini kaldır`} onClick={() => onChange(upgrades.filter((x) => x.level !== u.level))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn-ghost" onClick={addLevel} disabled={sorted.length > 0 && sorted[sorted.length - 1].level >= MAX_UPGRADE_LEVEL}>
          + Seviye ekle
        </button>
        {upgrades.length > 0 && (
          <button className="btn-danger" onClick={() => onChange([])}>
            Tabloyu temizle
          </button>
        )}
      </div>
    </div>
  );
}

function MaterialsEditor({ value, onChange }: { value: ItemUpgrade['materials']; onChange: (m: ItemUpgrade['materials']) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((m, i) => (
        <div key={i} className="flex items-center gap-1 rounded-md border border-white/10 bg-ink-800 p-1">
          <input
            type="number"
            aria-label="Malzeme vnum"
            className="w-20 bg-transparent px-1 text-xs tabular-nums outline-none"
            value={m.vnum}
            min={1}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, vnum: Number(e.target.value) } : x)))}
          />
          <span className="text-xs text-slate-500">×</span>
          <input
            type="number"
            aria-label="Malzeme adedi"
            className="w-10 bg-transparent px-1 text-xs tabular-nums outline-none"
            value={m.count}
            min={1}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x)))}
          />
          <button className="px-1 text-xs text-slate-500 hover:text-red-300" aria-label="Malzemeyi kaldır" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      {value.length < 5 && (
        <button className="rounded-md border border-dashed border-white/15 px-2 py-1 text-xs text-slate-400 hover:text-slate-200" onClick={() => onChange([...value, { vnum: 27001, count: 1 }])}>
          + Malzeme
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
function UploadZone({
  accept,
  maxBytes,
  label,
  onFile,
  busy,
  progress,
}: {
  accept: readonly string[];
  maxBytes: number;
  label: string;
  onFile: (f: File) => void;
  busy: boolean;
  progress: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
        over ? 'border-gold-500 bg-gold-500/5' : 'border-white/10'
      }`}
    >
      {busy ? (
        <div className="w-full max-w-xs">
          <div className="mb-2 text-sm text-slate-300">Yükleniyor… %{progress}</div>
          <div className="h-1.5 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gold-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-300">{label}</p>
          <p className="mt-1 text-xs text-slate-500">
            {accept.join(', ')} · en fazla {Math.round(maxBytes / 1024 / 1024)} MB
          </p>
          <button className="btn-ghost btn-sm mt-3" onClick={() => inputRef.current?.click()}>
            Dosya seç
          </button>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept.join(',')}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function MediaTab({ item, onChange }: { item: Item; onChange: (i: Item) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<'icon' | 'model' | null>(null);
  const [progress, setProgress] = useState(0);

  const upload = async (kind: 'icon' | 'model', file: File) => {
    const exts = kind === 'icon' ? ICON_EXTENSIONS : MODEL_EXTENSIONS;
    const max = kind === 'icon' ? MAX_ICON_BYTES : MAX_MODEL_BYTES;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!(exts as readonly string[]).includes(ext)) return toast('error', `Desteklenmeyen dosya türü: ${ext}`);
    if (file.size > max) return toast('error', `Dosya çok büyük (en fazla ${Math.round(max / 1024 / 1024)} MB).`);
    setBusy(kind);
    setProgress(0);
    try {
      const updated = await uploadFile<Item>(`/api/items/${item.id}/${kind}`, file, setProgress);
      onChange(updated);
      toast('success', kind === 'icon' ? 'İkon yüklendi.' : '3D model yüklendi.');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const removeMedia = async (kind: 'icon' | 'model') => {
    if (!(await confirm({ title: kind === 'icon' ? 'İkon kaldırılsın mı?' : '3D model kaldırılsın mı?', message: 'Dosya sunucudan silinecek.', confirmText: 'Kaldır', danger: true })))
      return;
    try {
      onChange(await api.del<Item>(`/api/items/${item.id}/${kind}`));
      toast('success', 'Dosya kaldırıldı.');
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Envanter ikonu</h3>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-white/10 bg-ink-850">
            {item.iconUrl ? (
              <img src={item.iconUrl} alt={`${item.name} ikonu`} className="max-h-full max-w-full [image-rendering:pixelated]" />
            ) : (
              <span className="text-xs text-slate-600">İkon yok</span>
            )}
          </div>
          <div className="min-w-[240px] flex-1">
            <UploadZone accept={ICON_EXTENSIONS} maxBytes={MAX_ICON_BYTES} label="İkonu buraya sürükleyin" onFile={(f) => upload('icon', f)} busy={busy === 'icon'} progress={progress} />
            {item.iconUrl && (
              <button className="btn-danger btn-sm mt-3" onClick={() => removeMedia('icon')}>
                İkonu kaldır
              </button>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-300">3D model</h3>
        <p className="mb-3 text-xs text-slate-500">
          GLB önerilir (doku ve malzemeler tek dosyada). GLTF dosyaları, dokuları dosyanın içine gömülü olduğunda doğru görünür. Metin2 .gr2 dosyalarını önce GLB'ye
          dönüştürün.
        </p>
        {item.modelUrl && (
          <div className="mb-4">
            <ModelViewer url={item.modelUrl} className="h-[380px]" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-400">
                Dosya: <span className="text-slate-200">{item.modelFileName}</span>
              </span>
              <div className="flex gap-2">
                <a href={item.modelUrl} download={item.modelFileName ?? undefined} className="btn-ghost btn-sm">
                  İndir
                </a>
                <button className="btn-danger btn-sm" onClick={() => removeMedia('model')}>
                  Modeli kaldır
                </button>
              </div>
            </div>
          </div>
        )}
        <UploadZone
          accept={MODEL_EXTENSIONS}
          maxBytes={MAX_MODEL_BYTES}
          label={item.modelUrl ? 'Yeni bir model yükleyerek değiştirin' : '3D modeli buraya sürükleyin'}
          onFile={(f) => upload('model', f)}
          busy={busy === 'model'}
          progress={progress}
        />
      </section>
    </div>
  );
}
