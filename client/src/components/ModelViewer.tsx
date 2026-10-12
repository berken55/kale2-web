import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

async function loadModel(url: string, ext: string): Promise<THREE.Object3D> {
  if (ext === 'glb' || ext === 'gltf') return (await new GLTFLoader().loadAsync(url)).scene;
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
  const sceneRef = useRef<{ model?: THREE.Object3D; controls?: OrbitControls }>({});

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
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    setStatus('loading');
    setInfo(null);
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
          <div className="absolute left-3 top-3 flex gap-2">
            <button className="btn-ghost btn-sm" onClick={() => setAutoRotate((v) => !v)}>
              {autoRotate ? 'Dönmeyi durdur' : 'Döndür'}
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setWireframe((v) => !v)}>
              {wireframe ? 'Dolu' : 'Tel kafes'}
            </button>
          </div>
          {info && (
            <div className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-[11px] text-slate-300 tabular-nums">
              {info.meshes} mesh · {info.triangles.toLocaleString('tr-TR')} üçgen · {info.size}
            </div>
          )}
        </>
      )}
    </div>
  );
}
