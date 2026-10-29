import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface Hero3DViewerProps {
  modelUrl?: string;
  className?: string;
}

export function Hero3DViewer({
  modelUrl = '/assets/models/vahsi_uzman.glb',
  className = '',
}: Hero3DViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [activeAnim, setActiveAnim] = useState<string>('WAIT');

  const controlsRef = useRef<OrbitControls | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const initialPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0.5, 1.3, 3.2));
  const initialTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.95, 0));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let animationFrameId: number;

    // 1. Scene
    const scene = new THREE.Scene();

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(
      42,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      100
    );
    camera.position.copy(initialPosRef.current);
    cameraRef.current = camera;

    // 3. Renderer with transparent background
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    mount.appendChild(renderer.domElement);

    // 4. Atmospheric Lights
    const ambientLight = new THREE.HemisphereLight(0xffedd5, 0x141a15, 1.8);
    scene.add(ambientLight);

    // Warm golden key light from top-right
    const keyLight = new THREE.DirectionalLight(0xffdfa8, 3.0);
    keyLight.position.set(3.5, 4.5, 3);
    scene.add(keyLight);

    // Menacing red/ruby rim light from back-left for game boss silhouette
    const rimLight = new THREE.DirectionalLight(0xe64d32, 2.8);
    rimLight.position.set(-3.5, 2.5, -2.5);
    scene.add(rimLight);

    // Cool front fill light
    const fillLight = new THREE.DirectionalLight(0x7391b4, 1.2);
    fillLight.position.set(-2, 1.5, 2.5);
    scene.add(fillLight);

    // Golden pedestal base
    const pedestalGroup = new THREE.Group();
    const pedestalGeo = new THREE.CylinderGeometry(1.15, 1.25, 0.05, 36);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x141714,
      metalness: 0.85,
      roughness: 0.35,
      emissive: 0xd4b47c,
      emissiveIntensity: 0.06,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -0.025;
    pedestalGroup.add(pedestal);

    // Pedestal gold accent ring
    const ringGeo = new THREE.RingGeometry(1.16, 1.24, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xd4b47c,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    pedestalGroup.add(ring);
    scene.add(pedestalGroup);

    // 5. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.target.copy(initialTargetRef.current);
    controls.minDistance = 1.5;
    controls.maxDistance = 5.2;
    controls.maxPolarAngle = Math.PI / 2 + 0.04;
    controlsRef.current = controls;

    // 6. Load Model
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;

        // Bounding box & centering
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 1.85 / maxDim;
        model.scale.setScalar(scale);

        // Center on X and Z, place feet right on the pedestal
        model.position.x = -center.x * scale;
        model.position.z = -center.z * scale;
        model.position.y = -box.min.y * scale;

        // Enhance material reflections
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.material) {
              const mat = mesh.material as THREE.MeshStandardMaterial;
              mat.roughness = Math.max(mat.roughness, 0.4);
              mat.envMapIntensity = 1.2;
            }
          }
        });

        scene.add(model);

        // Animation mixer
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;
          const actions: Record<string, THREE.AnimationAction> = {};

          gltf.animations.forEach((clip) => {
            actions[clip.name] = mixer.clipAction(clip);
          });

          actionsRef.current = actions;

          // Default animation: WAIT
          const startAnim = actions['WAIT'] ? 'WAIT' : gltf.animations[0].name;
          actions[startAnim]?.play();
          setActiveAnim(startAnim);
        }

        setLoading(false);
      },
      undefined,
      (err) => {
        if (disposed) return;
        console.error('Error loading 3D model:', err);
        setError('3D model yüklenirken bir hata oluştu.');
        setLoading(false);
      }
    );

    // Resize Observer
    const handleResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    // Render loop
    const clock = new THREE.Clock();
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      mixerRef.current?.update(delta);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl]);

  // Animation switch
  const switchAnimation = (animName: string) => {
    const actions = actionsRef.current;
    const currentAction = actions[activeAnim];
    const nextAction = actions[animName];

    if (!nextAction || animName === activeAnim) return;

    if (currentAction) {
      currentAction.fadeOut(0.2);
    }
    nextAction.reset().fadeIn(0.2).play();
    setActiveAnim(animName);
  };

  const toggleAutoRotate = () => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = !autoRotate;
      setAutoRotate(!autoRotate);
    }
  };

  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.copy(initialPosRef.current);
      controlsRef.current.target.copy(initialTargetRef.current);
      controlsRef.current.update();
    }
  };

  return (
    <div className={`hero-3d-wrapper ${className}`}>
      {/* 3D WebGL Canvas */}
      <div className="hero-3d-canvas" ref={mountRef} />

      {/* Loading State */}
      {loading && (
        <div className="hero-3d-loading">
          <div className="hero-3d-spinner" />
          <span>CANLI 3D MODEL YÜKLENİYOR...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="hero-3d-error">
          <span>{error}</span>
        </div>
      )}

      {/* Atmospheric Boss Badge */}
      {!loading && !error && (
        <>
          <div className="hero-3d-boss-badge">
            <div className="boss-badge-header">
              <span className="live-dot" />
              <span>CANLI 3D OYUN MODELİ</span>
            </div>
            <h4>VAHŞİ UZMAN</h4>
            <div className="boss-badge-meta">
              <span>Seviye 42 · Elit Düşman</span>
              <span className="badge-divider">/</span>
              <span className="loot-highlight">Ganimet: Dolunay Kılıcı</span>
            </div>
          </div>

          {/* Interactive HUD Controls */}
          <div className="hero-3d-controls-hud">
            {/* Animation Switchers */}
            <div className="anim-switch-group">
              {[
                { key: 'WAIT', label: 'Bekle', icon: '🛡' },
                { key: 'NORMAL_ATTACK', label: 'Saldır', icon: '⚔' },
                { key: 'RUN', label: 'Koş', icon: '🏃' },
              ].map((anim) => {
                const isSelected = activeAnim === anim.key;
                return (
                  <button
                    key={anim.key}
                    type="button"
                    className={`anim-btn ${isSelected ? 'active' : ''}`}
                    onClick={() => switchAnimation(anim.key)}
                    title={`${anim.label} animasyonunu başlat`}
                  >
                    <span>{anim.icon}</span> {anim.label}
                  </button>
                );
              })}
            </div>

            {/* Orbit / View Tools */}
            <div className="view-ctrl-group">
              <button
                type="button"
                className={`ctrl-icon-btn ${autoRotate ? 'active' : ''}`}
                onClick={toggleAutoRotate}
                title={autoRotate ? 'Otomatik dönüşü durdur' : 'Otomatik dönüşü başlat'}
                aria-label="Otomatik dönüşü değiştir"
              >
                {autoRotate ? '⏸' : '▶'}
              </button>
              <button
                type="button"
                className="ctrl-icon-btn"
                onClick={resetCamera}
                title="Açıyı sıfırla"
                aria-label="Kamerayı sıfırla"
              >
                ↺
              </button>
            </div>
          </div>

          <div className="hero-3d-hint">
            <span>🖱 360° Çevirmek için sürükle · Yakınlaştır</span>
          </div>
        </>
      )}
    </div>
  );
}
