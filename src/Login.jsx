import { useState } from 'react';
import { supabase } from './utils/supabase';
import { usernameToEmail } from './utils/auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
    setBusy(false);
    // Same message for wrong username or password, so the form does not reveal which one exists.
    if (error) setError(error.status === 400 ? 'Incorrect username or password.' : error.message);
  }

  return (
    <div className="login-page ds-force-light">
      <form className="ds-card login-card ds-animate-pop" onSubmit={submit}>
        <div className="ds-card-body">
          <img className="login-logo" src="/logo.png" alt="Ambot365" />
          <h1 className="ds-page-title">Prompt Workshop</h1>
          <p className="ds-page-subtitle">Sign in to open the Microsoft 365 Copilot workbook.</p>
          {error && <div className="ds-alert ds-alert-danger" role="alert">{error}</div>}
          <div>
            <label className="ds-label" htmlFor="loginUser">Username</label>
            <input className="ds-input" id="loginUser" autoComplete="username" required autoFocus value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="ds-label" htmlFor="loginPass">Password</label>
            <input className="ds-input" id="loginPass" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button className="ds-btn ds-btn-primary ds-btn-lg" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}
