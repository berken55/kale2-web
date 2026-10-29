import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Player } from '@shared/players';

export class PlayerApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function playerRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/players${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !['/login', '/register'].includes(path)) window.dispatchEvent(new Event('kale2:player-expired'));
    throw new PlayerApiError(response.status, data.error ?? 'İstek tamamlanamadı.');
  }
  return data as T;
}
interface PlayerAuth { player: Player | null; loading: boolean; error: string; retry: () => void; authenticate: (mode: 'login' | 'register', username: string, password: string, email?: string) => Promise<void>; logout: () => Promise<void>; }
const Context = createContext<PlayerAuth>(null!);
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    playerRequest<{ player: Player }>('/me').then(r => { if (alive) setPlayer(r.player); }).catch(e => { if (alive) { setPlayer(null); if (!(e instanceof PlayerApiError && e.status === 401)) setError('Oyuncu sunucusuna ulaşılamadı.'); } }).finally(() => { if (alive) setLoading(false); });
    const expired = () => setPlayer(null);
    window.addEventListener('kale2:player-expired', expired);
    return () => { alive = false; window.removeEventListener('kale2:player-expired', expired); };
  }, [attempt]);
  useEffect(() => {
    if (!player) return;
    const beat = () => { if (document.visibilityState === 'visible') void playerRequest('/heartbeat', {}).catch(() => {}); };
    beat(); const timer = window.setInterval(beat, 25_000);
    document.addEventListener('visibilitychange', beat);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', beat); };
  }, [player?.id]);
  const authenticate = async (mode: 'login' | 'register', username: string, password: string, email?: string) => {
    const result = await playerRequest<{ player: Player }>(`/${mode}`, { username, password, ...(mode === 'register' ? { email } : {}) });
    setError(''); setPlayer(result.player);
  };
  const logout = async () => { await playerRequest('/logout', {}); setPlayer(null); };
  return <Context.Provider value={{ player, loading, error, retry: () => setAttempt(n => n + 1), authenticate, logout }}>{children}</Context.Provider>;
}
export const usePlayer = () => useContext(Context);
