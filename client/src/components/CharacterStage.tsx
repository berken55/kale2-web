import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PlayerClass } from '@shared/players';

export default function CharacterStage({ kind }: { kind: PlayerClass }) {
  const mount = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Karakter yükleniyor…');
  useEffect(() => {
    if (!mount.current) return;
    const element = mount.current; let disposed = false, frame = 0;
    let renderer: THREE.WebGLRenderer;
    setStatus('Karakter yükleniyor…');
    try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); }
    catch { setStatus('3D önizleme bu tarayıcıda açılamadı. Karakter oluşturup devam edebilirsin.'); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', `${kind === 'warrior' ? 'Savaşçı' : 'Ninja'} 3D önizlemesi`);
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
    camera.position.set(0, 1.3, 3.9);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x796c53, 2.6));
    const key = new THREE.DirectionalLight(0xfff5df, 3.2); key.position.set(3, 5, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.4); rim.position.set(-3, 3, -2); scene.add(rim);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableZoom = false; controls.enableDamping = true; controls.target.set(0, 1, 0); controls.minPolarAngle = Math.PI * .32; controls.maxPolarAngle = Math.PI * .52;
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.18, .05, 4), new THREE.MeshStandardMaterial({ color: 0xd7d0c0, roughness: 1 }));
    platform.position.y = -.03; platform.rotation.y = Math.PI / 4; scene.add(platform);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.05, 64), new THREE.MeshBasicMaterial({ color: 0xc0b6a1, transparent: true, opacity: .15 })); floor.rotation.x = -Math.PI / 2; floor.position.y = .002; scene.add(floor);
    let mixer: THREE.AnimationMixer | undefined;
    const release = (root: THREE.Object3D) => root.traverse(obj => {
      const mesh = obj as THREE.Mesh; if (!mesh.isMesh) return;
      mesh.geometry.dispose(); const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach(material => { for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose(); material.dispose(); });
    });
    new GLTFLoader().load(`/assets/characters/${kind}.glb`, gltf => {
      if (disposed) { release(gltf.scene); return; }
      const model = gltf.scene;
      if (kind === 'ninja') {
        // The legacy face/hair export omits metallicFactor (glTF defaults to 1)
        // and has roughnessFactor=20. Skin and hair need non-metallic materials.
        model.traverse(object => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            if (material instanceof THREE.MeshStandardMaterial && /^(assassin_face|hair_)/i.test(material.name)) {
              material.metalness = 0;
              material.roughness = 1;
              material.needsUpdate = true;
            }
          }
        });
      }
      const bounds = new THREE.Box3().setFromObject(model), height = bounds.max.y - bounds.min.y;
      const scale = 2 / Math.max(height, .001); model.scale.multiplyScalar(scale);
      bounds.setFromObject(model); const center = bounds.getCenter(new THREE.Vector3()); model.position.set(-center.x, -bounds.min.y, -center.z);
      scene.add(model);
      const idle = gltf.animations.find(a => /general wait|idle|intro wait/i.test(a.name));
      if (idle && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) { mixer = new THREE.AnimationMixer(model); mixer.clipAction(idle).play(); }
      setStatus('');
    }, undefined, () => { if (!disposed) setStatus('3D model yüklenemedi. Karakter oluşturup devam edebilirsin.'); });
    const resize = () => { const w = element.clientWidth, h = element.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    let previous = performance.now();
    const render = (now: number) => { if (disposed) return; frame = requestAnimationFrame(render); const delta = Math.min((now - previous) / 1000, .05); previous = now; if (document.hidden) return; mixer?.update(delta); controls.update(); renderer.render(scene, camera); };
    frame = requestAnimationFrame(render);
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); mixer?.stopAllAction(); release(scene); renderer.dispose(); renderer.domElement.remove(); };
  }, [kind]);
  return <div className="character-stage"><div ref={mount} className="character-canvas" />{status && <p className="stage-status" role="status">{status}</p>}<p className="stage-hint">SÜRÜKLE: DÖNDÜR · OYUN MODELİ ÖNİZLEMESİ</p></div>;
}
