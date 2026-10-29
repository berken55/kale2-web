import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { FeedbackCategory, FeedbackItem, PlayerProfile } from '@shared/types';
import '../marketing.css';

const CATEGORIES: { key: FeedbackCategory; label: string; icon: string; desc: string }[] = [
  { key: 'bug', label: 'Hata / Bug', icon: '🐛', desc: 'Görsel, animasyon veya mekanik arıza' },
  { key: 'balance', label: 'Denge / Balance', icon: '⚖', desc: 'Hasar, yetenek, sınıf dengesi' },
  { key: 'feature', label: 'Fikir / Özellik', icon: '💡', desc: 'Yeni mod, yetenek veya harita önerisi' },
  { key: 'performance', label: 'FPS / Performans', icon: '⚡', desc: 'Kasma, donma veya yüklenme süresi' },
  { key: 'general', label: 'Genel Görüş', icon: '🌟', desc: 'Oyun hissi, atmosfer ve genel deneyim' },
];

const SPECIALTY_OPTIONS: { key: string; label: string; classType: 'warrior' | 'ninja'; role: string }[] = [
  { key: 'bedensel', label: 'Savaşçı — Bedensel Yol', classType: 'warrior', role: 'Yüksek saldırı gücü ve hız' },
  { key: 'zihinsel', label: 'Savaşçı — Zihinsel Yol', classType: 'warrior', role: 'Ağır zırh ve sarsılmaz savunma' },
  { key: 'yakin', label: 'Ninja — Yakın Dövüş', classType: 'ninja', role: 'Hızlı hançer saldırıları ve suikast' },
  { key: 'uzak', label: 'Ninja — Uzak Dövüş', classType: 'ninja', role: 'Menzilli ok atışları ve alan kontrolü' },
];

