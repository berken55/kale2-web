import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SPAWN_KINDS, labelOf } from '@shared/constants';
import type { GameMapDetail, MonsterListResponse, MonsterSummary, SpawnEntry, SpawnRegion } from '@shared/types';
import { api, uploadFile } from '../api';
import { RankBadge } from '../components/monster-ui';
import { EmptyState, Field, NumberInput, PageHeader, Spinner, useConfirm, useToast } from '../components/ui';
import { MapSettingsForm } from './Maps';

const COLORS = ['#f5b942', '#4ea3ff', '#5fd068', '#ff6b5a', '#b86cff', '#3fd1c4', '#ff9f43', '#e86fb8'];
type Mode = 'select' | 'circle' | 'polygon';
type Drag = { kind: 'center' | 'radius' | 'point'; index: number; point?: number } | null;

const slug = (s: string) =>
  s
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 40) || 'bolge';

const round = (n: number) => Math.round(n * 10) / 10;

const newSpawn = (monster: MonsterSummary): SpawnEntry => {
  const boss = monster.rank === 'BOSS' || monster.rank === 'KING';
  return {
    monsterId: monster.id,
    kind: boss ? 'BOSS' : monster.rank === 'STONE' ? 'STONE' : 'PACK',
    maxAlive: boss ? 1 : 3,
    packMin: boss ? 1 : 2,
    packMax: boss ? 1 : 4,
    respawnMinS: boss ? 1800 : 45,
    respawnMaxS: boss ? 3600 : 75,
    announce: boss,
    schedule: '',
    leaderId: null,
  };
};

/** Bölge merkezi (daire: merkez, çokgen: köşe ortalaması) */
const centerOf = (r: SpawnRegion): [number, number] =>
  r.shape === 'CIRCLE' || !r.points.length ? [r.x, r.z] : [r.points.reduce((s, p) => s + p[0], 0) / r.points.length, r.points.reduce((s, p) => s + p[1], 0) / r.points.length];

/** Bölgede sürekli kesilirse saatte yaklaşık kaç yaratık ve ne kadar EXP çıkar */
function hourly(r: SpawnRegion, monsters: Record<number, { exp: number }>) {
  let kills = 0;
  let exp = 0;
  for (const s of r.spawns) {
    const perHour = (s.maxAlive * ((s.packMin + s.packMax) / 2) * 3600) / Math.max(1, (s.respawnMinS + s.respawnMaxS) / 2);
    kills += perHour;
    exp += perHour * (monsters[s.monsterId]?.exp ?? 0);
  }
  return { kills: Math.round(kills), exp: Math.round(exp) };
}

