import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface Hero3DViewerProps {
  modelUrl?: string;
  className?: string;
}

type SequencePhase = 'IDLE' | 'APPROACH' | 'ATTACK' | 'TURN_AWAY' | 'RETREAT' | 'TURN_BACK';

export function Hero3DViewer({
  modelUrl = '/assets/models/vahsi_uzman.glb',
  className = '',
}: Hero3DViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const controlsRef = useRef<OrbitControls | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const actorGroupRef = useRef<THREE.Group | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);

  const initialCamPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.05, 3.5));
  const initialTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let animationFrameId: number;

    // 1. Scene
    const scene = new THREE.Scene();

    // 2. Camera centered directly in front of (0, 0, 0)
    const camera = new THREE.PerspectiveCamera(
      40,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      100
    );
    camera.position.copy(initialCamPosRef.current);
    camera.lookAt(initialTargetRef.current);
    cameraRef.current = camera;

    // 3. WebGL Renderer with alpha transparency
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    mount.appendChild(renderer.domElement);

    // 4. Atmospheric Lights
    const ambientLight = new THREE.HemisphereLight(0xffedd5, 0x0e120f, 2.2);
    scene.add(ambientLight);

    // Key Light from top-right
    const keyLight = new THREE.DirectionalLight(0xffdfa8, 3.4);
    keyLight.position.set(3.5, 4.0, 3.0);
    scene.add(keyLight);

    // Dramatic red/ruby rim light from back-left
    const rimLight = new THREE.DirectionalLight(0xe64d32, 2.8);
    rimLight.position.set(-3.5, 2.5, -2.5);
    scene.add(rimLight);
    rimLightRef.current = rimLight;

    // Cool front fill light
    const fillLight = new THREE.DirectionalLight(0x7391b4, 1.4);
    fillLight.position.set(-2.5, 1.2, 3.0);
    scene.add(fillLight);

    // Subtle bottom bounce light for dramatic under-chin shadow fill
    const bottomFill = new THREE.PointLight(0xd4b47c, 1.0, 6);
    bottomFill.position.set(0, -1.8, 1.0);
    scene.add(bottomFill);

    // 5. Actor Group (Container for centering & position animation)
    const actorGroup = new THREE.Group();
    scene.add(actorGroup);
    actorGroupRef.current = actorGroup;

    // 6. OrbitControls (interactive drag enabled, autoRotate disabled)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = false;
    controls.target.copy(initialTargetRef.current);
    controls.minDistance = 1.4;
    controls.maxDistance = 5.5;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controlsRef.current = controls;

    // Smooth crossfade helper
    const playAnim = (clipName: string, duration = 0.2, timeScale = 1) => {
      const actions = actionsRef.current;
      const targetAction = actions[clipName];
      if (!targetAction) return;

      const current = currentActionRef.current;
      if (current === targetAction && current.isRunning()) {
        targetAction.setEffectiveTimeScale(timeScale);
        return;
      }

      targetAction.reset();
      targetAction.setEffectiveTimeScale(timeScale);
      targetAction.setEffectiveWeight(1);
      targetAction.fadeIn(duration).play();

      if (current && current !== targetAction) {
        current.fadeOut(duration);
      }

      currentActionRef.current = targetAction;
    };

    // 7. Load GLTF Model
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;

        // Find body mesh or calculate full bounding box
        const bodyObj = model.getObjectByName('jh') || model;
        const bodyBox = new THREE.Box3().setFromObject(bodyObj);
        const bodySize = bodyBox.getSize(new THREE.Vector3());
        const bodyCenter = bodyBox.getCenter(new THREE.Vector3());

        // Target height ~2.15 units so monster fills the viewport center with majesty
        const maxDim = Math.max(bodySize.y, 1);
        const scale = 2.15 / maxDim;
        model.scale.setScalar(scale);

        // Center the model's mid-torso exactly at (0, 0, 0) of actorGroup
        model.position.x = -bodyCenter.x * scale;
        model.position.y = -bodyCenter.y * scale;
        model.position.z = -bodyCenter.z * scale;

        // Materials optimization
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.material) {
              const mat = mesh.material as THREE.MeshStandardMaterial;
              mat.roughness = Math.max(mat.roughness, 0.38);
              mat.envMapIntensity = 1.3;
            }
          }
        });

        actorGroup.add(model);

        // Setup Animations
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;
          const actions: Record<string, THREE.AnimationAction> = {};

          gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip);
            if (clip.name === 'NORMAL_ATTACK') {
              action.setLoop(THREE.LoopOnce, 1);
              action.clampWhenFinished = true;
            } else {
              action.setLoop(THREE.LoopRepeat, Infinity);
            }
            actions[clip.name] = action;
          });

          actionsRef.current = actions;

          // Start in WAIT animation
          playAnim('WAIT', 0.1);
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

    // Cinematic Sequence Parameters
    const Z_FAR = -1.6;  // Origin / resting distance
    const Z_NEAR = 0.55; // Close-up attack point near camera

    const T_IDLE = 1.4;       // Pause in WAIT stance
    const T_APPROACH = 1.8;   // Charge forward in RUN
    const T_ATTACK = 2.17;    // Swing sword in NORMAL_ATTACK
    const T_TURN_AWAY = 0.35; // Pivot 180 deg to retreat
    const T_RETREAT = 1.8;    // Run back to original distance
    const T_TURN_BACK = 0.35; // Pivot 180 deg to face front

    let phase: SequencePhase = 'IDLE';
    let phaseTime = 0;

    // Render loop
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);

      mixerRef.current?.update(delta);

      // Continuous cinematic sequence state machine
      if (actorGroupRef.current) {
        phaseTime += delta;
        const actor = actorGroupRef.current;

        if (phase === 'IDLE') {
          actor.position.z = Z_FAR;
          actor.rotation.y = 0;
          if (phaseTime >= T_IDLE) {
            phase = 'APPROACH';
            phaseTime = 0;
            playAnim('RUN', 0.25, 1.15);
          }
        } else if (phase === 'APPROACH') {
          const p = Math.min(phaseTime / T_APPROACH, 1);
          // Ease in out
          const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          actor.position.z = Z_FAR + (Z_NEAR - Z_FAR) * ease;
          actor.rotation.y = 0;

          if (phaseTime >= T_APPROACH) {
            phase = 'ATTACK';
            phaseTime = 0;
            actor.position.z = Z_NEAR;
            playAnim('NORMAL_ATTACK', 0.12, 1.05);
          }
        } else if (phase === 'ATTACK') {
          actor.position.z = Z_NEAR;
          actor.rotation.y = 0;

          // Impact shudder and rim light burst at swing impact moment
          if (phaseTime >= 0.65 && phaseTime <= 0.95) {
            const intensity = 1 - (phaseTime - 0.65) / 0.3;
            const shake = intensity * 0.035;
            camera.position.x = initialCamPosRef.current.x + (Math.random() - 0.5) * shake;
            camera.position.y = initialCamPosRef.current.y + (Math.random() - 0.5) * shake;
            if (rimLightRef.current) rimLightRef.current.intensity = 5.2;
          } else {
            if (rimLightRef.current) rimLightRef.current.intensity = 2.8;
            camera.position.x = THREE.MathUtils.lerp(camera.position.x, initialCamPosRef.current.x, 0.15);
            camera.position.y = THREE.MathUtils.lerp(camera.position.y, initialCamPosRef.current.y, 0.15);
          }

          if (phaseTime >= T_ATTACK) {
            phase = 'TURN_AWAY';
            phaseTime = 0;
            playAnim('RUN', 0.18, 1.1);
          }
        } else if (phase === 'TURN_AWAY') {
          const p = Math.min(phaseTime / T_TURN_AWAY, 1);
          const ease = p * p * (3 - 2 * p);
          actor.position.z = Z_NEAR;
          actor.rotation.y = ease * Math.PI;

          if (phaseTime >= T_TURN_AWAY) {
            phase = 'RETREAT';
            phaseTime = 0;
            actor.rotation.y = Math.PI;
          }
        } else if (phase === 'RETREAT') {
          const p = Math.min(phaseTime / T_RETREAT, 1);
          const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          actor.position.z = Z_NEAR + (Z_FAR - Z_NEAR) * ease;
          actor.rotation.y = Math.PI;

          if (phaseTime >= T_RETREAT) {
            phase = 'TURN_BACK';
            phaseTime = 0;
            actor.position.z = Z_FAR;
            playAnim('WAIT', 0.25);
          }
        } else if (phase === 'TURN_BACK') {
          const p = Math.min(phaseTime / T_TURN_BACK, 1);
          const ease = p * p * (3 - 2 * p);
          actor.position.z = Z_FAR;
          actor.rotation.y = Math.PI + ease * Math.PI;

          if (phaseTime >= T_TURN_BACK) {
            phase = 'IDLE';
            phaseTime = 0;
            actor.rotation.y = 0;
          }
        }
      }

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

  return (
    <div className={`hero-3d-wrapper ${className}`}>
      {/* Three.js canvas container */}
      <div ref={mountRef} className="hero-3d-canvas" />

      {/* Loading state */}
      {loading && (
        <div className="hero-3d-loading">
          <div className="hero-3d-spinner" />
          <span>VAHŞİ UZMAN YÜKLENİYOR...</span>
        </div>
      )}

      {/* Error state */}
      {error && <div className="hero-3d-error">{error}</div>}

      {/* Clean Boss Badge (Dolunay Kılıcı kaldırıldı) */}
      {!loading && !error && (
        <div className="hero-3d-boss-badge">
          <div className="boss-badge-header">
            <span className="live-dot" />
            <span>ELİT DÜŞMAN · LV 42</span>
          </div>
          <h4>VAHŞİ UZMAN</h4>
        </div>
      )}
    </div>
  );
}
