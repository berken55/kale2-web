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
  const sceneRef = useRef<{ model?: THREE.Object3D; controls?: OrbitControls; animation?: ModelAnimation }>({});

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
    const grid = new THREE.GridHelper(4, 16, 0x6b5a2e, 0x2a2f3a);
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
        // Modeli ortala ve yaklaşık 2 birim boyutuna ölçekle
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2 / maxDim;
        model.scale.setScalar(scale);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
        model.position.sub(center);
        model.position.y += (size.y * scale) / 2;
        scene.add(model);
        animation = new ModelAnimation(model, model.animations);
        sceneRef.current.animation = animation;
        setAnimations(model.animations.map((clip, index) => ({ name: clip.name || `Animasyon ${index + 1}`, duration: clip.duration })));
        sceneRef.current.model = model;

        camera.position.set(2.4, 1.8, 2.8);
        controls.target.set(0, (size.y * scale) / 2, 0);
        controls.update();

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
    setTime(0);
  }, [animationIndex, status]);

  useEffect(() => { sceneRef.current.animation?.setPlaying(playing); }, [playing, status]);
  useEffect(() => { sceneRef.current.animation?.setSpeed(speed); }, [speed, status]);

  const duration = animations[animationIndex]?.duration ?? 0;

  return (
    <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(ellipse_at_center,#1f2533,#0b0d12)] ${className}`}>
      <div ref={mountRef} className="absolute inset-0" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Model yükleniyor…</div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-300">{error}</div>
      )}
      {status === 'ready' && (
        <>
          <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAutoRotate((v) => !v)}>
              {autoRotate ? 'Dönmeyi durdur' : 'Döndür'}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setWireframe((v) => !v)}>
              {wireframe ? 'Dolu' : 'Tel kafes'}
            </button>
          </div>
          <div className="absolute bottom-3 left-3 right-3 space-y-2 rounded-lg bg-black/75 p-3 text-xs text-slate-200">
            {animations.length > 0 ? (
              <>
                <label className="flex items-center gap-2">
                  <span>Animasyon ({animations.length})</span>
                  <select aria-label="Animasyon seç" className="input min-w-0 flex-1 py-1 text-xs" value={animationIndex} onChange={(e) => setAnimationIndex(Number(e.target.value))}>
                    {animations.map((clip, index) => <option key={index} value={index}>{clip.name}</option>)}
                  </select>
                </label>
                <div className="flex flex-wrap items-center gap-2">
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
            ) : <p className="text-slate-400">Bu modelde animasyon yok.</p>}
            {info && <p className="text-[10px] text-slate-400 tabular-nums">{info.meshes} mesh · {info.triangles.toLocaleString('tr-TR')} üçgen · {info.size}</p>}
          </div>
        </>
      )}
    </div>
  );
}
