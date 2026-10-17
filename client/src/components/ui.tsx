import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { RARITIES } from '@shared/constants';

// ---------- Bildirimler ----------
type Toast = { id: number; kind: 'success' | 'error'; text: string };
const ToastContext = createContext<(kind: Toast['kind'], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-xl backdrop-blur ${
              t.kind === 'success'
                ? 'border-emerald-500/30 bg-emerald-950/90 text-emerald-200'
                : 'border-red-500/30 bg-red-950/90 text-red-200'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------- Onay penceresi ----------
type ConfirmOptions = { title: string; message: string; confirmText?: string; danger?: boolean };
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })),
    [],
  );
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => close(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="card w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg text-brand-300">{state.title}</h2>
            <p className="mt-2 text-sm text-slate-300">{state.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => close(false)}>
                Vazgeç
              </button>
              <button autoFocus className={state.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>
                {state.confirmText ?? 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

// ---------- Küçük bileşenler ----------
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label="Yükleniyor"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function RarityBadge({ rarity }: { rarity: string }) {
  const r = RARITIES.find((x) => x.value === rarity) ?? RARITIES[0];
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ color: r.color, borderColor: `${r.color}55`, background: `${r.color}14` }}
    >
      {r.label}
    </span>
  );
}

export function rarityColor(rarity: string) {
  return (RARITIES.find((x) => x.value === rarity) ?? RARITIES[0]).color;
}

export function ItemIcon({ url, name, rarity, size = 40 }: { url: string | null; name: string; rarity: string; size?: number }) {
  const color = rarityColor(rarity);
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-ink-800"
      style={{ width: size, height: size, borderColor: `${color}66` }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-contain [image-rendering:pixelated]" />
      ) : (
        <span className="font-display text-sm" style={{ color }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

/** Tanıtım sayfasındaki kale işaretinin panel/wiki sürümü. */
export function Brand({ tagline, size = 'md' }: { tagline: string; size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span className={`inline-flex items-center ${lg ? 'gap-3' : 'gap-2.5'}`}>
      <span
        aria-hidden
        className={`grid shrink-0 -skew-x-6 place-items-center border border-brand-400/60 bg-brand-500/10 text-brand-300 shadow-[inset_0_0_12px_rgba(61,139,255,0.25)] ${
          lg ? 'h-14 w-14 text-3xl' : 'h-9 w-9 text-xl'
        }`}
      >
        ♜
      </span>
      <span className="flex flex-col text-left">
        <span className={`font-display font-extrabold uppercase leading-none tracking-wide text-white ${lg ? 'text-3xl' : 'text-xl'}`}>Kale2</span>
        <span className="mt-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.3em] text-brand-400">{tagline}</span>
      </span>
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="section-title">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-400">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  className = '',
  ...rest
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <input
      type="number"
      className={`input tabular-nums ${className}`}
      value={Number.isFinite(value) ? value : ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      {...rest}
    />
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="font-display text-lg text-slate-300">{title}</div>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
