import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { ModelAnimation } from './model-animation';

async function loadModel(url: string, ext: string): Promise<THREE.Object3D> {
  if (ext === 'glb' || ext === 'gltf') {
    const gltf = await new GLTFLoader().loadAsync(url);
    gltf.scene.animations = gltf.animations;
    return gltf.scene;
  }
  if (ext === 'obj') return new OBJLoader().loadAsync(url);
  if (ext === 'fbx') return new FBXLoader().loadAsync(url);
  throw new Error('Bu format tarayıcıda önizlenemiyor.');
}

const VIEW_DIRECTION = new THREE.Vector3(0.8, 0.45, 1).normalize();
/** Hassas sınır kutusu hesabında örneklenecek en fazla köşe sayısı (büyük modellerde tek poz yeterli). */
const MAX_SAMPLED_VERTICES = 400_000;

function vertexCount(model: THREE.Object3D) {
  let n = 0;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) n += mesh.geometry.attributes.position?.count ?? 0;
  });
  return n;
}

/** Modelin o anki pozdaki gerçek (iskelet uygulanmış) sınır kutusu. */
function poseBounds(model: THREE.Object3D) {
  model.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model, true);
}

/**
 * Seçili animasyonun birkaç anındaki pozları birleştirerek modelin kapladığı alanı bulur;
 * böylece kol açma, saldırı gibi hareketlerde model kadrajdan taşmaz.
 */
function animatedBounds(model: THREE.Object3D, animation: ModelAnimation | undefined, vertices: number) {
  const box = poseBounds(model);
  const clip = animation?.current;
  if (!animation || !clip || clip.duration <= 0) return box;
  const samples = Math.max(0, Math.min(8, Math.floor(MAX_SAMPLED_VERTICES / Math.max(vertices, 1)) - 1));
  if (samples === 0) return box;
  const original = animation.time;
  for (let i = 1; i <= samples; i++) {
    animation.seek((clip.duration * i) / (samples + 1));
    box.union(poseBounds(model));
  }
  animation.seek(original);
  model.updateMatrixWorld(true);
  return box;
}

/** Kamerayı, kutunun tamamı hem yatayda hem dikeyde görünecek uzaklığa yerleştirir. */
function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, box: THREE.Box3, direction: THREE.Vector3) {
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.01);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.02;
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.target.copy(sphere.center);
  controls.minDistance = radius * 0.2;
  controls.maxDistance = distance * 5;
  controls.update();
}

