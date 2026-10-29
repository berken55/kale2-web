import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { usePlayer } from '../player-auth';
import '../player-lobby.css';

export function PlayerAccount({ register = false }: { register?: boolean }) {
  const { player, loading, authenticate } = usePlayer();
  const [username, setUsername] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (loading) return <div className="player-loading">Oturum kontrol ediliyor…</div>;
  if (player) return <Navigate to="/lobi" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (register && password !== confirm) { setError('Şifreler eşleşmiyor.'); return; }
    setBusy(true);
    try { await authenticate(register ? 'register' : 'login', username.trim(), password, email.trim()); }
    catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.'); }
    finally { setBusy(false); }
  };
  return <main className="player-account"><div className="account-story"><Link to="/" className="lobby-brand">KALE<span>2</span></Link><p className="lobby-eyebrow">İKİ KALE. YARIM KALAN BİR YEMİN.</p><h1>TAKIMIN<br /><em>SENİ BEKLİYOR.</em></h1><p>Karakterini hazırla. Savaş arkadaşlarını bul.<br />Bir sonraki beta buluşmasını birlikte planla.</p><span className="account-bottom">5v5 · KALE SAVAŞI · TAKIM RUHU</span></div><div className="account-form-wrap"><Link to="/" className="lobby-back">← Ana sayfa</Link><form className="account-form" onSubmit={submit}><p className="lobby-eyebrow">OYUNCU HESABI</p><h2>{register ? 'YERİNİ AL.' : 'TEKRAR HOŞ GELDİN.'}</h2><p>{register ? 'Kayıt tamamlanınca doğrudan oyuncu lobisine gireceksin.' : 'Karakterlerin ve mesajların seni bekliyor. Oyuncu adın veya e-postanla giriş yapabilirsin.'}</p><label>OYUNCU ADI<input autoComplete="username" required minLength={3} maxLength={register ? 24 : 254} pattern={register ? "[a-zA-Z0-9_]+" : undefined} value={username} onChange={e => setUsername(e.target.value)} placeholder="3–24 harf, rakam veya alt çizgi" /></label>{register && <label>E-POSTA<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="oyuncu@ornek.com" /></label>}<label>ŞİFRE<input type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : 6} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder={register ? 'En az 8 karakter' : 'Şifreniz'} /></label>{register && <label>ŞİFRE TEKRAR<input type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>}{error && <p role="alert" className="lobby-error">{error}</p>}<button className="lobby-primary" disabled={busy}>{busy ? 'Lütfen bekle…' : register ? 'KAYIT OL VE LOBİYE GİR ↗' : 'LOBİYE GİR ↗'}</button><p className="account-switch">{register ? 'Zaten hesabın var mı?' : 'Henüz hesabın yok mu?'} <Link to={register ? '/oyuncu/giris' : '/oyuncu/kayit'}>{register ? 'Giriş yap' : 'Kayıt ol'}</Link></p><p className="account-note">Web karakterleri beta önizlemesidir. Oyun içi karakter veya ilerleme oluşturmaz. Oyuncu adın, çevrimiçi durumun ve son görülmen giriş yapan diğer beta oyuncularına görünür.</p></form></div></main>;
}
