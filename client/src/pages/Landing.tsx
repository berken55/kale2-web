import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { HERO_VIDEO_SRC } from '../heroVideo';
import { Hero3DViewer } from '../components/Hero3DViewer';
import type { LeaderboardEntry } from '@shared/types';
import '../marketing.css';

/* Karakter verileri */
interface CharacterData {
  name: string;
  role: string;
  description: string;
  paths: string[];
  image: string;
  alt: string;
  label: string;
  letter: string;
}

const CHARACTERS: Record<'warrior' | 'ninja', CharacterData> = {
  warrior: {
    name: 'SAVAŞÇI',
    role: 'ÖN CEPHENİN SARSILMAZ GÜCÜ',
    description: 'İlk adımı sen at. Rakibin hattını kır, takımına alan aç. Gücünü bedensel baskıyla mı, zihinsel savunmayla mı göstereceksin?',
    paths: ['BEDENSEL', 'ZİHİNSEL'],
    image: '/assets/campaign/warrior.webp',
    alt: 'Savaşçı karakter konsepti',
    label: 'SAVAŞÇI / KARAKTER KONSEPTİ',
    letter: 'S',
  },
  ninja: {
    name: 'NİNJA',
    role: 'GÖLGELERDEKİ SON HAMLE',
    description: 'Yüksekten gözetle. Açık veren rakibi yakala. Yakın dövüşte pusunu kur ya da yayını kuşanıp mesafeyi kendi lehine kullan.',
    paths: ['YAKIN DÖVÜŞ', 'UZAK DÖVÜŞ'],
    image: '/assets/campaign/ninja.webp',
    alt: 'Oyun içindeki ninja karakteri',
    label: 'NİNJA / OYUN İÇİ KARAKTER',
    letter: 'N',
  },
};

/* Uzmanlık verileri */
interface SpecialtyData {
  role: string;
  title: string;
  description: string;
  traits: string[];
  counter: string;
  skills: [string, string][];
}

const SPECIALTIES: Record<string, SpecialtyData> = {
  bedensel: {
    role: 'SAVAŞÇI / BASKI VE TAKİP',
    title: 'CEPHEYİ YAR.',
    description: 'Dövüşün ritmini ele geçir. Yakın mesafede baskıyı sürdür, kaçmaya çalışan rakibe nefes aldırma.',
    traits: ['Yakın dövüş', 'Sürekli baskı', 'Kovalama'],
    counter: 'Rakibinin fırsatı: Hamleni boşa çıkarıp mesafeyi açmak.',
    skills: [
      ['Üç Yönlü Kesme', 'Önündeki alana art arda kesikler. Rakibin kaçış yönünü önceden oku.'],
      ['Kılıç Çevirme', 'Çevrendeki rakiplere alan baskısı. Bir araya geldikleri anı bekle.'],
      ['Hamle', 'Seçtiğin rakiple aranı kapat. Takımın hazırken çatışmayı başlat.'],
      ['Hava Kılıcı', 'Saldırılarını güçlendiren bir pencere. Baskın öncesi doğru anı seç.'],
      ['Öfke', 'Saldırı ve hareket temposunu yükselt. Geri çekilen rakibi zorla.'],
    ],
  },
  zihinsel: {
    role: 'SAVAŞÇI / SAVUNMA VE ALAN KONTROLÜ',
    title: 'HATTI TUT.',
    description: 'Takımının önünde dur. Savunmanla zaman kazan; mesafeli yeteneklerinle rakibin rahatça ilerlemesini engelle.',
    traits: ['Yüksek savunma', 'Menzilli yetenek', 'Takım koruma'],
    counter: 'Rakibinin fırsatı: Güçlü yeteneğini boşa harcatmak ve uzun normal vuruş mücadelesine zorlamak.',
    skills: [
      ['Güçlü Beden', 'Savunmanı yükseltip takımına hareket alanı aç.'],
      ['Ruh Vuruşu', 'Önündeki hatta uzanan güçlü bir saldırı. Rakibin yönünü tahmin et.'],
      ['Şiddetli Vuruş', 'Mesafeli bir darbe ile rakibin ilerleyişini baskıla.'],
      ['Kılıç Darbesi', 'Hedefin üzerinde kontrol kurmaya yönelik bir saldırı fırsatı.'],
      ['Yere Vurma', 'Yakın çevrendeki baskını dağıt; dostlarının çıkışına alan bırak.'],
    ],
  },
  yakin: {
    role: 'NİNJA / PUSU VE ANİ BASKI',
    title: 'AÇIĞI YAKALA.',
    description: 'Sabırlı ol. Hedefini takip et. Takımından uzaklaşan rakibe, en beklemediği anda yaklaş.',
    traits: ['Hançer', 'Pusu', 'Ani saldırı'],
    counter: 'Rakibinin fırsatı: Girişinden sonra kaçış yolunu kapatmak. Uzun süre açıkta kalma.',
    skills: [
      ['Pusu', 'Doğru yaklaşma açısını bulduğunda sert bir yakın saldırı yap.'],
      ['Hızlı Saldırı', 'Aradaki boşluğu kapatıp açık veren hedefe yüklen.'],
      ['Bıçak Çevirme', 'Yakınındaki mücadelede hareket ve saldırıyı bir araya getir.'],
      ['Gölge Adımı', 'Zamanlamanla tehlikeden sıyrıl veya yeni bir saldırı açısı yakala.'],
      ['Zehirli Darbe', 'Kaçan rakip üzerinde baskıyı sürdürmeye yönelik bir vuruş.'],
    ],
  },
  uzak: {
    role: 'NİNJA / GÖRÜŞ VE MESAFE',
    title: 'MESAFE SENİN.',
    description: 'Patikadan yüksel. Savaş alanını gözle. Yayınla baskı kurarken rakibin sana ulaşacağı yolu da hesaba kat.',
    traits: ['Yay', 'Gözetleme', 'Menzilli baskı'],
    counter: 'Rakibinin fırsatı: Menzilinden çıkmak veya patikayı kullanıp yakına girmek.',
    skills: [
      ['Tekrarlanan Atış', 'Aynı hedef üzerinde ok baskısı kur. Mesafeyi kaybetme.'],
      ['Ok Yağmuru', 'Bir alana baskı uygulayarak rakibin hareketini zorla.'],
      ['Alevli Ok', 'Doğru anda kullanacağın güçlü bir atış penceresi.'],
      ['Yavaşlatan Ok', 'Kaçan hedefin peşine takımının yetişmesine yardımcı ol.'],
      ['Hafif Adım', 'Konumunu değiştir; mesafeyi yeniden kur veya avını takip et.'],
    ],
  },
};

const SPECIALTY_KEYS = ['bedensel', 'zihinsel', 'yakin', 'uzak'] as const;

/* Galeri verileri */
const GALLERY_ITEMS = [
  { image: '/assets/campaign/castle.webp', caption: '01 / KALE KAPILARINDA — OYUN İÇİ GÖRÜNTÜ' },
  { image: '/assets/campaign/ui-character-select.jpg', caption: '02 / KARAKTERİNİ SEÇ & OYUN MODLARI — OYUN İÇİ ARAYÜZ' },
  { image: '/assets/campaign/ui-power-select.jpg', caption: '03 / ÖZEL GÜÇ SEÇİMİ (10. SEVİYE ÖDÜLÜ) — OYUN İÇİ ARAYÜZ' },
  { image: '/assets/campaign/battle.webp', caption: '04 / CEPHEYE DOĞRU — OYUN İÇİ GÖRÜNTÜ' },
  { image: '/assets/campaign/night.webp', caption: '05 / GECE NÖBETİ — OYUN İÇİ GÖRÜNTÜ' },
  { image: '/assets/campaign/world.webp', caption: '06 / SAVAŞ ALANI — KONSEPT HARİTA' },
  { image: '/assets/campaign/sunset.webp', caption: '07 / SAVAŞ ALANI — GÜN BATIMI' },
  { image: '/assets/campaign/hero.webp', caption: '08 / KALE2 EVRENİ — KONSEPT GÖRSEL' },
  { image: '/assets/campaign/warrior.webp', caption: '09 / SAVAŞÇI — KARAKTER KONSEPTİ' },
  { image: '/assets/campaign/ninja.webp', caption: '10 / NİNJA — OYUN İÇİ KARAKTER' },
];