/** Yüklenen 3D modeli döndürülebilir, yakınlaştırılabilir bir sahnede gösterir. */
export function ModelViewer({ url, className = '' }: { url: string; className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [info, setInfo] = useState<{ meshes: number; triangles: number; size: string } | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [animations, setAnimations] = useState<Array<{ name: string; duration: number }>>([]);
  const [animationIndex, setAnimationIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{ model?: THREE.Object3D; controls?: OrbitControls; animation?: ModelAnimation; fit?: (opts?: { recompute?: boolean; keepDirection?: boolean }) => void }>({});

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.6));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8ab4ff, 0.8);
    rim.position.set(-4, 2, -3);
    scene.add(rim);
    const grid = new THREE.GridHelper(4, 16, 0x2d5aa8, 0x1a2744);
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2;
    sceneRef.current.controls = controls;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      sceneRef.current.fit?.({ keepDirection: true });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let disposed = false;
    let frame = 0;
    let animation: ModelAnimation | undefined;
    let lastTimelineUpdate = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      const delta = Math.min(clock.getDelta(), 0.1);
      animation?.update(delta);
      lastTimelineUpdate += delta;
      if (animation && lastTimelineUpdate >= 0.1) {
        setTime(animation.time);
        lastTimelineUpdate = 0;
      }
      renderer.render(scene, camera);
    };
    animate();

    setStatus('loading');
    setInfo(null);
    setAnimations([]);
    setAnimationIndex(0);
    setTime(0);
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    loadModel(url, ext)
      .then((model) => {
        if (disposed) return;
        animation = new ModelAnimation(model, model.animations);
        sceneRef.current.animation = animation;
        animation.select(0);
        const vertices = vertexCount(model);

        // Modeli ilk pozuna göre ortala, tabanını zemine oturt ve yaklaşık 2 birim boyutuna ölçekle
        const box = poseBounds(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2 / maxDim;
        model.scale.multiplyScalar(scale);
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale).add(model.position.clone().multiplyScalar(scale));
        scene.add(model);

        let bounds = animatedBounds(model, animation, vertices);
        const fit = ({ recompute = false, keepDirection = false } = {}) => {
          if (recompute) bounds = animatedBounds(model, animation, vertices);
          const direction = keepDirection ? camera.position.clone().sub(controls.target).normalize() : VIEW_DIRECTION;
          fitCamera(camera, controls, bounds, direction);
          grid.scale.setScalar(Math.max(1, bounds.getSize(new THREE.Vector3()).length() * 0.4));
        };
        sceneRef.current.fit = fit;
        fit();

        setAnimations(model.animations.map((clip, index) => ({ name: clip.name || `Animasyon ${index + 1}`, duration: clip.duration })));
        sceneRef.current.model = model;

        let meshes = 0;
        let triangles = 0;
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          meshes++;
          const g = mesh.geometry;
          triangles += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
        });
        setInfo({
          meshes,
          triangles: Math.round(triangles),
          size: `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`,
        });
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (disposed) return;
        setError(e instanceof Error ? e.message : 'Model yüklenemedi.');
        setStatus('error');
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      animation?.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        mats.forEach((m) => m.dispose());
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = {};
    };
  }, [url]);

  useEffect(() => {
    sceneRef.current.model?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => 'wireframe' in m && ((m as THREE.MeshStandardMaterial).wireframe = wireframe));
    });
  }, [wireframe, status]);

  useEffect(() => {
    if (sceneRef.current.controls) sceneRef.current.controls.autoRotate = autoRotate;
  }, [autoRotate, status]);

  useEffect(() => {
    sceneRef.current.animation?.select(animationIndex);
    sceneRef.current.fit?.({ recompute: true, keepDirection: true });
    setTime(0);
  }, [animationIndex, status]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapperRef.current?.requestFullscreen?.();
  };

  useEffect(() => { sceneRef.current.animation?.setPlaying(playing); }, [playing, status]);
  useEffect(() => { sceneRef.current.animation?.setSpeed(speed); }, [speed, status]);

  const duration = animations[animationIndex]?.duration ?? 0;

  return (
    <div
      ref={wrapperRef}
      className={`flex flex-col overflow-hidden border border-white/10 bg-ink-900 ${fullscreen ? 'h-screen w-screen' : `rounded-xl ${className}`}`}
    >
      <div className="relative min-h-[220px] flex-1 bg-[radial-gradient(ellipse_at_center,#1b2a4a,#070b16_75%)]">
        <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Model yükleniyor…</div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-300">{error}</div>
        )}
        {status === 'ready' && (
          <div className="absolute right-2 top-2 flex gap-1">
            <ToolButton label={autoRotate ? 'Dönmeyi durdur' : 'Döndür'} active={autoRotate} onClick={() => setAutoRotate((v) => !v)} icon="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" />
            <ToolButton label={wireframe ? 'Dolu görünüm' : 'Tel kafes'} active={wireframe} onClick={() => setWireframe((v) => !v)} icon="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" />
            <ToolButton label="Modeli sığdır" onClick={() => sceneRef.current.fit?.()} icon="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 12h6M12 9v6" />
            <ToolButton
              label={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
              onClick={toggleFullscreen}
              icon={fullscreen ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'}
            />
          </div>
        )}
      </div>
      {status === 'ready' && (
        <div className="space-y-2 border-t border-white/10 bg-ink-950/80 px-3 py-2.5 text-xs text-slate-200">
          {animations.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Animasyon seç" className="input min-w-0 flex-1 py-1 text-xs" value={animationIndex} onChange={(e) => setAnimationIndex(Number(e.target.value))}>
                  {animations.map((clip, index) => <option key={index} value={index}>{clip.name}</option>)}
                </select>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setPlaying((v) => !v)}>{playing ? 'Duraklat' : 'Oynat'}</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => { sceneRef.current.animation?.seek(0); setTime(0); }}>Başa al</button>
                <select aria-label="Animasyon hızı" className="input w-auto py-1 text-xs" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                  {[0.25, 0.5, 1, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 tabular-nums">
                <input type="range" aria-label="Animasyon zamanı" className="min-w-0 flex-1 accent-brand-500" min="0" max={duration} step="0.01" value={Math.min(time, duration)} disabled={!duration} onChange={(e) => {
                  const value = Number(e.target.value);
                  sceneRef.current.animation?.seek(value);
                  setTime(value);
                }} />
                <span>{time.toFixed(1)} / {duration.toFixed(1)} sn</span>
              </div>
            </>
          )}
          <p className="text-[10px] text-slate-500 tabular-nums">
            {animations.length > 0 ? `${animations.length} animasyon` : 'Animasyon yok'}
            {info && ` · ${info.meshes} mesh · ${info.triangles.toLocaleString('tr-TR')} üçgen`} · Sürükle: döndür, tekerlek: yakınlaştır
          </p>
        </div>
      )}
    </div>
  );
}

function ToolButton({ label, icon, onClick, active = false }: { label: string; icon: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md border backdrop-blur transition ${
        active ? 'border-brand-400/60 bg-brand-500/25 text-brand-200' : 'border-white/10 bg-black/40 text-slate-300 hover:border-brand-400/50 hover:text-white'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={icon} />
      </svg>
    </button>
  );
}