export function ProfilePage() {
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');

  // Giriş state'leri
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Kayıt state'leri
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regSpecialty, setRegSpecialty] = useState('bedensel');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');

  // Feedback state'leri
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [rating, setRating] = useState<number>(5);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbSuccess, setFbSuccess] = useState('');
  const [fbError, setFbError] = useState('');
  const [myFeedbacks, setMyFeedbacks] = useState<FeedbackItem[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);

  // Uzmanlık değiştirme
  const [updatingSpecialty, setUpdatingSpecialty] = useState(false);

  // LocalStorage kontrolü
  useEffect(() => {
    document.title = 'KALE2 — Oyuncu Profili & Beta Geri Bildirim';

    try {
      const saved = localStorage.getItem('kale2_player_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) {
          setPlayer(parsed);
          // Sunucudan güncel profil ve istatistikleri çek
          fetch(`/api/player/profile/${parsed.id}`)
            .then((r) => r.json())
            .then((res) => {
              if (res.ok && res.profile) {
                setPlayer(res.profile);
                localStorage.setItem('kale2_player_profile', JSON.stringify(res.profile));
              }
            })
            .catch(() => {});
        }
      }
    } catch {}
  }, []);

  // Oyuncunun feedbacklerini yükle
  const loadFeedbacks = (accountId?: number) => {
    setLoadingFeedbacks(true);
    const url = accountId ? `/api/player/feedback?accountId=${accountId}` : '/api/player/feedback?limit=15';
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMyFeedbacks(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingFeedbacks(false));
  };

  useEffect(() => {
    if (player?.id) {
      loadFeedbacks(player.id);
    } else {
      loadFeedbacks();
    }
  }, [player?.id]);

  // Giriş İşlemi
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    try {
      const res = await fetch('/api/player/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginIdentifier.trim(),
          password: loginPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Giriş yapılamadı.');
      }

      setPlayer(data.profile);
      localStorage.setItem('kale2_player_profile', JSON.stringify(data.profile));
      setLoginPassword('');
    } catch (err: any) {
      setLoginError(err.message || 'Giriş yapılırken bir hata oluştu.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Kayıt İşlemi
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (regPassword !== regConfirm) {
      setRegError('Girdiğiniz şifreler eşleşmiyor.');
      return;
    }

    setRegLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername.trim(),
          email: regEmail.trim(),
          password: regPassword,
          specialty: regSpecialty,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Kayıt tamamlanamadı.');
      }

      // Kayıt başarılı -> otomatik login
      const loginRes = await fetch('/api/player/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: regUsername.trim(),
          password: regPassword,
        }),
      });
      const loginData = await loginRes.json();
      if (loginData.ok && loginData.profile) {
        setPlayer(loginData.profile);
        localStorage.setItem('kale2_player_profile', JSON.stringify(loginData.profile));
      } else {
        setAuthTab('login');
        setLoginIdentifier(regUsername.trim());
      }
    } catch (err: any) {
      setRegError(err.message || 'Kayıt olurken bir hata oluştu.');
    } finally {
      setRegLoading(false);
    }
  };

  // Çıkış İşlemi
  const handleLogout = () => {
    setPlayer(null);
    localStorage.removeItem('kale2_player_profile');
    localStorage.removeItem('kale2_registered_account');
  };

  // Uzmanlık Sınıfı Değiştirme
  const handleSpecialtyUpdate = async (newSpec: string) => {
    if (!player) return;
    setUpdatingSpecialty(true);
    try {
      const res = await fetch('/api/player/specialty', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: player.id,
          specialty: newSpec,
        }),
      });
      const data = await res.json();
      if (data.ok && data.profile) {
        setPlayer(data.profile);
        localStorage.setItem('kale2_player_profile', JSON.stringify(data.profile));
      }
    } catch {}
    finally {
      setUpdatingSpecialty(false);
    }
  };

  // Geri Bildirim Gönderimi
  const handleFeedbackSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFbError('');
    setFbSuccess('');

    if (!subject.trim()) {
      setFbError('Lütfen bir konu başlığı girin.');
      return;
    }
    if (message.trim().length < 10) {
      setFbError('Lütfen en az 10 karakterden oluşan açıklayıcı bir mesaj yazın.');
      return;
    }

    setFbSubmitting(true);
    try {
      const res = await fetch('/api/player/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: player?.id ?? null,
          playerName: player?.username || 'Gezgin Savaşçı',
          category,
          rating,
          subject: subject.trim(),
          message: message.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Geri bildirim iletilemedi.');
      }

      setFbSuccess('Geri bildiriminiz başarıyla iletildi! KALE2 Beta testine desteğiniz için teşekkür ederiz.');
      setSubject('');
      setMessage('');
      setRating(5);
      loadFeedbacks(player?.id);
    } catch (err: any) {
      setFbError(err.message || 'Sunucuya bağlanılamadı.');
    } finally {
      setFbSubmitting(false);
    }
  };

  const isNinja = player?.specialty === 'yakin' || player?.specialty === 'uzak';
  const characterImage = isNinja ? '/assets/campaign/ninja.webp' : '/assets/campaign/warrior.webp';

  return (
    <div className="landing-campaign profile-hub-page">
      {/* Üst Navigasyon */}
      <header className="header" style={{ position: 'sticky', top: 0 }}>
        <Link to="/" className="wordmark" aria-label="KALE2 ana sayfa">
          KALE<span>2</span>
          <i aria-hidden="true">◆</i>
        </Link>
        <nav className="navigation open" style={{ display: 'flex' }}>
          <Link to="/">← Anasayfa</Link>
          <Link to="/#siralama">Sıralama</Link>
          <Link to="/wiki">Wiki</Link>
        </nav>
        {player ? (
          <div className="header-player-pill">
            <span className="live-dot" />
            <b>{player.username}</b>
            <button type="button" onClick={handleLogout} className="logout-btn">
              Çıkış
            </button>
          </div>
        ) : (
          <a href="#giris" className="nav-cta">
            GİRİŞ YAP <span aria-hidden="true">↗</span>
          </a>
        )}
      </header>

      <main className="profile-container section-pad">
        {!player ? (
          /* GİRİŞ / KAYIT EKRANI */
          <div className="auth-box-wrapper" id="giris">
            <div className="section-kicker">
              <span>BETA ERİŞİM & OYUNCU PORTALI</span>
              <span>GİRİŞ YAP / HESAP OLUŞTUR</span>
            </div>

            <div className="auth-card">
              <div className="auth-tabs">
                <button
                  type="button"
                  className={`auth-tab-btn ${authTab === 'login' ? 'active' : ''}`}
                  onClick={() => setAuthTab('login')}
                >
                  GİRİŞ YAP
                </button>
                <button
                  type="button"
                  className={`auth-tab-btn ${authTab === 'register' ? 'active' : ''}`}
                  onClick={() => setAuthTab('register')}
                >
                  KAYIT OL
                </button>
              </div>

              {authTab === 'login' ? (
                <form className="auth-form" onSubmit={handleLogin}>
                  <h3>HESABINA GİRİŞ YAP</h3>
                  <p className="auth-sub">
                    Karakterini ve beta maç istatistiklerini gör, geliştirmeler için doğrudan geri bildirim gönder.
                  </p>

                  {loginError && (
                    <div className="form-error-alert" role="alert">
                      <span>⚠</span> {loginError}
                    </div>
                  )}

                  <label>
                    KULLANICI ADI VEYA E-POSTA
                    <input
                      type="text"
                      required
                      placeholder="Örn: AlpArslan veya alp@kale2.com"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                    />
                  </label>

                  <label>
                    ŞİFRE
                    <input
                      type="password"
                      required
                      placeholder="Şifreniz"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                  </label>

                  <button
                    type="submit"
                    className="button button-red auth-submit"
                    disabled={loginLoading}
                  >
                    {loginLoading ? 'GİRİŞ YAPILIYOR...' : 'GİRİŞ YAP ↗'}
                  </button>

                  <p className="auth-switch-note">
                    Henüz bir hesabın yok mu?{' '}
                    <button type="button" onClick={() => setAuthTab('register')}>
                      Buradan hemen kaydol.
                    </button>
                  </p>
                </form>
              ) : (
                <form className="auth-form" onSubmit={handleRegister}>
                  <h3>YENİ HESAP OLUŞTUR</h3>
                  <p className="auth-sub">
                    Savaşçı adını belirle ve KALE2 erken erişim testlerine hemen dahil ol.
                  </p>

                  {regError && (
                    <div className="form-error-alert" role="alert">
                      <span>⚠</span> {regError}
                    </div>
                  )}

                  <label>
                    OYUNCU ADI
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={24}
                      placeholder="Örn: BaturHan (3-24 karakter)"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                    />
                  </label>

                  <label>
                    E-POSTA ADRESİ
                    <input
                      type="email"
                      required
                      placeholder="oyuncu@ornek.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                    />
                  </label>

                  <div className="password-fields-row">
                    <label>
                      ŞİFRE
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="En az 6 karakter"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                      />
                    </label>

                    <label>
                      ŞİFRE TEKRAR
                      <input
                        type="password"
                        required
                        placeholder="Şifreyi doğrula"
                        value={regConfirm}
                        onChange={(e) => setRegConfirm(e.target.value)}
                      />
                    </label>
                  </div>

                  <label>
                    SEÇMEK İSTEDİĞİN İLK YOL
                    <select
                      value={regSpecialty}
                      onChange={(e) => setRegSpecialty(e.target.value)}
                    >
                      <option value="bedensel">Savaşçı / Bedensel Yol</option>
                      <option value="zihinsel">Savaşçı / Zihinsel Yol</option>
                      <option value="yakin">Ninja / Yakın Dövüş</option>
                      <option value="uzak">Ninja / Uzak Dövüş</option>
                    </select>
                  </label>

                  <button
                    type="submit"
                    className="button button-red auth-submit"
                    disabled={regLoading}
                  >
                    {regLoading ? 'KAYDEDİLİYOR...' : 'KAYDI TAMAMLA VE GİRİŞ YAP ↗'}
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* OYUNCU PANELİ & GERİ BİLDİRİM MERKEZİ */
          <div className="hub-layout">
            {/* Sol Panel: Karakter & Profil Bilgisi */}
            <aside className="hub-profile-card">
              <div className="profile-hero-banner">
                <img
                  src={characterImage}
                  alt={player.username}
                  className="profile-char-thumb"
                />
                <div className="profile-hero-info">
                  <span className="profile-tag">
                    <span className="live-dot" /> BETA TESTÇİSİ
                  </span>
                  <h2>{player.username}</h2>
                  <span className="profile-email">{player.email}</span>
                </div>
              </div>

              {/* Seçili Sınıf & Değiştirme */}
              <div className="profile-section-block">
                <h4>UZMANLIK SINIFIN</h4>
                <div className="specialty-picker-grid">
                  {SPECIALTY_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`spec-pick-btn ${player.specialty === opt.key ? 'selected' : ''}`}
                      onClick={() => handleSpecialtyUpdate(opt.key)}
                      disabled={updatingSpecialty}
                    >
                      <span className="spec-pick-title">{opt.label}</span>
                      <small className="spec-pick-role">{opt.role}</small>
                      {player.specialty === opt.key && (
                        <span className="spec-active-badge">✓ AKTİF</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Savaş İstatistikleri */}
              <div className="profile-section-block">
                <h4>MAÇ VE SAVAŞ İSTATİSTİKLERİ</h4>
                {player.stats && player.stats.matchesPlayed > 0 ? (
                  <div className="hub-stats-grid">
                    <div className="hub-stat-item">
                      <span>MAÇ / GALİBİYET</span>
                      <strong>{player.stats.wins}G / {player.stats.matchesPlayed}M</strong>
                    </div>
                    <div className="hub-stat-item">
                      <span>KAZANMA ORANI</span>
                      <strong>%{player.stats.winRate}</strong>
                    </div>
                    <div className="hub-stat-item">
                      <span>KDA</span>
                      <strong>{player.stats.kda}</strong>
                      <small>{player.stats.kills}K / {player.stats.deaths}D / {player.stats.assists}A</small>
                    </div>
                    <div className="hub-stat-item">
                      <span>KAHRAMAN HASARI</span>
                      <strong>{player.stats.totalHeroDamage.toLocaleString('tr-TR')}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="no-matches-box">
                    <p>Henüz kayıtlı resmi bir maçın bulunmuyor.</p>
                    <small>Oyuna giriş yapıp maçları tamamladığında skorların burada ve liderlik tablosunda görünecektir.</small>
                  </div>
                )}
              </div>

              <div className="profile-meta-info">
                <span>Hesap Oluşturulma: {new Date(player.createdAt).toLocaleDateString('tr-TR')}</span>
                <button type="button" onClick={handleLogout} className="button button-outline logout-full">
                  OTURUMU KAPAT
                </button>
              </div>
            </aside>

            {/* Sağ Panel: Beta Geri Bildirim (Feedback) */}
            <section className="hub-feedback-section">
              <div className="feedback-header">
                <span className="sub-title">BETA GELİŞTİRİCİ KANALI</span>
                <h2>GERİ BİLDİRİMİN KALE2'Yİ ŞEKİLLENDİRSİN.</h2>
                <p>
                  Oyun deneyiminde karşılaştığın hataları (bug), silah ve sınıf dengesini ya da görmek istediğin yeni fikirleri doğrudan geliştirici ekibe ilet.
                </p>
              </div>

              {fbSuccess && (
                <div className="fb-alert success">
                  <span>✦</span> {fbSuccess}
                </div>
              )}

              {fbError && (
                <div className="fb-alert error">
                  <span>⚠</span> {fbError}
                </div>
              )}

              <form className="hub-feedback-form" onSubmit={handleFeedbackSubmit}>
                {/* Kategori Seçimi */}
                <div className="fb-field-group">
                  <label className="fb-label">GERİ BİLDİRİM KATEGORİSİ</label>
                  <div className="category-chips">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.key}
                        type="button"
                        className={`chip-btn ${category === cat.key ? 'active' : ''}`}
                        onClick={() => setCategory(cat.key)}
                      >
                        <span className="chip-icon">{cat.icon}</span>
                        <span className="chip-label">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Beta Puanlama (1-5 Yıldız) */}
                <div className="fb-field-group">
                  <label className="fb-label">BETA GENEL PUANIN (1-5 YILDIZ)</label>
                  <div className="star-rating-row">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        className={`star-btn ${rating >= star ? 'filled' : ''}`}
                        onClick={() => setRating(star)}
                        title={`${star} Yıldız`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="rating-text">
                      {rating === 5 ? 'Efsanevi (5/5)' : rating === 4 ? 'Çok İyi (4/5)' : rating === 3 ? 'Geliştirilmeli (3/5)' : rating === 2 ? 'Eksikleri Var (2/5)' : 'Zayıf (1/5)'}
                    </span>
                  </div>
                </div>

                {/* Konu Başlığı */}
                <div className="fb-field-group">
                  <label className="fb-label" htmlFor="fb-subject">
                    KONU BAŞLIĞI
                  </label>
                  <input
                    id="fb-subject"
                    type="text"
                    required
                    maxLength={150}
                    placeholder="Örn: Vahşi Uzman vuruş animasyonu gecikmeli, Kılıç Çevirme hasarı hk."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>

                {/* Mesaj */}
                <div className="fb-field-group">
                  <label className="fb-label" htmlFor="fb-message">
                    DETAYLI AÇIKLAMA / GERİ BİLDİRİMİN
                  </label>
                  <textarea
                    id="fb-message"
                    required
                    rows={5}
                    minLength={10}
                    maxLength={4000}
                    placeholder="Karşılaştığın durumu, ne zaman olduğunu veya çözüm için önerini detaylıca yazabilirsin..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <small className="fb-char-count">{message.length} / 4000 karakter</small>
                </div>

                <button
                  type="submit"
                  className="button button-red fb-submit-btn"
                  disabled={fbSubmitting}
                >
                  {fbSubmitting ? 'İLETİLİYOR...' : 'GERİ BİLDİRİMİ GÖNDER ↗'}
                </button>
              </form>

              {/* Geçmiş Geri Bildirimler */}
              <div className="past-feedbacks-wrap">
                <h3>SON GERİ BİLDİRİMLER</h3>
                {loadingFeedbacks ? (
                  <p className="loading-text">Yükleniyor...</p>
                ) : myFeedbacks.length === 0 ? (
                  <p className="empty-fb-text">Henüz iletilen bir geri bildirim bulunmuyor.</p>
                ) : (
                  <div className="fb-list">
                    {myFeedbacks.map((fb) => (
                      <div key={fb.id} className="fb-card-item">
                        <div className="fb-card-top">
                          <span className={`fb-category-badge ${fb.category}`}>
                            {CATEGORIES.find((c) => c.key === fb.category)?.icon}{' '}
                            {CATEGORIES.find((c) => c.key === fb.category)?.label || fb.category}
                          </span>
                          <span className="fb-stars">{'★'.repeat(fb.rating)}</span>
                          <span className="fb-date">
                            {new Date(fb.createdAt).toLocaleDateString('tr-TR')}
                          </span>
                        </div>
                        <h4 className="fb-card-subject">{fb.subject}</h4>
                        <p className="fb-card-message">{fb.message}</p>
                        <div className="fb-card-foot">
                          <span className="fb-author">Gönderen: {fb.playerName}</span>
                          <span className={`fb-status-pill ${fb.status}`}>
                            {fb.status === 'new' ? 'Alındı / İncelemede' : fb.status === 'resolved' ? 'Çözüldü' : 'İnceleniyor'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