const STORAGE_KEY = 'kale2-demo-application-v1';

export function LandingPage() {
  /* Mobil menü durumu */
  const [menuOpen, setMenuOpen] = useState(false);

  /* Karakter sekmesi durumu */
  const [characterKey, setCharacterKey] = useState<'warrior' | 'ninja'>('warrior');
  const character = CHARACTERS[characterKey];

  /* Uzmanlık sekmesi durumu */
  const [specialtyKey, setSpecialtyKey] = useState<string>('bedensel');
  const specialty = SPECIALTIES[specialtyKey];

  /* Ganimet / sandık taşıyıcı simülasyonu */
  const [chestRunning, setChestRunning] = useState(false);
  const [chestSeconds, setChestSeconds] = useState(60);
  const chestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Galeri Lightbox */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  /* Video oynatıcı durumu (BİR MAÇ. BİN İHTİMAL. altındaki video) */
  const trailerVideoRef = useRef<HTMLVideoElement>(null);
  const [trailerPlaying, setTrailerPlaying] = useState(true);
  const [trailerMuted, setTrailerMuted] = useState(true);
  const [trailerProgress, setTrailerProgress] = useState(0);

  /* Topluluk Dialogu */
  const [communityOpen, setCommunityOpen] = useState(false);

  /* Oyuncu Üyelik / Kayıt durumu */
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formSpecialty, setFormSpecialty] = useState('kararsiz');
  const [acknowledge, setAcknowledge] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [registeredAccount, setRegisteredAccount] = useState<{
    id: number;
    username: string;
    email: string;
    specialty: string;
    createdAt: string;
  } | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  /* Sayfa başlığı, kayıtlı oyuncu sayısı ve hesap geri yükleme */
  useEffect(() => {
    document.title = 'KALE2 — Zaferin bir bedeli var.';

    // Kayıtlı oyuncu sayısı istatistiğini çek
    fetch('/api/public/accounts/stats')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.totalPlayers === 'number') {
          setTotalPlayers(data.totalPlayers);
        }
      })
      .catch(() => {});

    // Canlı liderlik tablosunu çek
    fetch('/api/public/leaderboard?limit=10')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setLeaderboard(data);
        }
      })
      .catch(() => {})
      .finally(() => setLeaderboardLoading(false));

    // Bu tarayıcıda daha önce açılmış hesap varsa yükle
    try {
      const saved = localStorage.getItem('kale2_registered_account');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.username === 'string') {
          setRegisteredAccount(parsed);
        }
      }
    } catch {
      // LocalStorage kısıtlı olabilir
    }
  }, []);

  /* Dialog açıldığında body scrollunu engelle */
  useEffect(() => {
    const hasModal = lightboxIndex !== null || communityOpen;
    if (hasModal) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => document.body.classList.remove('modal-open');
  }, [lightboxIndex, communityOpen]);

  /* Klavye kısayolları (Escape ve Ok tuşları) */
  useEffect(() => {
    if (lightboxIndex === null && !communityOpen) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
        setCommunityOpen(false);
      } else if (lightboxIndex !== null && e.key === 'ArrowRight') {
        setLightboxIndex((prev) =>
          prev !== null ? (prev + 1) % GALLERY_ITEMS.length : null,
        );
      } else if (lightboxIndex !== null && e.key === 'ArrowLeft') {
        setLightboxIndex((prev) =>
          prev !== null
            ? (prev - 1 + GALLERY_ITEMS.length) % GALLERY_ITEMS.length
            : null,
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, communityOpen]);

  /* Ganimet zamanlayıcısı */
  const toggleChestDemo = () => {
    if (chestRunning || chestSeconds < 60) {
      if (chestTimerRef.current) clearInterval(chestTimerRef.current);
      chestTimerRef.current = null;
      setChestRunning(false);
      setChestSeconds(60);
      return;
    }
    setChestRunning(true);
    setChestSeconds(60);
    const deadline = Date.now() + 60000;
    chestTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setChestSeconds(remaining);
      if (remaining === 0) {
        if (chestTimerRef.current) clearInterval(chestTimerRef.current);
        chestTimerRef.current = null;
        setChestRunning(false);
      }
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (chestTimerRef.current) clearInterval(chestTimerRef.current);
    };
  }, []);

  /* Fragman Video Kontrolleri */
  const toggleTrailerPlay = () => {
    const el = trailerVideoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setTrailerPlaying(true);
    } else {
      el.pause();
      setTrailerPlaying(false);
    }
  };

  const toggleTrailerMute = () => {
    const el = trailerVideoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setTrailerMuted(el.muted);
  };

  const restartTrailer = () => {
    const el = trailerVideoRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(() => {});
    setTrailerPlaying(true);
  };

  const requestFullscreen = () => {
    const el = trailerVideoRef.current;
    if (!el) return;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if ((el as any).webkitRequestFullscreen) {
      (el as any).webkitRequestFullscreen();
    }
  };

  const handleTimeUpdate = () => {
    const el = trailerVideoRef.current;
    if (!el || !el.duration) return;
    setTrailerProgress((el.currentTime / el.duration) * 100);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = trailerVideoRef.current;
    if (!el || !el.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    el.currentTime = Math.max(0, Math.min(pos * el.duration, el.duration));
  };

  /* Klavye Gezinmesi */
  const handleCharacterKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      setCharacterKey((prev) => (prev === 'warrior' ? 'ninja' : 'warrior'));
    }
  };

  const handleSpecialtyKey = (e: KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      const next = (index + 1) % SPECIALTY_KEYS.length;
      setSpecialtyKey(SPECIALTY_KEYS[next]);
    } else if (e.key === 'ArrowLeft') {
      const prev = (index - 1 + SPECIALTY_KEYS.length) % SPECIALTY_KEYS.length;
      setSpecialtyKey(SPECIALTY_KEYS[prev]);
    } else if (e.key === 'Home') {
      setSpecialtyKey(SPECIALTY_KEYS[0]);
    } else if (e.key === 'End') {
      setSpecialtyKey(SPECIALTY_KEYS[SPECIALTY_KEYS.length - 1]);
    }
  };

  /* Oyuncu Kayıt Gönderimi */
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    if (cleanUsername.length < 3 || cleanUsername.length > 24) {
      setFormError('Oyuncu adı 3-24 karakter uzunluğunda olmalıdır.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setFormError('Oyuncu adı yalnızca harf, rakam ve alt çizgi içerebilir.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Geçerli bir e-posta adresi giriniz.');
      return;
    }
    if (password.length < 6) {
      setFormError('Şifreniz en az 6 karakter olmalıdır.');
      return;
    }
    if (password !== passwordConfirm) {
      setFormError('Girdiğiniz şifreler birbiriyle eşleşmiyor.');
      return;
    }
    if (!acknowledge) {
      setFormError('Lütfen kayıt koşullarını onaylayınız.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUsername,
          email: cleanEmail,
          password,
          specialty: formSpecialty || 'kararsiz',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Kayıt sırasında bir hata oluştu.');
      }

      setRegisteredAccount(data.account);
      setPassword('');
      setPasswordConfirm('');
      try {
        localStorage.setItem('kale2_registered_account', JSON.stringify(data.account));
      } catch {}

      setTotalPlayers((prev) => (prev !== null ? prev + 1 : 1));
    } catch (err: any) {
      setFormError(err.message || 'Sunucuya bağlanılamadı. Lütfen tekrar deneyiniz.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="landing-campaign">
      <a className="skip-link" href="#main">
        İçeriğe geç
      </a>

      {/* Üst Başlık (Header) */}
      <header className="header" id="top">
        <a href="#" className="wordmark" aria-label="KALE2 ana sayfa">
          KALE<span>2</span>
          <i aria-hidden="true">◆</i>
        </a>
        <nav
          className={`navigation ${menuOpen ? 'open' : ''}`}
          id="navigation"
          aria-label="Ana menü"
        >
          <a href="#savas" onClick={() => setMenuOpen(false)}>
            Oyun
          </a>
          <a href="#fragman" onClick={() => setMenuOpen(false)}>
            Fragman
          </a>
          <a href="#sistemler" onClick={() => setMenuOpen(false)}>
            Sistemler
          </a>
          <a href="#karakterler" onClick={() => setMenuOpen(false)}>
            Karakterler
          </a>
          <a href="#ganimet" onClick={() => setMenuOpen(false)}>
            Ganimet
          </a>
          <a href="#galeri" onClick={() => setMenuOpen(false)}>
            Dünyayı keşfet
          </a>
          <a href="#siralama" onClick={() => setMenuOpen(false)}>
            Sıralama
          </a>
          <Link to="/wiki" onClick={() => setMenuOpen(false)}>
            Wiki
          </Link>
        </nav>
        <a href="#gelecek" className="nav-cta">
          KAYIT OL <span aria-hidden="true">↗</span>
        </a>
        <button
          type="button"
          className="menu-toggle"
          aria-controls="navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Menüyü kapat' : 'Menüyü aç'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span />
          <span />
        </button>
      </header>

      <main id="main">
        {/* Hero Bölümü - Arkaplan Görseli (Eskiden olduğu gibi website tasarımı) */}
        <section className="hero" aria-labelledby="hero-title">
          <img
            className="hero-art"
            src="/assets/campaign/hero.webp"
            alt="Dağların ve kadim kalelerin önünde zırhlı fantastik savaşçılar"
            width={1672}
            height={941}
            fetchPriority="high"
          />
          <div className="hero-shade" />
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-content">
            <p className="eyebrow">
              <span className="live-dot" /> YENİ BİR REKABETİN EŞİĞİNDE
            </p>
            <h1 id="hero-title">
              ZAFERİN
              <br />
              BİR <em>BEDELİ</em>
              <br />
              VAR<span className="title-dot">.</span>
            </h1>
            <p className="hero-description">
              Ganimetin peşine düş. Takımını topla.
              <br />
              Son sözü rakibin kalesinde söyle.
            </p>
            <div className="hero-actions">
              <a className="button button-red" href="#gelecek">
                HESABINI OLUŞTUR / KAYIT OL <span aria-hidden="true">↗</span>
              </a>
              <a className="button button-ghost" href="#siralama">
                <span aria-hidden="true">🏆</span> SIRALAMA
              </a>
            </div>
          </div>
          {/* 3D Vahşi Uzman Canlı Sahne */}
          <div className="hero-3d-stage">
            <Hero3DViewer modelUrl="/assets/models/vahsi_uzman.glb" />
          </div>

          <div className="hero-aside">
            <span>
              DOĞU'NUN EFSANESİ.
              <br />
              YENİ BİR SAVAŞ.
            </span>
            <div className="vertical-line" />
            <span>01 / KALE2</span>
          </div>
          <div className="hero-footer">
            <a className="scroll-cue" href="#savas">
              <span aria-hidden="true">↓</span> DAHA DERİNE İN
            </a>
            <span className="concept-caption">KALE2 EVRENİ / KONSEPT GÖRSEL</span>
            <span className="development">
              <span className="live-dot" /> GELİŞTİRİLİYOR
            </span>
          </div>
        </section>

        {/* Bilgi Şeridi */}
        <div className="fact-strip" aria-label="Oyun hedefleri">
          <div>
            <strong>
              5<span>v</span>5
            </strong>
            <small>TAKIMINI TOPLA</small>
          </div>
          <span className="fact-divider">✦</span>
          <div>
            <strong>
              15–25 <span>DK</span>
            </strong>
            <small>HER AN BİR FIRSAT</small>
          </div>
          <span className="fact-divider">✦</span>
          <div>
            <strong>TEK KALE</strong>
            <small>TEK BÜYÜK HEDEF</small>
          </div>
          <p>
            FANTASTİK BİR DÜNYA.
            <br />
            <b>REKABETİN YENİ CEPHESİ.</b>
          </p>
        </div>

        {/* 01 / Savaşın Kuralları */}
        <section className="intro section-pad" id="savas">
          <div className="section-kicker">
            <span>01 / SAVAŞIN KURALLARI</span>
            <span>AKLINI DA KUŞAN.</span>
          </div>
          <div className="intro-heading">
            <h2>
              HER HAMLE
              <br />
              BİR <em>HİKÂYE.</em>
            </h2>
            <p>
              Bir an avcısın. Bir an av.
              <br />
              KALE2; kale kuşatmasını, karakter ustalığını ve ganimet heyecanını
              aynı savaş alanında buluşturmak için geliştiriliyor.
            </p>
          </div>
          <div className="story-grid">
            <article
              className="story story-large"
              role="button"
              tabIndex={0}
              style={{ cursor: 'zoom-in' }}
              onClick={() => setLightboxIndex(5)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLightboxIndex(5);
                }
              }}
            >
              <img
                src="/assets/campaign/battle.webp"
                alt="KALE2 koridorlarında takım savaşı hazırlığı"
                loading="lazy"
                width={1536}
                height={864}
              />
              <div className="story-overlay" />
              <span className="image-index">I</span>
              <div className="story-copy">
                <p className="eyebrow">TAKIMIN KADAR GÜÇLÜSÜN</p>
                <h3>
                  BEŞ KİŞİ.
                  <br />
                  TEK BİR AMAÇ.
                </h3>
                <p>
                  Koridoru it. Rakibi kıskaca al. Boss'a giden takımın boş
                  bıraktığı kuleye yüklen. Kaleyi alan, maçı alır.
                </p>
              </div>
            </article>
            <article
              className="story story-small"
              role="button"
              tabIndex={0}
              style={{ cursor: 'zoom-in' }}
              onClick={() => setLightboxIndex(6)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLightboxIndex(6);
                }
              }}
            >
              <img
                src="/assets/campaign/sunset.webp"
                alt="Gün batımında yüksek bir noktadan savaş alanını izleyen karakter"
                loading="lazy"
                width={1536}
                height={864}
              />
              <div className="story-overlay" />
              <span className="image-index">II</span>
              <div className="story-copy">
                <p className="eyebrow">DOĞRU YER. DOĞRU AN.</p>
                <h3>
                  AVLA.
                  <br />
                  YA DA SIYRIL.
                </h3>
                <p>
                  Bir pusu, kusursuz bir kaçış, son anda gelen bir dost. Savaşın
                  yönünü değiştiren o anı yakala.
                </p>
              </div>
            </article>
          </div>
        </section>

        {/* Video Bölümü — "BİR MAÇ. BİN İHTİMAL." */}
        <section className="trailer-section" id="fragman">
          <div className="section-pad" style={{ paddingBottom: '35px' }}>
            <div className="section-kicker">
              <span>RESMİ FRAGMAN / KALE2</span>
              <span>OYUN İÇİ GÖRÜNTÜLER</span>
            </div>
            <div className="gallery-heading">
              <h2>
                BİR MAÇ.
                <br />
                <em>BİN İHTİMAL.</em>
              </h2>
              <span>
                Avı başlatan sen ol.
                <br />
                Son hamleyi de sen yap.
              </span>
            </div>
          </div>

          {/* Tam Ekran / Fullscreen Video Alanı */}
          <div className="trailer-fs-stage">
            <video
              ref={trailerVideoRef}
              className="trailer-fs-video"
              src={HERO_VIDEO_SRC}
              poster="/assets/campaign/battle.webp"
              autoPlay
              muted={trailerMuted}
              loop
              playsInline
              preload="auto"
              onTimeUpdate={handleTimeUpdate}
            />
            <div className="trailer-fs-shade" />
            <div className="trailer-fs-grid" aria-hidden="true" />

            {/* Orta Oynat / Durdur Butonu */}
            <button
              type="button"
              className={`trailer-fs-center-btn ${!trailerPlaying ? 'is-paused' : ''}`}
              onClick={toggleTrailerPlay}
              aria-label={trailerPlaying ? 'Videoyu duraklat' : 'Videoyu oynat'}
            >
              <span>{trailerPlaying ? '⏸' : '▶'}</span>
            </button>

            {/* Alt Kontrol Barı (HUD) */}
            <div className="trailer-fs-hud">
              <div className="trailer-fs-info">
                <span className="live-dot" />
                <div>
                  <strong>SAVAŞIN İÇİNE GİR</strong>
                  <small>KALE2 RESMİ OYUN İÇİ FRAGMAN</small>
                </div>
              </div>

              <div className="trailer-fs-controls">
                <button
                  type="button"
                  className="trailer-hud-btn"
                  onClick={toggleTrailerPlay}
                >
                  {trailerPlaying ? '⏸ DURDUR' : '▶ OYNAT'}
                </button>
                <button
                  type="button"
                  className={`trailer-hud-btn ${!trailerMuted ? 'active-audio' : ''}`}
                  onClick={toggleTrailerMute}
                >
                  {trailerMuted ? '🔇 SESİ AÇ' : '🔊 SES AÇIK'}
                </button>
                <button
                  type="button"
                  className="trailer-hud-btn"
                  onClick={restartTrailer}
                >
                  ↺ BAŞTAN
                </button>
                <button
                  type="button"
                  className="trailer-hud-btn trailer-hud-primary"
                  onClick={requestFullscreen}
                >
                  ⛶ TAM EKRAN
                </button>
              </div>

              {/* İlerleme Çubuğu */}
              <div
                className="trailer-fs-progress-track"
                onClick={handleProgressClick}
                role="slider"
                aria-label="Video ilerleme çubuğu"
                aria-valuenow={Math.round(trailerProgress)}
                tabIndex={0}
              >
                <div
                  className="trailer-fs-progress-bar"
                  style={{ width: `${trailerProgress}%` }}
                />
              </div>
            </div>
          </div>

          <div className="section-pad" style={{ paddingTop: '25px', paddingBottom: '30px' }}>
            <div className="trailer-chapters">
              <span>01 / GÖZETLE</span>
              <span>02 / YAKALA</span>
              <span>03 / GANİMETİ KORU</span>
              <span>04 / KALEYİ AL</span>
            </div>
          </div>
        </section>

        {/* 02 / Oyun Sistemleri & Arayüz */}
        <section className="systems section-pad" id="sistemler">
          <div className="section-kicker">
            <span>02 / OYUN SİSTEMLERİ & ARAYÜZ</span>
            <span>GELİŞTİRME SÜRÜMÜNDEN KARELER</span>
          </div>
          <div className="systems-heading">
            <div>
              <p className="eyebrow">LOBİDEN CEPHEDEKİ ZAFERE</p>
              <h2>
                STRATEJİNİ KUR
                <br />
                <em>GÜCÜNÜ SEÇ.</em>
              </h2>
            </div>
            <p>
              Lobi ekranında karakterini ve oyun modunu belirle; maç içinde seviye atladıkça
              efsanevi ekipmanlar ve özel auralarla üstünlüğü ele geçir.
            </p>
          </div>

          <div className="systems-grid">
            {/* Kart 1: Karakter & Mod Seçimi */}
            <div
              className="system-card"
              role="button"
              tabIndex={0}
              onClick={() => setLightboxIndex(1)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLightboxIndex(1);
                }
              }}
            >
              <div className="system-preview">
                <img
                  src="/assets/campaign/ui-character-select.jpg"
                  alt="KALE2 Karakter ve Oyun Modu Seçim Arayüzü"
                  loading="lazy"
                  width={1536}
                  height={864}
                />
                <div className="system-overlay">
                  <span className="system-zoom-badge">BÜYÜTMEK İÇİN TIKLA ↗</span>
                </div>
              </div>
              <div className="system-body">
                <div className="system-tagline">
                  <span>01 / LOBİ & KARAKTER SEÇİMİ</span>
                  <span className="system-pill">4 SINIF · 4 MOD</span>
                </div>
                <h3>KARAKTERİNİ VE MODUNU SEÇ</h3>
                <p>
                  Savaşına yön verecek kahramanı seçip hemen cepheye atıl.
                </p>
                <div className="system-features">
                  <div className="system-feature-item">
                    <strong>Sınıflar:</strong>
                    <span>Savaşçı, Ninja, Şaman ve Sura</span>
                  </div>
                  <div className="system-feature-item">
                    <strong>Oyun Modları:</strong>
                    <span>Hızlı Test, Yapay Zekaya Karşı Bot Maçı, 1-1 Koridor Düellosu ve 5v5 Online Rekabet</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Kart 2: 10. Seviye Özel Güç Seçimi */}
            <div
              className="system-card"
              role="button"
              tabIndex={0}
              onClick={() => setLightboxIndex(2)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLightboxIndex(2);
                }
              }}
            >
              <div className="system-preview">
                <img
                  src="/assets/campaign/ui-power-select.jpg"
                  alt="KALE2 10. Seviye Özel Güç ve Ekipman Seçimi Arayüzü"
                  loading="lazy"
                  width={1536}
                  height={864}
                />
                <div className="system-overlay">
                  <span className="system-zoom-badge">BÜYÜTMEK İÇİN TIKLA ↗</span>
                </div>
              </div>
              <div className="system-body">
                <div className="system-tagline">
                  <span>02 / MAÇ İÇİ İLERLEME & ÖDÜL</span>
                  <span className="system-pill highlight">10. SEVİYE</span>
                </div>
                <h3>ÖZEL GÜÇ SEÇİMİ</h3>
                <p>
                  Seviye 10'a ulaştığında kendine en uygun ekipmanı seç ve efsanevi özel gücünü kuşan.
                </p>
                <div className="system-features">
                  <div className="system-feature-item">
                    <strong>Ay Işığı Kılıcı (Efsanevi):</strong>
                    <span>Saldırıda rakiplerin savunmasını düşüren Ay Işığı Aurası.</span>
                  </div>
                  <div className="system-feature-item">
                    <strong>Ejderha Zırhı (Efsanevi):</strong>
                    <span>Can %30 altına düştüğünde kritik hasar azaltımı.</span>
                  </div>
                  <div className="system-feature-item">
                    <strong>Kutsal Başlık (Efsanevi):</strong>
                    <span>Büyülerin bekleme süresinde %15 hızlandırma.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 03 / Karakterler */}
        <section className="characters section-pad" id="karakterler">
          <div className="section-kicker">
            <span>03 / TARZINI SEÇ</span>
            <span>İKİ KARAKTER. DÖRT YOL.</span>
          </div>
          <div className="character-layout">
            <div className="character-info">
              <h2>
                SAVAŞTA
                <br />
                <em>İZ BIRAK.</em>
              </h2>
              <div
                className="character-tabs"
                role="tablist"
                aria-label="Karakter seçimi"
              >
                <button
                  type="button"
                  id="tab-warrior"
                  role="tab"
                  aria-selected={characterKey === 'warrior'}
                  aria-controls="character-panel"
                  tabIndex={characterKey === 'warrior' ? 0 : -1}
                  onClick={() => setCharacterKey('warrior')}
                  onKeyDown={handleCharacterKey}
                >
                  01 <span>SAVAŞÇI</span>
                </button>
                <button
                  type="button"
                  id="tab-ninja"
                  role="tab"
                  aria-selected={characterKey === 'ninja'}
                  aria-controls="character-panel"
                  tabIndex={characterKey === 'ninja' ? 0 : -1}
                  onClick={() => setCharacterKey('ninja')}
                  onKeyDown={handleCharacterKey}
                >
                  02 <span>NİNJA</span>
                </button>
              </div>
              <div
                id="character-panel"
                role="tabpanel"
                aria-labelledby={`tab-${characterKey}`}
                tabIndex={0}
              >
                <p className="eyebrow" id="character-role">
                  {character.role}
                </p>
                <h3 id="character-name">{character.name}</h3>
                <p id="character-description">{character.description}</p>
                <div className="paths" id="character-paths">
                  {character.paths.map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </div>
                <p className="character-note">
                  Uzmanlığını maç başında seç.
                  <br />
                  Beş yeteneğini seviye kazandıkça aç.
                </p>
              </div>
            </div>
            <div
              className="character-visual"
              role="button"
              tabIndex={0}
              style={{ cursor: 'zoom-in' }}
              title="Karakter görselini büyütmek için tıkla"
              onClick={() => setLightboxIndex(characterKey === 'warrior' ? 8 : 9)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLightboxIndex(characterKey === 'warrior' ? 8 : 9);
                }
              }}
            >
              <div className="character-ring" aria-hidden="true" />
              <span
                className="giant-letter"
                aria-hidden="true"
                id="character-letter"
              >
                {character.letter}
              </span>
              <img
                id="character-image"
                src={character.image}
                width={640}
                height={900}
                alt={character.alt}
                loading="lazy"
                data-class={characterKey}
              />
              <span className="visual-label" id="character-image-label">
                {character.label}
              </span>
              <span className="visual-corner" aria-hidden="true">
                ✦
              </span>
            </div>
          </div>
        </section>

        {/* Uzmanlıklar */}
        <section className="specializations section-pad" id="uzmanliklar">
          <div className="section-kicker">
            <span>UZMANLIĞINI KEŞFET</span>
            <span>YETENEK İSİMLERİ VE ROLLERİ TANITIM TASLAĞIDIR</span>
          </div>
          <div className="intro-heading">
            <h2>
              AYNI CEPHE.
              <br />
              <em>BAŞKA BİR YOL.</em>
            </h2>
            <p>
              Maç başında yolunu seç. Takımının ihtiyacına cevap ver.
              <br />
              Aşağıdaki yetenek örnekleri taslak içeriktir; nihai oyun dengesi
              ve yetenekler değişebilir.
            </p>
          </div>
          <div className="specialty-tabs" role="tablist" aria-label="Uzmanlıklar">
            <button
              type="button"
              role="tab"
              id="spec-bedensel"
              aria-selected={specialtyKey === 'bedensel'}
              aria-controls="specialty-panel"
              tabIndex={specialtyKey === 'bedensel' ? 0 : -1}
              onClick={() => setSpecialtyKey('bedensel')}
              onKeyDown={(e) => handleSpecialtyKey(e, 0)}
            >
              01 <b>BEDENSEL</b>
              <small>SAVAŞÇI</small>
            </button>
            <button
              type="button"
              role="tab"
              id="spec-zihinsel"
              aria-selected={specialtyKey === 'zihinsel'}
              aria-controls="specialty-panel"
              tabIndex={specialtyKey === 'zihinsel' ? 0 : -1}
              onClick={() => setSpecialtyKey('zihinsel')}
              onKeyDown={(e) => handleSpecialtyKey(e, 1)}
            >
              02 <b>ZİHİNSEL</b>
              <small>SAVAŞÇI</small>
            </button>
            <button
              type="button"
              role="tab"
              id="spec-yakin"
              aria-selected={specialtyKey === 'yakin'}
              aria-controls="specialty-panel"
              tabIndex={specialtyKey === 'yakin' ? 0 : -1}
              onClick={() => setSpecialtyKey('yakin')}
              onKeyDown={(e) => handleSpecialtyKey(e, 2)}
            >
              03 <b>YAKIN DÖVÜŞ</b>
              <small>NİNJA</small>
            </button>
            <button
              type="button"
              role="tab"
              id="spec-uzak"
              aria-selected={specialtyKey === 'uzak'}
              aria-controls="specialty-panel"
              tabIndex={specialtyKey === 'uzak' ? 0 : -1}
              onClick={() => setSpecialtyKey('uzak')}
              onKeyDown={(e) => handleSpecialtyKey(e, 3)}
            >
              04 <b>UZAK DÖVÜŞ</b>
              <small>NİNJA</small>
            </button>
          </div>
          <div
            className="specialty-panel"
            id="specialty-panel"
            role="tabpanel"
            aria-labelledby={`spec-${specialtyKey}`}
            tabIndex={0}
          >
            <div className="specialty-summary">
              <p className="eyebrow" id="specialty-role">
                {specialty.role}
              </p>
              <h3 id="specialty-title">{specialty.title}</h3>
              <p id="specialty-description">{specialty.description}</p>
              <div className="specialty-traits" id="specialty-traits">
                {specialty.traits.map((trait) => (
                  <span key={trait}>{trait}</span>
                ))}
              </div>
              <p className="specialty-counter" id="specialty-counter">
                {specialty.counter}
              </p>
            </div>
            <ol className="skill-list" id="specialty-skills">
              {specialty.skills.map(([title, desc], idx) => (
                <li key={title}>
                  <span>{String(idx + 1).padStart(2, '0')}</span>
                  <div>
                    <h4>{title}</h4>
                    <p>{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 03 / Ganimet */}
        <section className="loot section-pad" id="ganimet">
          <div className="section-kicker">
            <span>04 / GANİMETİN BEDELİ</span>
            <span>PLANLANAN BOSS DÖNGÜSÜ</span>
          </div>
          <div className="loot-layout">
            <div className="loot-intro">
              <p className="eyebrow">BOSS'U KESTİN. PEKİ YA SONRASI?</p>
              <h2>
                ŞİMDİ
                <br />
                <em>AV SENSİN.</em>
              </h2>
              <p>
                Sandık sende. Gözler üzerinde.
                <br />
                Ödülünü açmadan önce takımınla birlikte 60 saniye hayatta
                kalabilecek misin?
              </p>
              <div className="loot-rule">
                <span aria-hidden="true">◇</span>
                <p>
                  Boss'a en çok hasarı veren takım sandığı kazanır.
                  <br />
                  <b>Ödülü korumak ise başka bir mücadele.</b>
                </p>
              </div>
            </div>
            <div className="relic-panel">
              <div className="relic-topline">
                <span>GANİMET TAŞIYICISI</span>
                <span className="live-dot" />
              </div>
              <div className="chest-art" aria-hidden="true">
                <div className="chest-rays" />
                <svg viewBox="0 0 240 180" fill="none">
                  <path
                    d="M45 85V58Q45 26 77 26H165Q195 26 195 58V85"
                    fill="#372d1e"
                    stroke="#d9b779"
                    strokeWidth="3"
                  />
                  <path
                    d="M45 85H195V149H45z"
                    fill="#32291f"
                    stroke="#d9b779"
                    strokeWidth="3"
                  />
                  <path
                    d="M45 85L60 69H180L195 85M74 27V149M166 27V149M45 133H195"
                    stroke="#a88146"
                    strokeWidth="5"
                  />
                  <path d="M108 76H132V106H108z" fill="#d9b779" />
                  <path d="M120 84V96" stroke="#302417" strokeWidth="4" />
                  <path d="M45 111H195" stroke="#6f5736" strokeWidth="2" />
                  <path
                    d="M104 42L120 34L136 42L120 50z"
                    fill="#e5c38c"
                    opacity=".6"
                  />
                </svg>
                <span className="relic-spark s1">✦</span>
                <span className="relic-spark s2">✧</span>
              </div>
              <div className="countdown">
                <span id="chest-time">
                  00:{String(chestSeconds).padStart(2, '0')}
                </span>
                <small id="chest-status" aria-live="polite">
                  {chestSeconds === 0
                    ? 'SANDIK GÜVENDE. ÖDÜL SEÇİMİ SIRADA.'
                    : chestRunning
                      ? 'SANDIK SENDE. 60 SANİYE DAYAN.'
                      : 'ÖDÜLÜNE GİDEN EN UZUN DAKİKA'}
                </small>
              </div>
              <div className="timer-track">
                <div
                  id="timer-progress"
                  style={{ width: `${((60 - chestSeconds) / 60) * 100}%` }}
                />
              </div>
              <button
                type="button"
                className="button button-outline"
                id="chest-demo"
                onClick={toggleChestDemo}
              >
                {chestSeconds === 0
                  ? 'YENİDEN DENE ↗'
                  : chestRunning
                    ? 'TANITIMI SIFIRLA ↺'
                    : 'TAŞIYICI OL ↗'}
              </button>
              <p className="demo-caption">
                Etkileşimli tanıtım · Oyun içi ödül vermez
              </p>
            </div>
          </div>
          <div className="loot-steps">
            <div>
              <span>01</span>
              <h3>BOSS'U DEVİR</h3>
              <p>
                Takımınla aynı hedef için savaş. Koridorlarını gözden çıkarma.
              </p>
            </div>
            <div>
              <span>02</span>
              <h3>SANDIĞI KORU</h3>
              <p>
                Düşersen sandık yerde kalır. Dostun da rakibin de alabilir.
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>GÜCÜNÜ GÖSTER</h3>
              <p>
                Ödülünü seç. Süreli gücün ve özel parlamanla cepheye dön.
              </p>
            </div>
          </div>
        </section>

        {/* 04 / Dünya */}
        <section className="world section-pad" id="dunya">
          <div className="section-kicker">
            <span>04 / SAVAŞ ALANINI OKU</span>
            <span>HER PATİKA BİR İHTİMAL.</span>
          </div>
          <div className="world-layout">
            <div
              className="world-map"
              role="button"
              tabIndex={0}
              style={{ cursor: 'zoom-in' }}
              onClick={() => setLightboxIndex(5)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setLightboxIndex(5);
                }
              }}
            >
              <img
                src="/assets/campaign/world.webp"
                alt="İki kaleyi, orman yollarını ve tarafsız hedefleri gösteren konsept harita"
                width={1358}
                height={768}
                loading="lazy"
              />
              <span className="map-caption">SAVAŞ ALANI / KONSEPT ÇALIŞMA (BÜYÜT ↗)</span>
            </div>
            <div className="world-copy">
              <h2>
                HARİTAYI KEŞFET
                <br />
                <em>MAÇI KAZAN</em>
              </h2>
              <p>
                Yüksek patikalarda gözetle. Ormanda fırsat kolla. Rakip boss'la
                uğraşırken kalbine ilerle.
              </p>
              <div className="world-feature">
                <span>↗</span>
                <div>
                  <h3>YÜKSEKTEKİ AVANTAJ</h3>
                  <p>
                    Görüş kazan. Menzilini kullan. Ama arkandaki patikayı
                    unutma.
                  </p>
                </div>
              </div>
              <div className="world-feature">
                <span>◇</span>
                <div>
                  <h3>GERİ DÖNÜŞÜNÜ YARAT</h3>
                  <p>
                    Güçlü rakibi avla, takımına yardım et, boss zamanlamasını
                    yakala.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 05 / Galeri */}
        <section className="gallery section-pad" id="galeri">
          <div className="section-kicker">
            <span>06 / CEPHEDEN GÖRÜNTÜLER</span>
            <span>GERÇEK OYUN İÇİ KARELER</span>
          </div>
          <div className="gallery-heading">
            <h2>
              BU DÜNYANIN
              <br />
              <em>İÇİNE BAK.</em>
            </h2>
            <span>
              Geliştirme sürümünden görüntüler.
              <br />
              Son görünüm değişebilir.
            </span>
          </div>
          <div className="gallery-grid">
            <button
              type="button"
              className="gallery-item"
              onClick={() => setLightboxIndex(0)}
            >
              <img
                src="/assets/campaign/castle.webp"
                alt="Gün ışığında KALE2 kalesi ve avlusu"
                loading="lazy"
                width={1536}
                height={864}
              />
              <span>
                <b>KALE KAPILARINDA</b>
                <i aria-hidden="true">↗</i>
              </span>
            </button>
            <button
              type="button"
              className="gallery-item"
              onClick={() => setLightboxIndex(1)}
            >
              <img
                src="/assets/campaign/ui-character-select.jpg"
                alt="Karakter ve Oyun Modu Seçimi arayüzü"
                loading="lazy"
                width={1536}
                height={864}
              />
              <span>
                <b>LOBİ VE MOD SEÇİMİ</b>
                <i aria-hidden="true">↗</i>
              </span>
            </button>
            <button
              type="button"
              className="gallery-item"
              onClick={() => setLightboxIndex(2)}
            >
              <img
                src="/assets/campaign/ui-power-select.jpg"
                alt="10. Seviye Özel Güç Seçimi arayüzü"
                loading="lazy"
                width={1536}
                height={864}
              />
              <span>
                <b>ÖZEL GÜÇ SEÇİMİ</b>
                <i aria-hidden="true">↗</i>
              </span>
            </button>
            <button
              type="button"
              className="gallery-item"
              onClick={() => setLightboxIndex(3)}
            >
              <img
                src="/assets/campaign/battle.webp"
                alt="Koridorda ilerleyen kahramanlar ve minyonlar"
                loading="lazy"
                width={1536}
                height={864}
              />
              <span>
                <b>CEPHEYE DOĞRU</b>
                <i aria-hidden="true">↗</i>
              </span>
            </button>
            <button
              type="button"
              className="gallery-item"
              onClick={() => setLightboxIndex(4)}
            >
              <img
                src="/assets/campaign/night.webp"
                alt="Gece ışığında kale surları"
                loading="lazy"
                width={1536}
                height={864}
              />
              <span>
                <b>GECE NÖBETİ</b>
                <i aria-hidden="true">↗</i>
              </span>
            </button>
            <button
              type="button"
              className="gallery-item"
              onClick={() => setLightboxIndex(5)}
            >
              <img
                src="/assets/campaign/world.webp"
                alt="Savaş alanı konsept haritası"
                loading="lazy"
                width={1358}
                height={768}
              />
              <span>
                <b>SAVAŞ ALANI HARİTASI</b>
                <i aria-hidden="true">↗</i>
              </span>
            </button>
          </div>
        </section>

        {/* Sıralama / Sezon Liderlik Tablosu */}
        <section className="leaderboard section-pad" id="siralama">
          <div className="section-kicker">
            <span>SEZON LİDERLİK TABLOSU</span>
            <span>EN İYİ SAVAŞÇILAR / CANLI VERİ</span>
          </div>

          <div className="leaderboard-intro">
            <p className="eyebrow">
              <span className="live-dot" /> CANLI İSTATİSTİKLER & MAÇ GEÇMİŞİ
            </p>
            <h2>
              KALE2'NİN EFSANELERİ.
              <br />
              <em>KİM DAHA GÜÇLÜ?</em>
            </h2>
            <p className="leaderboard-desc">
              Vadideki resmi maç verileriyle hesaplanan güncel oyuncu sıralaması. Her zafer, her katletme ve her asist puanına yansır.
            </p>
          </div>

          {/* Top 3 Podyum Kartları */}
          <div className="leaderboard-podium">
            {leaderboard.slice(0, 3).map((player) => (
              <div
                key={player.playerName}
                className={`podium-card rank-${player.rank} ${player.tier}`}
              >
                <div className="podium-badge">
                  {player.rank === 1 ? '👑 1. ŞAMPİYON' : player.rank === 2 ? '⚔ 2. USTA' : '🛡 3. KIDEMLİ'}
                </div>
                <div className="podium-avatar">
                  <span className="avatar-class-tag">{player.class === 'ninja' ? 'N' : 'S'}</span>
                </div>
                <h3 className="podium-name">{player.playerName}</h3>
                <span className="podium-spec">
                  {player.class === 'warrior'
                    ? player.spec === 'warrior_mental' ? 'Zihinsel Savaşçı' : 'Bedensel Savaşçı'
                    : player.spec === 'ninja_bow' ? 'Uzak Dövüş Ninja' : 'Yakın Dövüş Ninja'}
                  {' '}(Lv. {player.maxLevel})
                </span>

                <div className="podium-stats">
                  <div className="pod-stat">
                    <span>KAZANMA</span>
                    <strong>%{player.winRate}</strong>
                  </div>
                  <div className="pod-stat">
                    <span>KDA</span>
                    <strong>{player.kda}</strong>
                  </div>
                  <div className="pod-stat">
                    <span>KATLETME</span>
                    <strong>{player.kills}</strong>
                  </div>
                  <div className="pod-stat">
                    <span>MAÇ</span>
                    <strong>{player.wins}G / {player.matchesPlayed}M</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tam Sıralama Tablosu */}
          <div className="leaderboard-table-wrap">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>SIRA</th>
                  <th>SAVAŞÇI</th>
                  <th>SINIF</th>
                  <th>KAZANMA ORANI</th>
                  <th>K / D / A</th>
                  <th>HASAR</th>
                  <th>KADEME</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((p) => (
                  <tr key={p.playerName} className={p.rank <= 3 ? 'top-tier' : ''}>
                    <td className="rank-cell">
                      <span className={`rank-num rank-${p.rank}`}>#{p.rank}</span>
                    </td>
                    <td className="player-cell">
                      <strong>{p.playerName}</strong>
                      <small>Seviye {p.maxLevel}</small>
                    </td>
                    <td className="class-cell">
                      <span className={`badge-class ${p.class}`}>
                        {p.class === 'warrior' ? 'Savaşçı' : 'Ninja'}
                      </span>
                    </td>
                    <td className="winrate-cell">
                      <div className="winrate-bar-wrap">
                        <div className="winrate-bar" style={{ width: `${p.winRate}%` }} />
                      </div>
                      <span>%{p.winRate} <small>({p.wins}G / {p.matchesPlayed}M)</small></span>
                    </td>
                    <td className="kda-cell">
                      <strong>{p.kda}</strong>
                      <small>{p.kills} / {p.deaths} / {p.assists}</small>
                    </td>
                    <td className="damage-cell">
                      {p.totalHeroDamage.toLocaleString('tr-TR')}
                    </td>
                    <td className="tier-cell">
                      <span className={`badge-tier ${p.tier}`}>
                        {p.tier === 'champion' ? 'ŞAMPİYON' : p.tier === 'master' ? 'USTA' : p.tier === 'diamond' ? 'ELMAS' : 'ALTIN'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="leaderboard-cta">
            <p>Sıralamada yerini almak ve efsaneler arasına girmek için hemen savaşa başla!</p>
            <a href="#gelecek" className="button button-red">
              HESABINI AÇ & SIRALAMAYA GİR <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>

        {/* Başvuru / Oyuncu Kayıt Portalı */}
        <section className="join section-pad" id="gelecek">
          <div className="section-kicker">
            <span>RESMİ KAYIT PORTALI</span>
            <span>HESABINI OLUŞTUR / YERİNİ AYIRT</span>
          </div>
          <div className="join-layout">
            <div className="join-copy">
              <p className="eyebrow">
                <span className="live-dot" /> SAVAŞA İLK ADIMI AT
              </p>
              <h2>
                KALE BEKLER.
                <br />
                <em>SEN BEKLEME.</em>
              </h2>
              <p>
                Karakterini ve şifreni şimdiden belirle. Erken erişim testlerinde ilk sıralarda yerini al, ganimet avına ilk sen başla.
              </p>
              <div className="join-benefit">
                <b>01 / KULLANICI ADINI KAP</b>
                <span>İstediğin savaşçı adı ve unvan başkası almadan senin olsun.</span>
              </div>
              <div className="join-benefit">
                <b>02 / GÜVENLİ ŞİFRELİ KAYIT</b>
                <span>Şifren güçlü şifreleme algoritmasıyla sunucumuzda güvenle korunur.</span>
              </div>
              <div className="join-benefit">
                <b>03 / DOĞRUDAN ERİŞİM</b>
                <span>Sunucu ve testler açıldığında beklemeden bu hesabınla oyuna bağlan.</span>
              </div>
              <button
                type="button"
                className="button button-outline community-trigger"
                onClick={() => setCommunityOpen(true)}
              >
                TOPLULUĞU KEŞFET <span aria-hidden="true">↗</span>
              </button>
              <p className="join-note">
                Topluluk penceresi örnektir. Gerçek Discord bağlantısı yakında eklenecek.
              </p>
            </div>

            {registeredAccount ? (
              <div className="join-form registration-success-card" id="test-form">
                <div className="form-heading">
                  <span>KALE2 RESMİ HESAP</span>
                  <span className="register-badge"><span className="live-dot" /> AKTİF KAYIT</span>
                </div>
                <div className="success-badge">✦ KAYIT TAMAMLANDI ✦</div>
                <h3>SAVAŞA HAZIRSIN, {registeredAccount.username}!</h3>
                <p className="form-disclaimer">
                  Hesabın başarıyla sunucuya kaydedildi. Sunucu testleri ve oyun açılışında bu hesap bilgilerinle doğrudan giriş yapabileceksin.
                </p>
                <div className="registered-details">
                  <div className="reg-row">
                    <span>Oyuncu Adı</span>
                    <strong>{registeredAccount.username}</strong>
                  </div>
                  <div className="reg-row">
                    <span>E-Posta</span>
                    <strong>{registeredAccount.email}</strong>
                  </div>
                  <div className="reg-row">
                    <span>Seçilen Yol</span>
                    <strong>
                      {registeredAccount.specialty === 'bedensel'
                        ? 'Savaşçı / Bedensel'
                        : registeredAccount.specialty === 'zihinsel'
                          ? 'Savaşçı / Zihinsel'
                          : registeredAccount.specialty === 'yakin'
                            ? 'Ninja / Yakın dövüş'
                            : registeredAccount.specialty === 'uzak'
                              ? 'Ninja / Uzak dövüş'
                              : 'Henüz Seçilmedi'}
                    </strong>
                  </div>
                  <div className="reg-row">
                    <span>Kayıt Tarihi</span>
                    <small>{new Date(registeredAccount.createdAt).toLocaleString('tr-TR')}</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => {
                    setRegisteredAccount(null);
                    setUsername('');
                    setEmail('');
                    setPassword('');
                    setPasswordConfirm('');
                    setFormError('');
                  }}
                  style={{ marginTop: '20px', width: '100%' }}
                >
                  YENİ BİR HESAP KAYDET ↺
                </button>
              </div>
            ) : (
              <form className="join-form" id="test-form" onSubmit={handleRegister}>
                <div className="form-heading">
                  <span>KALE2 OYUNCU KAYDI</span>
                  <span className="register-badge"><span className="live-dot" /> CANLI VERİTABANI</span>
                </div>
                <h3>HESABINI OLUŞTUR.</h3>
                <p className="form-disclaimer">
                  Savaşçı adını belirle, şifreni oluştur ve erken erişim için yerini hemen ayırt. Bilgilerin sunucumuzda güvenle saklanır.
                </p>

                {formError && (
                  <div className="form-error-alert" role="alert">
                    <span>⚠</span> {formError}
                  </div>
                )}

                <label htmlFor="player-username">
                  OYUNCU ADIN (KULLANICI ADI)
                  <input
                    id="player-username"
                    name="username"
                    autoComplete="username"
                    placeholder="Örn: AlpArslan (3-24 karakter)"
                    required
                    minLength={3}
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <small className="field-hint">Harf, rakam ve alt çizgi (_) içerebilir.</small>
                </label>

                <label htmlFor="player-email">
                  E-POSTA ADRESİN
                  <input
                    id="player-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="oyuncu@ornek.com"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                <div className="password-fields-row">
                  <label htmlFor="player-password">
                    ŞİFREN
                    <div className="password-input-wrapper">
                      <input
                        id="player-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="En az 6 karakter"
                        required
                        minLength={6}
                        maxLength={128}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                      >
                        {showPassword ? '👁' : '👁‍🗨'}
                      </button>
                    </div>
                  </label>

                  <label htmlFor="player-password-confirm">
                    ŞİFRE TEKRARI
                    <input
                      id="player-password-confirm"
                      name="passwordConfirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Şifreni onayla"
                      required
                      minLength={6}
                      maxLength={128}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                    />
                  </label>
                </div>

                <label htmlFor="player-path">
                  İLK TERCİHİN (SINIF & UZMANLIK)
                  <select
                    id="player-path"
                    name="specialty"
                    value={formSpecialty}
                    onChange={(e) => setFormSpecialty(e.target.value)}
                  >
                    <option value="kararsiz">Henüz karar vermedim</option>
                    <option value="bedensel">Savaşçı / Bedensel</option>
                    <option value="zihinsel">Savaşçı / Zihinsel</option>
                    <option value="yakin">Ninja / Yakın dövüş</option>
                    <option value="uzak">Ninja / Uzak dövüş</option>
                  </select>
                </label>

                <label className="form-check">
                  <input
                    type="checkbox"
                    name="acknowledge"
                    required
                    checked={acknowledge}
                    onChange={(e) => setAcknowledge(e.target.checked)}
                  />
                  <span>
                    KALE2 kurallarını kabul ediyor ve şifremle oyuncu hesabımın sunucuda açılmasını onaylıyorum.
                  </span>
                </label>

                <button
                  type="submit"
                  className="button button-red register-submit-btn"
                  disabled={submitting}
                >
                  {submitting ? 'HESAP OLUŞTURULUYOR...' : 'HESABIMI OLUŞTUR'} <span aria-hidden="true">↗</span>
                </button>

                {totalPlayers !== null && (
                  <p className="registered-counter">
                    <span className="live-dot" /> Şu ana kadar <b>{totalPlayers}</b> oyuncu kaydolarak yerini ayırttı.
                  </p>
                )}
              </form>
            )}
          </div>
        </section>

        {/* SSS / FAQ */}
        <section className="faq section-pad" id="sorular">
          <div>
            <p className="eyebrow">CEPHEDEN ÖNCE</p>
            <h2>
              AKLINDA
              <br />
              <em>KALMASIN.</em>
            </h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>
                KALE2 nasıl bir oyun?<span>+</span>
              </summary>
              <p>
                Fantastik bir dünyada 5v5 kale savaşı. Takımınla koridorlara baskı
                kur, boss ganimetleri için risk al ve rakip kaleyi ele geçir.
                Hedef maç süresi 15–25 dakika.
              </p>
            </details>
            <details>
              <summary>
                Ne zaman oynayabileceğim?<span>+</span>
              </summary>
              <p>
                Oyun geliştirme aşamasında. Çıkış ve test takvimi henüz
                açıklanmadı. Buradaki başvuru formu ve topluluk ekranı tanıtım
                taslaklarıdır.
              </p>
            </details>
            <details>
              <summary>
                Maçta kazandığım güç sonraki maça taşınır mı?<span>+</span>
              </summary>
              <p>
                Mevcut tasarımda her maç seviye, ekipman ve yükseltmeler
                sıfırlanır. Köy karakterinin ilerleyişi ayrı tutulur.
              </p>
            </details>
            <details>
              <summary>
                Boss sandığı neden önemli?<span>+</span>
              </summary>
              <p>
                En çok toplam hasarı veren takım sandık hakkını kazanır. Sandık
                ilk kez envantere girdiğinde 60 saniyelik süre başlar. Taşıyıcı
                düşerse sandığı dost da rakip de alabilir. Koruma süresini
                tamamlayan taşıyıcı ödülünü seçer.
              </p>
            </details>
            <details>
              <summary>
                Güç satın alarak avantaj sağlanacak mı?<span>+</span>
              </summary>
              <p>
                Tasarım ilkemiz Pay2Win olmaması. Güç farkı maç içindeki
                gelişim, ganimet ve takım kararlarından doğmalı. Ticari modelin
                ayrıntıları henüz belirlenmedi.
              </p>
            </details>
          </div>
        </section>
      </main>

      {/* Alt Bilgi (Footer) */}
      <footer className="footer">
        <a href="#top" className="wordmark" aria-label="Başa dön">
          KALE<span>2</span>
          <i aria-hidden="true">◆</i>
        </a>
        <p>GANİMET. TAKIM. ZAFER.</p>
        <span>
          © 2026 KALE2 <span className="footer-separator">/</span> Geliştirme
          aşamasında
        </span>
        <a href="#top" className="back-top">
          BAŞA DÖN ↑
        </a>
      </footer>

      {/* Galeri Lightbox Dialog */}
      {lightboxIndex !== null && (
        <div
          className="lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Oyun görüntüleri"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxIndex(null);
          }}
        >
          <div className="lightbox">
            <button
              type="button"
              className="lightbox-close"
              aria-label="Galeriyi kapat"
              onClick={() => setLightboxIndex(null)}
            >
              ✕
            </button>
            <div className="lightbox-inner">
              <img
                src={GALLERY_ITEMS[lightboxIndex].image}
                alt={GALLERY_ITEMS[lightboxIndex].caption}
              />
              <div className="lightbox-toolbar">
                <button
                  type="button"
                  id="gallery-prev"
                  aria-label="Önceki görüntü"
                  onClick={() =>
                    setLightboxIndex(
                      (lightboxIndex - 1 + GALLERY_ITEMS.length) %
                        GALLERY_ITEMS.length,
                    )
                  }
                >
                  ←
                </button>
                <p id="lightbox-caption">{GALLERY_ITEMS[lightboxIndex].caption}</p>
                <button
                  type="button"
                  id="gallery-next"
                  aria-label="Sonraki görüntü"
                  onClick={() =>
                    setLightboxIndex(
                      (lightboxIndex + 1) % GALLERY_ITEMS.length,
                    )
                  }
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Topluluk Dialogu */}
      {communityOpen && (
        <div
          className="community-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="community-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCommunityOpen(false);
          }}
        >
          <div className="community-dialog">
            <button
              type="button"
              className="dialog-close"
              id="community-close"
              aria-label="Topluluğu kapat"
              onClick={() => setCommunityOpen(false)}
            >
              ✕
            </button>
            <p className="eyebrow">KALE2 TOPLULUĞU / ÖRNEK EKRAN</p>
            <h2 id="community-title">
              TAKIMIN
              <br />
              <em>BURADA.</em>
            </h2>
            <p>
              Gerçek Discord sunucusu bağlandığında buluşacağımız alanların taslağı.
            </p>
            <div className="community-channel">
              <span>#</span>
              <div>
                <b>duyurular</b>
                <p>Test tarihleri, yeni sürümler ve cepheden haberler.</p>
              </div>
            </div>
            <div className="community-channel">
              <span>#</span>
              <div>
                <b>takım-ara</b>
                <p>Rolünü söyle. Beşliyi tamamla. Birlikte sıraya gir.</p>
              </div>
            </div>
            <div className="community-channel">
              <span>#</span>
              <div>
                <b>geri-bildirim</b>
                <p>Kaçış hissi, güçlü eşyalar, unutulmaz savaşlar.</p>
              </div>
            </div>
            <button
              type="button"
              id="community-to-form"
              className="button button-red"
              onClick={() => {
                setCommunityOpen(false);
                document.getElementById('test-form')?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                });
                document.getElementById('player-name')?.focus({
                  preventScroll: true,
                });
              }}
            >
              KAYIT FORMUNA GİT ↗
            </button>
            <p className="community-note">
              Bu pencere Discord'a bağlanmaz; henüz üye veya mesaj verisi içermez.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