export function MapEditorPage() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [map, setMap] = useState<GameMapDetail | null>(null);
  const [regions, setRegions] = useState<SpawnRegion[]>([]);
  const [saved, setSaved] = useState('[]');
  const [monsters, setMonsters] = useState<MonsterSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('select');
  const [draft, setDraft] = useState<Array<[number, number]>>([]);
  const [drag, setDrag] = useState<Drag>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  const apply = (m: GameMapDetail) => {
    setMap(m);
    setRegions(m.regions);
    setSaved(JSON.stringify(m.regions));
  };

  useEffect(() => {
    api.get<GameMapDetail>(`/api/maps/${id}`).then(apply).catch((e) => setLoadError(e.message));
    api
      .get<MonsterListResponse>('/api/monsters?pageSize=200&sort=level')
      .then((r) => setMonsters(r.monsters))
      .catch(() => {});
  }, [id]);

  const dirty = JSON.stringify(regions) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Esc: çizimi bırak; Delete: seçili bölgeyi sil
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraft([]);
        setMode('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const monsterById = useMemo(() => {
    const out: Record<number, { name: string; level: number; rank: string; exp: number; code: string }> = { ...(map?.monsters ?? {}) };
    for (const m of monsters) out[m.id] = m;
    return out;
  }, [map, monsters]);

  const toWorld = useCallback((e: { clientX: number; clientY: number }): [number, number] => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [round(p.x), round(p.y)];
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      apply(await api.put<GameMapDetail>(`/api/maps/${id}/regions`, { regions }));
      toast('success', 'Bölgeler kaydedildi. Oyuna gitmesi için Yayınla sayfasından yayınlayın.');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <EmptyState title="Harita yüklenemedi" text={loadError} action={<Link to="/admin/maps" className="btn-ghost">Listeye dön</Link>} />;
  if (!map) return <Spinner className="text-brand-400" />;

  const w = map.worldMaxX - map.worldMinX;
  const h = map.worldMaxZ - map.worldMinZ;
  const unit = Math.max(w, h) / 100;
  const region = selected !== null ? regions[selected] : null;
  const setRegion = (i: number, patch: Partial<SpawnRegion>) => setRegions((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const uniqueCode = (base: string, except?: number) => {
    let code = base;
    for (let n = 2; regions.some((r, j) => r.code === code && j !== except); n++) code = `${base}_${n}`.slice(0, 40);
    return code;
  };

  const addRegion = (r: Omit<SpawnRegion, 'code' | 'name'>) => {
    const name = `Bölge ${regions.length + 1}`;
    setRegions((rs) => [...rs, { ...r, name, code: uniqueCode(slug(name)) }]);
    setSelected(regions.length);
    setMode('select');
  };

  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drag) return;
    const [x, z] = toWorld(e);
    if (mode === 'circle') addRegion({ shape: 'CIRCLE', x, z, radius: round(unit * 5), points: [], levelMin: 1, levelMax: 99, spawns: [] });
    else if (mode === 'polygon') setDraft((d) => [...d, [x, z]]);
  };

  const finishPolygon = () => {
    if (draft.length < 3) return;
    const [x, z] = [round(draft.reduce((s, p) => s + p[0], 0) / draft.length), round(draft.reduce((s, p) => s + p[1], 0) / draft.length)];
    addRegion({ shape: 'POLYGON', x, z, radius: 10, points: draft, levelMin: 1, levelMax: 99, spawns: [] });
    setDraft([]);
  };

  const startDrag = (e: ReactPointerEvent, d: NonNullable<Drag>) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelected(d.index);
    setDrag(d);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const [x, z] = toWorld(e);
    const r = regions[drag.index];
    if (drag.kind === 'center') {
      if (r.shape === 'CIRCLE') setRegion(drag.index, { x, z });
      else {
        const [cx, cz] = centerOf(r);
        setRegion(drag.index, { points: r.points.map(([px, pz]) => [round(px + x - cx), round(pz + z - cz)]) });
      }
    } else if (drag.kind === 'radius') {
      setRegion(drag.index, { radius: Math.max(0.5, round(Math.hypot(x - r.x, z - r.z))) });
    } else if (drag.point !== undefined) {
      setRegion(drag.index, { points: r.points.map((p, k) => (k === drag.point ? [x, z] : p)) });
    }
  };

  const removeRegion = async (i: number) => {
    if (!(await confirm({ title: 'Bölge silinsin mi?', message: `"${regions[i].name}" ve spawnları kaldırılacak (kaydedince).`, confirmText: 'Sil', danger: true }))) return;
    setRegions((rs) => rs.filter((_, j) => j !== i));
    setSelected(null);
  };

  const uploadMinimap = async (file: File) => {
    try {
      apply(await uploadFile<GameMapDetail>(`/api/maps/${id}/minimap`, file));
      toast('success', 'Minimap yüklendi.');
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title={map.name}
        subtitle={`${map.code} · ${regions.length} bölge`}
        actions={
          <>
            <Link to="/admin/maps" className="btn-ghost">
              ← Liste
            </Link>
            <button className="btn-ghost" onClick={() => setSettingsOpen((v) => !v)}>
              Harita ayarları
            </button>
            <button className="btn-primary" onClick={save} disabled={saving || !dirty}>
              {saving && <Spinner />}
              {dirty ? 'Kaydet' : 'Kaydedildi'}
            </button>
          </>
        }
      />

      {settingsOpen && (
        <div className="card mb-4 space-y-4 p-5">
          <MapSettingsForm
            initial={{ code: map.code, name: map.name, worldMinX: map.worldMinX, worldMinZ: map.worldMinZ, worldMaxX: map.worldMaxX, worldMaxZ: map.worldMaxZ }}
            submitLabel="Ayarları kaydet"
            onCancel={() => setSettingsOpen(false)}
            onSubmit={async (f) => {
              const m = await api.put<GameMapDetail>(`/api/maps/${id}`, f);
              setMap({ ...m, regions: map.regions });
              setSettingsOpen(false);
              toast('success', 'Harita ayarları kaydedildi.');
            }}
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-4 text-sm">
            <label className="btn-ghost btn-sm cursor-pointer">
              Minimap yükle (PNG)
              <input type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && uploadMinimap(e.target.files[0])} />
            </label>
            <span className="text-xs text-slate-500">
              Oyunda: <span className="font-mono">godot --headless --path . res://game/world/tools/export_minimap.tscn</span> resmi ve dünya dikdörtgenini yazar.
            </span>
            <button
              className="ml-auto text-xs text-red-400 hover:text-red-300"
              onClick={async () => {
                if (!(await confirm({ title: 'Harita silinsin mi?', message: 'Bütün bölgeler ve spawnlar silinir.', confirmText: 'Sil', danger: true }))) return;
                await api.del(`/api/maps/${id}`);
                navigate('/admin/maps');
              }}
            >
              Haritayı sil
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            {(
              [
                ['select', 'Seç / taşı'],
                ['circle', '+ Daire bölge'],
                ['polygon', '+ Çokgen bölge'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                className={`rounded-lg border px-3 py-1.5 ${mode === m ? 'border-brand-500/60 bg-brand-500/15 text-brand-300' : 'border-white/10 text-slate-400 hover:text-slate-200'}`}
                onClick={() => {
                  setMode(m);
                  setDraft([]);
                }}
              >
                {label}
              </button>
            ))}
            {mode === 'circle' && <span className="text-xs text-slate-500">Haritada merkeze tıklayın.</span>}
            {mode === 'polygon' && (
              <>
                <span className="text-xs text-slate-500">Köşelere tıklayın ({draft.length}).</span>
                <button className="btn-primary btn-sm" disabled={draft.length < 3} onClick={finishPolygon}>
                  Bitir
                </button>
              </>
            )}
          </div>
          <div className="card overflow-hidden p-0">
            <svg
              ref={svgRef}
              viewBox={`${map.worldMinX} ${map.worldMinZ} ${w} ${h}`}
              className={`block w-full touch-none select-none ${mode === 'select' ? '' : 'cursor-crosshair'}`}
              style={{ aspectRatio: `${w} / ${h}`, background: '#16221a' }}
              onClick={onMapClick}
              onPointerMove={onPointerMove}
              onPointerUp={() => setTimeout(() => setDrag(null), 0)}
            >
              {map.minimapUrl && <image href={map.minimapUrl} x={map.worldMinX} y={map.worldMinZ} width={w} height={h} preserveAspectRatio="none" />}
              {!map.minimapUrl && (
                <text x={map.worldMinX + w / 2} y={map.worldMinZ + h / 2} textAnchor="middle" fontSize={unit * 3} fill="#64748b">
                  Minimap yok — Harita ayarlarından yükleyin
                </text>
              )}
              {regions.map((r, i) => {
                const color = COLORS[i % COLORS.length];
                const sel = i === selected;
                const [cx, cz] = centerOf(r);
                return (
                  <g key={i} onClick={(e) => { e.stopPropagation(); if (mode === 'select') setSelected(i); }}>
                    {r.shape === 'CIRCLE' ? (
                      <circle cx={r.x} cy={r.z} r={r.radius} fill={`${color}33`} stroke={color} strokeWidth={unit * (sel ? 0.5 : 0.25)} />
                    ) : (
                      <polygon points={r.points.map((p) => p.join(',')).join(' ')} fill={`${color}33`} stroke={color} strokeWidth={unit * (sel ? 0.5 : 0.25)} />
                    )}
                    <circle cx={cx} cy={cz} r={unit * 1.1} fill={color} className="cursor-move" onPointerDown={(e) => mode === 'select' && startDrag(e, { kind: 'center', index: i })} />
                    <text x={cx} y={cz - unit * 1.8} textAnchor="middle" fontSize={unit * 2} fill="#fff" stroke="#000" strokeWidth={unit * 0.25} paintOrder="stroke" pointerEvents="none">
                      {r.name}
                    </text>
                    {sel && r.shape === 'CIRCLE' && (
                      <circle cx={r.x + r.radius} cy={r.z} r={unit * 0.9} fill="#fff" stroke={color} strokeWidth={unit * 0.3} className="cursor-ew-resize" onPointerDown={(e) => startDrag(e, { kind: 'radius', index: i })} />
                    )}
                    {sel &&
                      r.shape === 'POLYGON' &&
                      r.points.map((p, k) => (
                        <circle key={k} cx={p[0]} cy={p[1]} r={unit * 0.8} fill="#fff" stroke={color} strokeWidth={unit * 0.3} className="cursor-move" onPointerDown={(e) => startDrag(e, { kind: 'point', index: i, point: k })} />
                      ))}
                  </g>
                );
              })}
              {draft.length > 0 && (
                <g pointerEvents="none">
                  <polyline points={draft.map((p) => p.join(',')).join(' ')} fill="none" stroke="#fff" strokeDasharray={`${unit} ${unit}`} strokeWidth={unit * 0.3} />
                  {draft.map((p, k) => (
                    <circle key={k} cx={p[0]} cy={p[1]} r={unit * 0.7} fill="#fff" />
                  ))}
                </g>
              )}
            </svg>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Kuzey yukarı · X sağa, Z aşağı artar · Seçili bölgenin merkezini sürükleyerek taşıyın; dairede beyaz tutamaç yarıçapı, çokgende köşeleri değiştirir.
          </p>
        </div>

        <aside className="space-y-4">
          <div className="card p-3">
            <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">Bölgeler</h2>
            {regions.length === 0 ? (
              <p className="px-1 text-sm text-slate-500">Üstteki düğmelerle haritaya bölge çizin.</p>
            ) : (
              <ul className="space-y-1">
                {regions.map((r, i) => {
                  const hr = hourly(r, monsterById);
                  return (
                    <li key={i}>
                      <button
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${i === selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
                        onClick={() => setSelected(i)}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="truncate text-slate-200">{r.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-slate-500">
                          {r.spawns.length} spawn{hr.kills ? ` · ~${hr.kills}/sa` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {region && selected !== null && (
            <RegionPanel
              key={selected}
              region={region}
              monsters={monsters}
              monsterById={monsterById}
              onChange={(patch) => setRegion(selected, patch)}
              onCodeFrom={(name) => uniqueCode(slug(name), selected)}
              onRemove={() => removeRegion(selected)}
            />
          )}
        </aside>
      </div>
    </>
  );
}

function RegionPanel({
  region: r,
  monsters,
  monsterById,
  onChange,
  onCodeFrom,
  onRemove,
}: {
  region: SpawnRegion;
  monsters: MonsterSummary[];
  monsterById: Record<number, { name: string; level: number; rank: string; exp: number; code: string }>;
  onChange: (patch: Partial<SpawnRegion>) => void;
  onCodeFrom: (name: string) => string;
  onRemove: () => void;
}) {
  const [codeTouched, setCodeTouched] = useState(false);
  const setSpawn = (k: number, patch: Partial<SpawnEntry>) => onChange({ spawns: r.spawns.map((s, j) => (j === k ? { ...s, ...patch } : s)) });
  const hr = hourly(r, monsterById);

  return (
    <div className="card space-y-4 p-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bölge adı">
          <input
            className="input"
            value={r.name}
            maxLength={80}
            onChange={(e) => onChange({ name: e.target.value, ...(codeTouched ? {} : { code: onCodeFrom(e.target.value) }) })}
          />
        </Field>
        <Field label="Kod">
          <input
            className="input font-mono"
            value={r.code}
            maxLength={40}
            onChange={(e) => {
              setCodeTouched(true);
              onChange({ code: e.target.value.toLowerCase() });
            }}
          />
        </Field>
        <Field label="Seviye aralığı" hint="Bilgi: yaratık seviyesi dışındaysa yayında uyarı">
          <div className="flex items-center gap-1">
            <NumberInput value={r.levelMin} min={1} max={250} onChange={(v) => onChange({ levelMin: v })} aria-label="Min seviye" />
            <span className="text-slate-600">–</span>
            <NumberInput value={r.levelMax} min={1} max={250} onChange={(v) => onChange({ levelMax: v })} aria-label="Max seviye" />
          </div>
        </Field>
        {r.shape === 'CIRCLE' ? (
          <Field label="Merkez / yarıçap (m)">
            <div className="flex gap-1">
              <NumberInput value={r.x} onChange={(v) => onChange({ x: v })} aria-label="X" min={-100000} />
              <NumberInput value={r.z} onChange={(v) => onChange({ z: v })} aria-label="Z" min={-100000} />
              <NumberInput value={r.radius} min={0.5} onChange={(v) => onChange({ radius: v })} aria-label="Yarıçap" />
            </div>
          </Field>
        ) : (
          <div className="text-xs text-slate-500">
            Çokgen · {r.points.length} köşe
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-semibold text-slate-300">Doğanlar</h3>
          {hr.kills > 0 && (
            <span className="text-xs text-slate-500">
              sürekli kesilirse ~{hr.kills} yaratık, ~{hr.exp.toLocaleString('tr-TR')} EXP / saat
            </span>
          )}
        </div>
        <ul className="space-y-3">
          {r.spawns.map((s, k) => {
            const m = monsterById[s.monsterId];
            const levelOff = m && (m.level < r.levelMin || m.level > r.levelMax);
            return (
              <li key={k} className="rounded-lg border border-white/5 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="truncate font-medium text-slate-100">{m?.name ?? `#${s.monsterId}`}</span>
                  {m && <RankBadge rank={m.rank} />}
                  <span className={`text-xs ${levelOff ? 'text-amber-300' : 'text-slate-500'}`}>Sv. {m?.level}</span>
                  <button className="ml-auto text-red-400 hover:text-red-300" aria-label="Spawnı kaldır" onClick={() => onChange({ spawns: r.spawns.filter((_, j) => j !== k) })}>
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <label className="text-slate-500">
                    Tür
                    <select className="input mt-0.5 py-1" value={s.kind} onChange={(e) => setSpawn(k, { kind: e.target.value as SpawnEntry['kind'] })}>
                      {SPAWN_KINDS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-slate-500">
                    Aynı anda grup
                    <NumberInput className="mt-0.5 py-1" value={s.maxAlive} min={1} max={100} onChange={(v) => setSpawn(k, { maxAlive: Math.max(1, v) })} aria-label="Aynı anda grup" />
                  </label>
                  <label className="text-slate-500">
                    Grupta (min–max)
                    <div className="mt-0.5 flex gap-1">
                      <NumberInput className="py-1" value={s.packMin} min={1} max={50} onChange={(v) => setSpawn(k, { packMin: Math.max(1, v), packMax: Math.max(v, s.packMax) })} aria-label="Min" />
                      <NumberInput className="py-1" value={s.packMax} min={1} max={50} onChange={(v) => setSpawn(k, { packMax: Math.max(1, v), packMin: Math.min(s.packMin, Math.max(1, v)) })} aria-label="Max" />
                    </div>
                  </label>
                  <label className="col-span-2 text-slate-500">
                    Yeniden doğma (sn, min–max)
                    <div className="mt-0.5 flex gap-1">
                      <NumberInput className="py-1" value={s.respawnMinS} min={1} onChange={(v) => setSpawn(k, { respawnMinS: Math.max(1, v), respawnMaxS: Math.max(v, s.respawnMaxS) })} aria-label="Min sn" />
                      <NumberInput className="py-1" value={s.respawnMaxS} min={1} onChange={(v) => setSpawn(k, { respawnMaxS: Math.max(1, v), respawnMinS: Math.min(s.respawnMinS, Math.max(1, v)) })} aria-label="Max sn" />
                    </div>
                  </label>
                  <label className="flex items-end gap-2 pb-1 text-slate-400">
                    <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={s.announce} onChange={(e) => setSpawn(k, { announce: e.target.checked })} />
                    Duyur
                  </label>
                  {s.kind === 'EVENT' && (
                    <label className="col-span-3 text-slate-500">
                      Zaman (ör. night, daily 20:00, every 2h)
                      <input className="input mt-0.5 py-1 font-mono" value={s.schedule} maxLength={60} onChange={(e) => setSpawn(k, { schedule: e.target.value })} />
                    </label>
                  )}
                </div>
                {(s.kind === 'STONE' || s.kind === 'EVENT') && <p className="mt-1 text-[11px] text-amber-200/80">{labelOf(SPAWN_KINDS, s.kind)} türü oyunda 5. adımla çalışacak.</p>}
              </li>
            );
          })}
        </ul>
        <select
          className="input mt-3"
          value=""
          aria-label="Yaratık ekle"
          onChange={(e) => {
            const m = monsters.find((x) => x.id === Number(e.target.value));
            if (m) onChange({ spawns: [...r.spawns, newSpawn(m)] });
          }}
        >
          <option value="">+ Yaratık ekle</option>
          {monsters.map((m) => (
            <option key={m.id} value={m.id}>
              Sv. {m.level} · {m.name} ({m.code})
            </option>
          ))}
        </select>
      </div>

      <button className="text-xs text-red-400 hover:text-red-300" onClick={onRemove}>
        Bölgeyi sil
      </button>
    </div>
  );
}
