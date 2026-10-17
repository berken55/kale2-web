import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { Brand, Spinner } from '../components/ui';

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
    <div className="app-bg flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <div className="mb-8 text-center">
          <h1>
            <Brand tagline="Yönetim Paneli" size="lg" />
          </h1>
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
