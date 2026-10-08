import { useState } from 'react';
import { login, register, type Profile, type User } from '../auth';
import { Tabs } from '../components';

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [profile, setProfile] = useState<Profile>({ fullName: '', studentId: '', email: '', cohort: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setP = (patch: Partial<Profile>) => setProfile({ ...profile, ...patch });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && password !== confirm) { setError('Passwords do not match'); return; }
    setBusy(true);
    try {
      onLogin(mode === 'signin' ? await login(username, password) : await register(username, password, profile));
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
        <Tabs value={mode} onChange={(m) => { setMode(m); setError(''); }} items={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Student sign-up' }]} />
        <form className="stack" onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label className="field"><span>Full name</span><input id="reg-fullname" type="text" autoComplete="name" value={profile.fullName} onChange={(e) => setP({ fullName: e.target.value })} /></label>
              <div className="form-grid">
                <label className="field"><span>Student ID</span><input id="reg-studentid" type="text" value={profile.studentId} onChange={(e) => setP({ studentId: e.target.value })} /></label>
                <label className="field"><span>Class / cohort</span><input id="reg-cohort" type="text" value={profile.cohort} onChange={(e) => setP({ cohort: e.target.value })} /></label>
              </div>
              <label className="field"><span>Email</span><input id="reg-email" type="email" autoComplete="email" value={profile.email} onChange={(e) => setP({ email: e.target.value })} /></label>
            </>
          )}
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
