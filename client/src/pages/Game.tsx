import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PlayerProfile } from '@shared/types';
import '../game.css';

interface EquipItem {
  id: string;
  name: string;
  icon: string;
  slot: string;
  stats: string[];
  desc: string;
}

const DEFAULT_EQUIPMENT: EquipItem[] = [
  {
    id: 'weapon',
    name: 'Dolunay Kılıcı +9',
    icon: '⚔',
    slot: 'Silah',
    stats: ['Ortalama Hasar: %38', 'Beceri Hasarı: -5%', 'Saldırı Hızı: +15%', 'Güç: +12'],
    desc: 'Dolunayın gizemli ışığıyla bilenmiş efsanevi kılıç.',
  },
  {
    id: 'armor',
    name: 'Demir Plaka Zırh +9',
    icon: '🛡',
    slot: 'Zırh',
    stats: ['Savunma: +94', 'Max HP: +1500', 'Büyü Savunması: +10%'],
    desc: 'Ağır çelik ve ejderha pullarıyla güçlendirilmiş gövde zırhı.',
  },
  {
    id: 'helmet',
    name: 'Geleneksel Miğfer +9',
    icon: '🪖',
    slot: 'Kask',
    stats: ['Savunma: +37', 'HP Üretimi: +20%', 'Zehre Karşı Koyma: +8%'],
    desc: 'Savaşçının başını ve alnını koruyan kadim başlık.',
  },
  {
    id: 'shield',
    name: 'Savaş Kalkanı +9',
    icon: '⛨',
    slot: 'Kalkan',
    stats: ['Savunma: +58', 'Beden Karşısındaki Atakların Bloklanması: +10%'],
    desc: 'Ön saftaki ok ve kılıç darbelerini saptıran sağlam kalkan.',
  },
  {
    id: 'bracelet',
    name: 'Gümüş Bilezik +9',
    icon: '💍',
    slot: 'Bilezik',
    stats: ['Max HP: +1200', 'Saldırı Hızı: +8%'],
    desc: 'Gümüş madeninden dövülmüş çeviklik bileziği.',
  },
  {
    id: 'necklace',
    name: 'Yeşim Taşı Kolye +9',
    icon: '📿',
    slot: 'Kolye',
    stats: ['Büyü Hızı: +14%', 'Kritik Vuruş Şansı: +8%'],
    desc: 'Ruhu sakinleştiren ve enerjiyi tazeleyen yeşim taşı.',
  },
  {
    id: 'earrings',
    name: 'Abanoz Küpe +9',
    icon: '👂',
    slot: 'Küpe',
    stats: ['Güç: +12', 'Max HP: +1650'],
    desc: 'Savaşçıların vazgeçilmezi abanoz ağacı küpeleri.',
  },
  {
    id: 'shoes',
    name: 'Deri Çizme +9',
    icon: '👢',
    slot: 'Ayakkabı',
    stats: ['Savunma: +24', 'Hareket Hızı: +15%', 'Oklardan Korunma: +10%'],
    desc: 'Hızlı manevra yapmayı sağlayan hafif deri zırh çizmeleri.',
  },
];

const INVENTORY_ITEMS = [
  { id: 'pot_red', name: 'Kırmızı İksir (B)', count: 200, icon: '🧪', color: '#e64d32', stats: ['Canı 1200 yeniler'], desc: 'Yaraları hızla iyileştiren kırmızı bitki özü.' },
  { id: 'pot_blue', name: 'Mavi İksir (B)', count: 200, icon: '💧', color: '#3182ce', stats: ['Manayı 800 yeniler'], desc: 'Ruhsal gücü tazeleyen mavi iksir.' },
  { id: 'scroll', name: 'Kutsama Kağıdı', count: 18, icon: '📜', color: '#d4b47c', stats: ['Yükseltme şansı'], desc: 'Eşya başarısız olursa kırılmasını önler, seviyesini 1 düşürür.' },
  { id: 'pearl', name: 'Beyaz İnci', count: 4, icon: '⚪', color: '#fff', stats: ['Geliştirme eşyası'], desc: 'Derin deniz midyelerinden çıkarılan saf beyaz inci.' },
  { id: 'stone_warrior', name: 'Savaşçıdan Koruyan Taş +4', count: 1, icon: '💎', color: '#e53e3e', stats: ['Savaşçılara karşı güçlü: +25%'], desc: 'Silaha basılan güç taşı.' },
  { id: 'stone_death', name: 'Öldürücü Darbe Taşı +4', count: 2, icon: '💠', color: '#805ad5', stats: ['Kritik vuruş şansı: +8%'], desc: 'Vuruşların kritik hasar verme olasılığını artırır.' },
  { id: 'teleport', name: 'Işınlanma Yüzüğü', count: 45, icon: '💍', color: '#38a169', stats: ['Hızlı seyahat'], desc: 'Köy meydanına ve savaş vadisine anında ışınlar.' },
  { id: 'yang_bundle', name: 'Altın Külçe (100K)', count: 3, icon: '💰', color: '#ecc94b', stats: ['Yang değeri: 100.000'], desc: 'Büyük ticaretlerde kullanılan som altın külçe.' },
];

