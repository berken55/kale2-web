import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LobbyMember, PlayerMessage } from '@shared/players';
import { playerRequest, usePlayer } from '../player-auth';

export function lastSeenLabel(member: LobbyMember) {
  if (member.online) return 'Çevrimiçi';
  const minutes = Math.max(0, Math.floor((Date.now() - member.lastSeenAt) / 60000));
  if (minutes < 1) return 'Az önce görüldü';
  if (minutes < 60) return `${minutes} dk önce görüldü`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} sa önce görüldü`;
  return new Date(member.lastSeenAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
const mergeMessages = (old: PlayerMessage[], incoming: PlayerMessage[]) => [...new Map([...old, ...incoming].map(m => [m.id, m])).values()].sort((a, b) => a.id - b.id);
export function PlayerSocial() {
  const { player } = usePlayer();
  const [members, setMembers] = useState<LobbyMember[]>([]); const [search, setSearch] = useState(''); const [offset, setOffset] = useState(0); const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<LobbyMember | null>(null); const [messages, setMessages] = useState<PlayerMessage[]>([]); const [draft, setDraft] = useState('');
  const [listError, setListError] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [sending, setSending] = useState(false); const [older, setOlder] = useState(false); const [loadingOlder, setLoadingOlder] = useState(false);
  const selectedRef = useRef<number | null>(null); const scrollRef = useRef<HTMLDivElement>(null); const followRef = useRef(true); const lastRead = useRef(0);
  useEffect(() => {
    let alive = true, pending = false;
    const update = async () => {
      if (pending || document.hidden) return; pending = true;
      try {
        const data = await playerRequest<{ members: LobbyMember[]; hasMore: boolean }>(`/members?search=${encodeURIComponent(search)}&offset=${offset}`);
        if (alive) { setMembers(data.members); setHasMore(data.hasMore); setListError(''); setSelected(old => old ? data.members.find(m => m.id === old.id) ?? old : null); }
      } catch (e) { if (alive) setListError(e instanceof Error ? e.message : 'Oyuncular yüklenemedi.'); }
      finally { pending = false; }
    };
    setMembers([]); void update(); const timer = window.setInterval(update, 5000);
    document.addEventListener('visibilitychange', update);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [search, offset]);
  useEffect(() => {
    if (!selected) return;
    const id = selected.id; let alive = true, pending = false, initial = true;
    selectedRef.current = id; lastRead.current = 0; followRef.current = true;
    setMessages([]); setDraft(''); setError(''); setLoading(true); setOlder(false);
    const update = async () => {
      if (pending || document.hidden) return; pending = true;
      try {
        const data = await playerRequest<{ messages: PlayerMessage[]; hasMore: boolean }>(`/messages/${id}`);
        if (!alive) return;
        if (initial) { setMessages(data.messages); setOlder(data.hasMore); initial = false; }
        else setMessages(old => mergeMessages(old, data.messages));
        const incoming = data.messages.filter(m => m.recipientId === player?.id);
        const watermark = incoming.at(-1)?.id ?? 0;
        if (watermark > lastRead.current && followRef.current) {
          await playerRequest(`/messages/${id}/read`, { throughId: watermark });
          if (alive) { lastRead.current = watermark; setMembers(old => old.map(m => m.id === id ? { ...m, unread: 0 } : m)); }
        }
        if (alive) setError('');
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Mesajlar yüklenemedi.'); }
      finally { pending = false; if (alive) setLoading(false); }
    };
    void update(); const timer = window.setInterval(update, 3000); document.addEventListener('visibilitychange', update);
    return () => { alive = false; selectedRef.current = null; clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [selected?.id, player?.id]);
  useEffect(() => { if (followRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || !draft.trim() || sending) return;
    const id = selected.id; setSending(true); setError('');
    try {
      const data = await playerRequest<{ message: PlayerMessage }>(`/messages/${id}`, { body: draft.trim() });
      if (selectedRef.current === id) { followRef.current = true; setMessages(old => mergeMessages(old, [data.message])); setDraft(''); }
    } catch (e) { if (selectedRef.current === id) setError(e instanceof Error ? e.message : 'Mesaj gönderilemedi.'); }
    finally { setSending(false); }
  };
  const loadOlder = async () => {
    if (!selected || !messages.length) return;
    const id = selected.id; setLoadingOlder(true);
    try {
      const data = await playerRequest<{ messages: PlayerMessage[]; hasMore: boolean }>(`/messages/${id}?before=${messages[0].id}`);
      if (selectedRef.current === id) { followRef.current = false; setMessages(old => mergeMessages(old, data.messages)); setOlder(data.hasMore); }
    } catch (e) { if (selectedRef.current === id) setError(e instanceof Error ? e.message : 'Eski mesajlar yüklenemedi.'); }
    finally { setLoadingOlder(false); }
  };
  return <aside className="player-social" aria-label="Beta oyuncuları ve özel mesajlar"><div className="social-heading"><span>◌</span><div><h2>SAVAŞ ARKADAŞLARIN</h2><p>Beta için aynı saatte buluşun.</p></div></div><label className="member-search"><span>OYUNCU ARA</span><input value={search} maxLength={24} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Oyuncu adı…" /></label>{listError && <p className="lobby-error" role="status">{listError}</p>}<div className="member-list">{members.length === 0 && !listError && <p className="social-empty">{search ? 'Bu isimde oyuncu bulunamadı.' : 'Henüz başka bir oyuncu yok. Arkadaşını kayıt olmaya davet et.'}</p>}{members.map(member => <button key={member.id} className={`member ${selected?.id === member.id ? 'active' : ''}`} onClick={() => setSelected(member)}><span className={`member-avatar ${member.online ? 'online' : ''}`}>{member.username.slice(0, 1).toUpperCase()}</span><span><strong>{member.username}</strong><small title={new Date(member.lastSeenAt).toLocaleString('tr-TR')}>{lastSeenLabel(member)}</small></span>{member.unread > 0 && <b className="unread">{member.unread}</b>}</button>)}</div>{(offset > 0 || hasMore) && <div className="member-pagination"><button disabled={!offset} onClick={() => setOffset(n => Math.max(0, n - 50))}>← Önceki</button><button disabled={!hasMore} onClick={() => setOffset(n => n + 50)}>Sonraki →</button></div>}<p className="presence-note">Web lobisi durumu · Oyun içi çevrimiçi bilgisi değildir.</p><div className="private-chat"><div className="chat-heading"><h3>{selected ? selected.username : 'ÖZEL MESAJ'}</h3><span>{selected ? lastSeenLabel(selected) : 'Bir oyuncu seç'}</span></div><div className="chat-messages" ref={scrollRef} onScroll={e => { const el = e.currentTarget; followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70; }}>{older && <button className="older-messages" disabled={loadingOlder} onClick={loadOlder}>{loadingOlder ? 'Yükleniyor…' : 'Daha eski mesajlar ↑'}</button>}{loading && <p className="social-empty">Mesajlar yükleniyor…</p>}{!loading && messages.length === 0 && <p className="social-empty">{selected ? 'İlk mesajı sen gönder. Örneğin: “Bu akşam 21.00’de beta oynayalım mı?”' : 'Buluşma saatinizi konuşmak için listeden bir oyuncu seç.'}</p>}{messages.map(message => <div key={message.id} className={`chat-message ${message.senderId === player?.id ? 'mine' : ''}`}><p>{message.body}</p><small>{new Date(message.createdAt).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{message.senderId === player?.id && (message.readAt ? ' · Okundu' : ' · Gönderildi')}</small></div>)}</div>{error && <p className="lobby-error" role="alert">{error}</p>}<form className="chat-compose" onSubmit={send}><label className="sr-only" htmlFor="private-message">Özel mesaj</label><textarea id="private-message" disabled={!selected || sending} value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} placeholder={selected ? `${selected.username} adlı oyuncuya yaz…` : 'Önce bir oyuncu seç'} rows={2} required /><button type="submit" disabled={!selected || !draft.trim() || sending} aria-label="Mesajı gönder">{sending ? '…' : '↑'}</button></form></div></aside>;
}
