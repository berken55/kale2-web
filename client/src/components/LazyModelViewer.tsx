import { lazy, Suspense } from 'react';
import { Spinner } from './ui';

// three.js büyük bir paket; yalnızca 3D model gösterilirken yüklenir
const LazyModelViewer = lazy(() => import('./ModelViewer').then((m) => ({ default: m.ModelViewer })));

export function ModelViewer(props: { url: string; className?: string }) {
  return (
    <Suspense fallback={<div className={`flex items-center justify-center rounded-xl border border-white/10 bg-ink-850 ${props.className ?? ''}`}><Spinner className="text-brand-400" /></div>}>
      <LazyModelViewer {...props} />
    </Suspense>
  );
}

