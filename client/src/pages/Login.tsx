import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { Spinner } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş başarısız.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,#2a2214,#0b0d12_60%)] p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <div className="mb-8 text-center">
          <svg viewBox="0 0 32 32" className="mx-auto h-12 w-12" aria-hidden>
            <path d="M4 28V10l4 3V6l4 3V4h8v5l4-3v7l4-3v18z" fill="#d4a53a" />
          </svg>
          <h1 className="mt-3 font-display text-2xl text-gold-300">Kale2</h1>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Yönetim Paneli</p>
        </div>
        <label className="block">
          <span className="label">Kullanıcı adı</span>
          <input className="input" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="mt-4 block">
          <span className="label">Şifre</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <button className="btn-primary mt-6 w-full" disabled={busy || !username || !password}>
          {busy && <Spinner />} Giriş yap
        </button>
      </form>
    </div>
  );
}
