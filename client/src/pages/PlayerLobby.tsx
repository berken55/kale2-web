import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { LobbyCharacter, PlayerClass, Specialty } from '@shared/players';
import { playerRequest, usePlayer } from '../player-auth';
import { PlayerSocial } from '../components/PlayerSocial';
import '../player-lobby.css';

const CharacterStage = lazy(() => import('../components/CharacterStage'));
const labels: Record<Specialty, string> = { body: 'BEDENSEL', mental: 'ZİHİNSEL', melee: 'YAKIN DÖVÜŞ', ranged: 'UZAK DÖVÜŞ' };
const paths: Record<PlayerClass, Specialty[]> = { warrior: ['body', 'mental'], ninja: ['melee', 'ranged'] };
export function PlayerLobby() {
  const { player, loading, error: connectionError, retry, logout } = usePlayer();
  const [kind, setKind] = useState<PlayerClass>('warrior'); const [characters, setCharacters] = useState<LobbyCharacter[]>([]); const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [characterLoading, setCharacterLoading] = useState(true);
  const [name, setName] = useState(''); const [specialty, setSpecialty] = useState<Specialty>('body'); const [createError, setCreateError] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { document.title = 'Oyuncu Lobisi · KALE2'; }, []);
  useEffect(() => {
    if (!player) return; let alive = true;
    setCharacterLoading(true);
    playerRequest<{ characters: LobbyCharacter[] }>('/characters').then(data => {
      if (!alive) return; setCharacters(data.characters);
      const first = data.characters[0]; if (first) { setSelectedId(first.id); setKind(first.class); }
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Karakterler yüklenemedi.'); }).finally(() => { if (alive) setCharacterLoading(false); });
    return () => { alive = false; };
  }, [player?.id]);
  if (loading) return <div className="player-loading">Lobi hazırlanıyor…</div>;
  if (connectionError) return <div className="player-loading"><p>{connectionError}</p><button onClick={retry}>Tekrar dene</button></div>;
  if (!player) return <Navigate to="/oyuncu/giris" replace />;
  const selected = characters.find(c => c.id === selectedId && c.class === kind);
  const visible = characters.filter(c => c.class === kind);
  const chooseClass = (value: PlayerClass) => { setKind(value); setSelectedId(characters.find(c => c.class === value)?.id ?? null); setSpecialty(paths[value][0]); };
  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setCreateError('');
    try {
      const result = await playerRequest<{ character: LobbyCharacter }>('/characters', { name, class: kind, specialty });
      setCharacters(old => [...old, result.character]); setSelectedId(result.character.id); setName(''); dialogRef.current?.close();
    } catch (e) { setCreateError(e instanceof Error ? e.message : 'Karakter oluşturulamadı.'); }
    finally { setBusy(false); }
  };
  const openCreate = () => { setSpecialty(paths[kind][0]); setCreateError(''); dialogRef.current?.showModal(); };
  return <main className="player-lobby"><nav className="lobby-rail" aria-label="Lobi gezinme"><Link to="/" className="rail-logo" aria-label="Ana sayfa">K<span>2</span></Link><Link to="/lobi" aria-label="Karakter lobisi" className="rail-active">♜</Link><Link to="/indir" aria-label="Oyunu indir">↓</Link><Link to="/wiki" aria-label="Oyun wiki">?</Link><button className="rail-exit" aria-label="Çıkış yap" onClick={() => { void logout().catch(e => setError(e instanceof Error ? e.message : 'Çıkış yapılamadı.')); }}>↪</button></nav><div className="lobby-content"><header className="lobby-top"><span>OYUNCU LOBİSİ / BETA</span><span><i /> {player.username}</span><Link to="/">ANA SAYFA ↗</Link></header><div className="lobby-layout"><section className="lobby-selection"><p className="lobby-eyebrow">İKİ KARAKTER. DÖRT YOL.</p><h1>SAVAŞTA<br /><em>İZ BIRAK.</em></h1><p className="lobby-intro">Önce karakterini hazırla.<br />Sonra savaş arkadaşlarınla buluş.</p><div className="lobby-class-tabs" role="tablist" aria-label="Karakter sınıfı">{(['warrior', 'ninja'] as const).map((value, i) => <button key={value} id={`class-${value}`} role="tab" aria-selected={kind === value} aria-controls="lobby-character-list" onClick={() => chooseClass(value)}><small>0{i + 1}</small>{value === 'warrior' ? 'SAVAŞÇI' : 'NİNJA'}</button>)}</div><div className="lobby-character-list" role="tabpanel" id="lobby-character-list" aria-labelledby={`class-${kind}`}>{characterLoading && <p>Karakterler yükleniyor…</p>}{visible.map(character => <button key={character.id} className={`lobby-character ${selected?.id === character.id ? 'selected' : ''}`} onClick={() => setSelectedId(character.id)}><span className="character-initial">{kind === 'warrior' ? 'S' : 'N'}</span><span><strong>{character.name}</strong><small>{labels[character.specialty]} · SV. 1</small></span><span className="character-select-label">{selected?.id === character.id ? '◆ SEÇİLİ' : '◇ SEÇ'}</span></button>)}{!characterLoading && visible.length === 0 && <p className="empty-characters">Bu sınıfta karakterin yok.<br />İlk savaşçını oluştur.</p>}<button className="new-character" onClick={openCreate} disabled={characters.length >= 6 || characterLoading}><span>+</span><span>YENİ KARAKTER<small>{characters.length}/6 KARAKTER YUVASI</small></span></button></div><div className="lobby-preview-note"><b>WEB LOBİSİ ÖNİZLEMESİ</b><p>İsim ve karakterlerini burada deneyebilirsin. Bu karakterler oyuna aktarılmaz; oyun içi seviyen ve ilerlemen ayrıdır.</p></div></section><section className="lobby-center" aria-label="Seçili karakterin önizlemesi"><div className="lobby-match-label"><span>HEDEF</span><strong>5v5 KALE SAVAŞI</strong><small>TAKIMINI BUL. BİRLİKTE BAŞLA.</small></div><Suspense fallback={<div className="stage-placeholder">Karakter hazırlanıyor…</div>}><CharacterStage kind={kind} /></Suspense><div className="lobby-character-caption"><p className="lobby-eyebrow">{selected ? `SEÇİLİ KARAKTER / ${selected.name}` : 'KARAKTER ÖNİZLEMESİ'}</p><h2>{kind === 'warrior' ? 'SAVAŞÇI' : 'NİNJA'}</h2><p>{kind === 'warrior' ? 'Ön safta dur. Rakibin hattını kır, takımına alan aç.' : 'Gölgelerden gözetle. Açık veren rakibi yakala.'}</p><div className="lobby-specialty-tags">{paths[kind].map(path => <span key={path} className={selected?.specialty === path ? 'active' : ''}>{labels[path]}</span>)}</div></div><div className="lobby-start"><p>Maç tarayıcıda başlamaz.<br /><b>“Maça Başla” oyun indirme sayfasını açar.</b></p><Link className="lobby-primary" to="/indir">MAÇA BAŞLA <span>↗</span></Link></div>{error && <p className="lobby-error" role="alert">{error}</p>}</section><PlayerSocial /></div></div><dialog ref={dialogRef} className="character-create-dialog"><button className="character-dialog-close" aria-label="Pencereyi kapat" onClick={() => dialogRef.current?.close()}>×</button><form onSubmit={create}><p className="lobby-eyebrow">WEB ÖNİZLEMESİ / {kind === 'warrior' ? 'SAVAŞÇI' : 'NİNJA'}</p><h2>ADINLA BAŞLA.</h2><label>KARAKTER ADI<input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={20} pattern="[\p{L}\p{N}_]+" required autoFocus placeholder="2–20 harf, rakam veya alt çizgi" /></label><label>UZMANLIK<select value={specialty} onChange={e => setSpecialty(e.target.value as Specialty)}>{paths[kind].map(p => <option key={p} value={p}>{labels[p]}</option>)}</select></label><p className="character-create-info">Bu seçim yalnızca web önizlemesinde saklanır. Gerçek oyunda uzmanlık maç başında seçilir.</p>{createError && <p role="alert" className="lobby-error">{createError}</p>}<button className="lobby-primary" disabled={busy}>{busy ? 'Oluşturuluyor…' : 'KARAKTERİ OLUŞTUR ↗'}</button></form></dialog></main>;
}