export function GamePage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<PlayerProfile | null>(null);

  // Oyun Durumları
  const [activeMode, setActiveMode] = useState<'match' | 'corridor' | 'online' | 'test'>('match');
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [charPickerOpen, setCharPickerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EquipItem | null>(DEFAULT_EQUIPMENT[0]);
  const [activeModelKey, setActiveModelKey] = useState<'warrior' | 'ninja'>('warrior');
  const [modeNotice, setModeNotice] = useState<string | null>(null);

  // Three.js ve Animasyon referansları
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const actorGroupRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // 3rd Person View & WASD Hareket State'leri
  const keysPressed = useRef<{ w: boolean; a: boolean; s: boolean; d: boolean; shift: boolean }>({
    w: false,
    a: false,
    s: false,
    d: false,
    shift: false,
  });

  const actorPos = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const actorAngle = useRef<number>(0);
  const camAngleH = useRef<number>(0); // Yatay kamera açısı
  const camAngleV = useRef<number>(0.28); // Dikey kamera açısı (radyan)
  const camDistance = useRef<number>(4.2); // Kamera mesafesi
  const isDragging = useRef<boolean>(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Giriş yapmış kullanıcıyı yükle
  useEffect(() => {
    document.title = 'KALE2 — 3D Savaş Arenası';

    try {
      const saved = localStorage.getItem('kale2_player_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) {
          setPlayer(parsed);
          if (parsed.specialty === 'yakin' || parsed.specialty === 'uzak') {
            setActiveModelKey('ninja');
          }
        }
      }
    } catch {}
  }, []);

  // Three.js Sahnesi Kurulumu
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1ede4);
    scene.fog = new THREE.FogExp2(0xf1ede4, 0.04);

    // 2. Camera (3rd Person)
    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      100,
    );
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // 4. Işıklar
    const hemiLight = new THREE.HemisphereLight(0xfffaed, 0xd4cebf, 1.8);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff5dd, 2.6);
    sunLight.position.set(5, 12, 7);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 30;
    sunLight.shadow.camera.left = -6;
    sunLight.shadow.camera.right = 6;
    sunLight.shadow.camera.top = 6;
    sunLight.shadow.camera.bottom = -6;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xdde8f5, 1.2);
    fillLight.position.set(-6, 6, -5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffe2c0, 1.0);
    rimLight.position.set(0, 4, -8);
    scene.add(rimLight);

    // 5. Zemin & Platform (Görseldeki gibi açık bej studio zemin ve çizgili platform)
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xf1ede4,
      roughness: 0.9,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Karakter altı platform karesi çizgileri (Görseldeki beyaz/gri platform çizgisi)
    const platformSize = 2.4;
    const boxPts = [
      new THREE.Vector3(-platformSize, 0.015, -platformSize),
      new THREE.Vector3(platformSize, 0.015, -platformSize),
      new THREE.Vector3(platformSize, 0.015, platformSize),
      new THREE.Vector3(-platformSize, 0.015, platformSize),
      new THREE.Vector3(-platformSize, 0.015, -platformSize),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(boxPts);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x8a8275,
      transparent: true,
      opacity: 0.5,
    });
    const platformLine = new THREE.Line(lineGeo, lineMat);
    scene.add(platformLine);

    // İç kare çizgi
    const innerSize = 2.0;
    const innerPts = [
      new THREE.Vector3(-innerSize, 0.016, -innerSize),
      new THREE.Vector3(innerSize, 0.016, -innerSize),
      new THREE.Vector3(innerSize, 0.016, innerSize),
      new THREE.Vector3(-innerSize, 0.016, innerSize),
      new THREE.Vector3(-innerSize, 0.016, -innerSize),
    ];
    const innerGeo = new THREE.BufferGeometry().setFromPoints(innerPts);
    const innerLine = new THREE.Line(innerGeo, new THREE.LineBasicMaterial({ color: 0xb5ac9e, transparent: true, opacity: 0.4 }));
    scene.add(innerLine);

    // 6. Karakter Grubu
    const actorGroup = new THREE.Group();
    scene.add(actorGroup);
    actorGroupRef.current = actorGroup;

    // 7. Model Yükleyici
    const loader = new GLTFLoader();
    const modelPath =
      activeModelKey === 'ninja' ? '/assets/models/ninja.glb' : '/assets/models/warrior.glb';

    loader.load(
      modelPath,
      (gltf) => {
        // Önceki çocukları temizle
        while (actorGroup.children.length > 0) {
          actorGroup.remove(actorGroup.children[0]);
        }

        const model = gltf.scene;

        // Bounding box hesapla ve orantıla
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const targetHeight = 1.9; // Metin2 karakter yüksekliği
        const scale = targetHeight / Math.max(size.y, 0.001);
        model.scale.setScalar(scale);

        // Ayak tabanını tam y=0 zeminine oturt
        model.position.x = -center.x * scale;
        model.position.y = -box.min.y * scale;
        model.position.z = -center.z * scale;

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (mesh.material) {
              const mat = mesh.material as THREE.MeshStandardMaterial;
              mat.roughness = Math.max(mat.roughness || 0.5, 0.35);
              mat.metalness = Math.min(mat.metalness || 0.1, 0.4);
            }
          }
        });

        actorGroup.add(model);

        // Animasyonlar
        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;
        const actions: Record<string, THREE.AnimationAction> = {};

        gltf.animations.forEach((clip) => {
          const action = mixer.clipAction(clip);
          const isAttack =
            clip.name.includes('sword') || clip.name.includes('bow') || clip.name.includes('ATTACK');
          if (isAttack) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = false;
          } else {
            action.setLoop(THREE.LoopRepeat, Infinity);
          }
          actions[clip.name] = action;
        });

        actionsRef.current = actions;

        // Başlangıç animasyonu (wait / idle)
        const idleClipName = actions['wait'] ? 'wait' : actions['WAIT'] ? 'WAIT' : Object.keys(actions)[0];
        if (idleClipName && actions[idleClipName]) {
          actions[idleClipName].play();
          activeActionRef.current = actions[idleClipName];
        }
      },
      undefined,
      (err) => {
        console.error('Model yüklenemedi:', err);
      },
    );

    // 8. Fare Dinleyicileri (Drag Orbit)
    const onMouseDown = (e: MouseEvent) => {
      // Eğer modal veya UI üstündeyse sahneyi sürükleme
      if ((e.target as HTMLElement).closest('.game-modes-panel, .game-char-hud, .game-top-bar, .inventory-modal-overlay, .game-bottom-right')) {
        return;
      }
      isDragging.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      camAngleH.current -= dx * 0.007;
      camAngleV.current = Math.max(0.08, Math.min(Math.PI / 2.3, camAngleV.current - dy * 0.006));
    };

    const onMouseUp = () => {
      isDragging.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      camDistance.current = Math.max(2.2, Math.min(8.0, camDistance.current + e.deltaY * 0.004));
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel, { passive: true });

    // 9. Klavye Dinleyicileri (WASD & I & Space)
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') keysPressed.current.w = true;
      if (k === 's' || k === 'arrowdown') keysPressed.current.s = true;
      if (k === 'a' || k === 'arrowleft') keysPressed.current.a = true;
      if (k === 'd' || k === 'arrowright') keysPressed.current.d = true;
      if (e.shiftKey) keysPressed.current.shift = true;

      // 'I' tuşu ile Envanter aç/kapa
      if (k === 'i') {
        setInventoryOpen((prev) => !prev);
      }

      // 'Space' tuşu ile Saldırı yap
      if (k === ' ') {
        e.preventDefault();
        performAttack();
      }

      // 'Escape' ile pencereleri kapat
      if (k === 'escape') {
        setInventoryOpen(false);
        setCharPickerOpen(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') keysPressed.current.w = false;
      if (k === 's' || k === 'arrowdown') keysPressed.current.s = false;
      if (k === 'a' || k === 'arrowleft') keysPressed.current.a = false;
      if (k === 'd' || k === 'arrowright') keysPressed.current.d = false;
      if (!e.shiftKey) keysPressed.current.shift = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Saldırı Animasyonu Tetikleyici
    const performAttack = () => {
      const actions = actionsRef.current;
      const attackName = actions['onehand_sword']
        ? 'onehand_sword'
        : actions['twohand_sword']
          ? 'twohand_sword'
          : actions['NORMAL_ATTACK']
            ? 'NORMAL_ATTACK'
            : actions['dualhand_sword']
              ? 'dualhand_sword'
              : null;

      if (attackName && actions[attackName]) {
        const attackAction = actions[attackName];
        attackAction.reset();
        attackAction.fadeIn(0.1);
        attackAction.play();

        setTimeout(() => {
          attackAction.fadeOut(0.2);
          const idleAction = actions['wait'] || actions['WAIT'];
          if (idleAction) {
            idleAction.reset();
            idleAction.fadeIn(0.2);
            idleAction.play();
          }
        }, 850);
      }
    };

    // 10. Resize
    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // 11. Render Döngüsü (Animation Loop)
    const clock = new THREE.Clock();
    let animId = 0;

    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);
      const delta = clock.getDelta();

      // Animasyon mikserini güncelle
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      // WASD Hareket Mantığı
      const { w, s, a, d, shift } = keysPressed.current;
      const isMoving = w || s || a || d;

      if (isMoving) {
        const speed = shift ? 4.2 * delta : 2.5 * delta;

        // Kameranın yatay açısına göre hareket vektörü hesapla
        let moveX = 0;
        let moveZ = 0;

        if (w) {
          moveX -= Math.sin(camAngleH.current);
          moveZ -= Math.cos(camAngleH.current);
        }
        if (s) {
          moveX += Math.sin(camAngleH.current);
          moveZ += Math.cos(camAngleH.current);
        }
        if (a) {
          moveX -= Math.cos(camAngleH.current);
          moveZ += Math.sin(camAngleH.current);
        }
        if (d) {
          moveX += Math.cos(camAngleH.current);
          moveZ -= Math.sin(camAngleH.current);
        }

        const len = Math.hypot(moveX, moveZ);
        if (len > 0.001) {
          moveX = (moveX / len) * speed;
          moveZ = (moveZ / len) * speed;

          actorPos.current.x += moveX;
          actorPos.current.z += moveZ;

          // Karakterin baktığı açıyı hareket yönüne yumuşakça çevir
          const targetAngle = Math.atan2(moveX, moveZ);
          actorAngle.current = THREE.MathUtils.lerp(actorAngle.current, targetAngle, 0.18);
        }
      }

      // Karakter grubunun pozisyon ve rotasyonunu güncelle
      if (actorGroupRef.current) {
        actorGroupRef.current.position.copy(actorPos.current);
        actorGroupRef.current.rotation.y = actorAngle.current;
      }

      // Platform çizgisini karakterin hemen altında tut
      platformLine.position.x = actorPos.current.x;
      platformLine.position.z = actorPos.current.z;
      innerLine.position.x = actorPos.current.x;
      innerLine.position.z = actorPos.current.z;

      // 3rd Person Takip Kamerası Hesaplama
      // Karakterin arkasından ve açısına göre pozisyonlanır
      const r = camDistance.current;
      const cx = actorPos.current.x + r * Math.sin(camAngleH.current) * Math.cos(camAngleV.current);
      const cy = actorPos.current.y + r * Math.sin(camAngleV.current) + 0.5;
      const cz = actorPos.current.z + r * Math.cos(camAngleH.current) * Math.cos(camAngleV.current);

      camera.position.set(cx, cy, cz);
      camera.lookAt(actorPos.current.x, actorPos.current.y + 1.15, actorPos.current.z);

      renderer.render(scene, camera);
    };

    renderLoop();

    // Cleanup
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [activeModelKey]);

  const handleModeClick = (mode: 'match' | 'corridor' | 'online' | 'test', label: string) => {
    setActiveMode(mode);
    setModeNotice(`[${label}] Modu seçildi! Eşleşme veya sunucu bağlantı hazırlığı başlatılıyor...`);
    setTimeout(() => setModeNotice(null), 3500);
  };

  const username = player?.username || 'Savaşçı (Misafir)';
  const specialtyLabel =
    player?.specialty === 'bedensel'
      ? 'Bedensel Savaşçı'
      : player?.specialty === 'zihinsel'
        ? 'Zihinsel Savaşçı'
        : player?.specialty === 'yakin'
          ? 'Yakın Dövüş Ninja'
          : player?.specialty === 'uzak'
            ? 'Uzak Dövüş Ninja'
            : activeModelKey === 'warrior'
              ? 'Savaşçı (Sv. 15)'
              : 'Ninja (Sv. 15)';

  return (
    <div className="game-viewport-root">
      {/* 3D Three.js Sahnesi */}
      <div ref={mountRef} className="game-canvas-container" tabIndex={0} />

      {/* Üst Bar */}
      <header className="game-top-bar">
        <div className="game-brand-group">
          <Link to="/" className="game-brand-link">
            KALE<span>2</span>
          </Link>
          <Link to="/" className="back-to-web-btn">
            ← Web Sitesine Dön
          </Link>
          <Link to="/profil" className="back-to-web-btn">
            Geri Bildirim / Profil
          </Link>
        </div>

        <div className="game-top-right">
          <span>İKİ KARAKTER MEVCUT</span>
          <button
            type="button"
            className="game-top-btn"
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              } else {
                document.exitFullscreen().catch(() => {});
              }
            }}
          >
            TAM EKRAN (F11)
          </button>
        </div>
      </header>

      {/* Sol Taraf: Karakter Durum Kartı (HUD) */}
      <div className="game-char-hud">
        <div className="hud-profile-card">
          <div className="hud-char-title">
            <span className="hud-char-name">{username}</span>
            <span className="hud-char-level">SV. 15</span>
          </div>
          <span className="hud-char-spec">{specialtyLabel}</span>

          <div className="hud-bar-group">
            <div className="hud-bar-row">
              <span className="hud-bar-label">HP</span>
              <div className="hud-bar-track">
                <div className="hud-bar-fill hp" />
              </div>
              <span className="hud-bar-val">2.850 / 2.850</span>
            </div>
            <div className="hud-bar-row">
              <span className="hud-bar-label">SP</span>
              <div className="hud-bar-track">
                <div className="hud-bar-fill sp" />
              </div>
              <span className="hud-bar-val">740 / 870</span>
            </div>
          </div>

          <div className="hud-actions-row">
            <button
              type="button"
              className="hud-btn"
              onClick={() => setInventoryOpen(true)}
            >
              🎒 ENVANTER (I)
            </button>
            <button
              type="button"
              className="hud-btn secondary"
              onClick={() => setCharPickerOpen(true)}
            >
              KARAKTER
            </button>
          </div>
        </div>
      </div>

      {/* Sağ Taraf: Mod Seçim Menüsü (Görseldeki gibi) */}
      <nav className="game-modes-panel" aria-label="Oyun Modları">
        <button
          type="button"
          className={`game-mode-card ${activeMode === 'match' ? 'active' : ''}`}
          onClick={() => handleModeClick('match', 'MAÇ')}
        >
          <strong>MAÇ</strong>
          <small>BOTLU MOBA</small>
        </button>

        <button
          type="button"
          className={`game-mode-card ${activeMode === 'corridor' ? 'active' : ''}`}
          onClick={() => handleModeClick('corridor', 'KORİDOR')}
        >
          <strong>KORİDOR</strong>
          <small>1V1 TEK KORİDOR</small>
        </button>

        <button
          type="button"
          className={`game-mode-card ${activeMode === 'online' ? 'active' : ''}`}
          onClick={() => handleModeClick('online', 'ÇEVRİMİÇİ')}
        >
          <strong>ÇEVRİMİÇİ</strong>
          <small>GERÇEK OYUNCULAR</small>
        </button>

        <button
          type="button"
          className={`game-mode-card ${activeMode === 'test' ? 'active' : ''}`}
          onClick={() => handleModeClick('test', 'TEST ALANI')}
        >
          <strong>TEST ALANI</strong>
          <small>HARNESS & ALGORİTMA</small>
        </button>
      </nav>

      {/* Sağ Altta: Karakter Seç Butonu (Görseldeki gibi) */}
      <div className="game-bottom-right">
        <button
          type="button"
          className="character-select-btn"
          onClick={() => setCharPickerOpen(true)}
        >
          YENİ KARAKTER
        </button>
      </div>

      {/* Alt Kontrol İpucu Şeridi (Görseldeki gibi) */}
      <footer className="game-controls-bar">
        <span><b className="control-key">W</b> <b className="control-key">A</b> <b className="control-key">S</b> <b className="control-key">D</b> HAREKET</span>
        <span className="control-sep">·</span>
        <span><b className="control-key">BOŞLUK</b> SALDIRI TESTİ</span>
        <span className="control-sep">·</span>
        <span><b className="control-key">I</b> ENVANTER</span>
        <span className="control-sep">·</span>
        <span>SÜRÜKLE: DÖNDÜR</span>
        <span className="control-sep">·</span>
        <span>ENTER: GİR</span>
      </footer>

      {/* Mod Bildirimi Toast */}
      {modeNotice && (
        <div
          style={{
            position: 'absolute',
            top: '75px',
            right: '240px',
            background: 'rgba(26, 24, 21, 0.95)',
            border: '1px solid #d4b47c',
            color: '#eae6da',
            padding: '12px 20px',
            borderRadius: '4px',
            fontSize: '13px',
            zIndex: 100,
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
            maxWidth: '360px',
          }}
        >
          {modeNotice}
        </div>
      )}

      {/* METIN2 KLASİK ENVANTER MODAL PENCERESİ */}
      {inventoryOpen && (
        <div
          className="inventory-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInventoryOpen(false);
          }}
        >
          <div className="inventory-window">
            <div className="inventory-header">
              <h3>ENVANTER & TEÇHİZAT</h3>
              <button
                type="button"
                className="inventory-close-btn"
                onClick={() => setInventoryOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="inventory-body">
              {/* 8'li Teçhizat Slotları */}
              <div className="equipment-layout">
                {DEFAULT_EQUIPMENT.map((item) => (
                  <div
                    key={item.id}
                    className={`equip-slot ${item.id === 'weapon' ? 'weapon' : item.id === 'armor' ? 'armor' : ''}`}
                    onClick={() => setSelectedItem(item)}
                    title={item.name}
                  >
                    <span className="slot-icon">{item.icon}</span>
                    <span className="slot-name">{item.slot}</span>
                  </div>
                ))}
              </div>

              {/* 5x4 Envanter Izgarası */}
              <div className="inventory-grid">
                {INVENTORY_ITEMS.map((item) => (
                  <div
                    key={item.id}
                    className="inv-cell"
                    onClick={() =>
                      setSelectedItem({
                        id: item.id,
                        name: item.name,
                        icon: item.icon,
                        slot: 'Eşya',
                        stats: item.stats,
                        desc: item.desc,
                      })
                    }
                  >
                    <span style={{ color: item.color }}>{item.icon}</span>
                    {item.count > 1 && <span className="inv-cell-count">{item.count}</span>}
                  </div>
                ))}
                {/* Boş Slotlar */}
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={`empty-${i}`} className="inv-cell" />
                ))}
              </div>

              {/* Yang ve Alt Bilgi */}
              <div className="inventory-footer">
                <span>YANG:</span>
                <span className="yang-display">💰 4.850.000 Yang</span>
              </div>

              {/* Tıklanan Eşya Tooltip Kutusu */}
              {selectedItem && (
                <div className="item-tooltip-box">
                  <div className="tooltip-title">{selectedItem.name}</div>
                  {selectedItem.stats.map((st, idx) => (
                    <div key={idx} className="tooltip-stat">
                      • {st}
                    </div>
                  ))}
                  <div className="tooltip-desc">{selectedItem.desc}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KARAKTER DEĞİŞTİRME MODAL */}
      {charPickerOpen && (
        <div
          className="inventory-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCharPickerOpen(false);
          }}
        >
          <div className="char-picker-modal">
            <h3>KARAKTERİNİ SEÇ</h3>
            <div className="char-card-options">
              <div
                className={`char-option-card ${activeModelKey === 'warrior' ? 'selected' : ''}`}
                onClick={() => {
                  setActiveModelKey('warrior');
                  setCharPickerOpen(false);
                }}
              >
                <strong>SAVAŞÇI</strong>
                <small>Ön cephe, kılıç ve ağır zırh</small>
              </div>

              <div
                className={`char-option-card ${activeModelKey === 'ninja' ? 'selected' : ''}`}
                onClick={() => {
                  setActiveModelKey('ninja');
                  setCharPickerOpen(false);
                }}
              >
                <strong>NİNJA</strong>
                <small>Gölgeler, hançer ve ok menzili</small>
              </div>
            </div>

            <button
              type="button"
              className="button button-ghost"
              style={{ width: '100%' }}
              onClick={() => setCharPickerOpen(false)}
            >
              KAPAT
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
