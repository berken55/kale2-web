import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, UNAUTHORIZED_EVENT } from './api';

interface AuthState {
  username: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Herkese açık wiki sayfalarında oturum kontrolüne gerek yok
    if (!window.location.pathname.startsWith('/admin')) {
      setLoading(false);
      return;
    }
    api
      .get<{ username: string }>('/api/auth/me')
      .then((r) => setUsername(r.username))
      .catch(() => setUsername(null))
      .finally(() => setLoading(false));
    const onUnauthorized = () => setUsername(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (u: string, p: string) => {
    const r = await api.post<{ username: string }>('/api/auth/login', { username: u, password: p });
    setUsername(r.username);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUsername(null);
  }, []);

  return <AuthContext.Provider value={{ username, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
