import { useState } from 'react';
import { login, register, type User } from '../auth';
import { Tabs } from '../components';

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      onLogin(mode === 'signin' ? await login(username, password) : await register(username, password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-box">
        <h1>Market Wars</h1>
        <Tabs value={mode} onChange={(m) => { setMode(m); setError(''); }} items={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} />
        <form className="stack" onSubmit={submit}>
          <label className="field"><span>Username</span>
            <input id="login-username" type="text" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="field"><span>Password</span>
            <input id="login-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {mode === 'signup' && (
            <label className="field"><span>Confirm password</span>
              <input id="login-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
          )}
          {error && <div className="alert bad small">{error}</div>}
          <button className="btn primary" type="submit" disabled={busy || !username || !password}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
      </div>
    </div>
  );
}
