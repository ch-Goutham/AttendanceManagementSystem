import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import api from '../../api';
import { errMsg } from '../../lib/format';
import PasswordInput from '../../components/PasswordInput';
import GoogleSignInButton from '../../components/GoogleSignInButton';

export default function AdminLogin({ onAuth }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', form);
      onAuth(data, remember);
    } catch (error) {
      setError(errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin(credential) {
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/google/login', { credential });
      onAuth(data, remember);
    } catch (error) {
      setError(errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-in">
        <div className="brand-mark">
          <ShieldCheck size={25} />
        </div>
        <p className="eyebrow">ADMIN CONSOLE</p>
        <h1>Administrator sign in</h1>
        <p className="muted">Sign in to manage employees, attendance and leave.</p>

        <form onSubmit={submit}>
          <label>
            Email
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={change}
              required
              autoComplete="email"
              placeholder="Please enter your email"
            />
          </label>
          <label>
            Password
            <PasswordInput
              name="password"
              value={form.password}
              onChange={change}
              minLength={8}
              required
              autoComplete="current-password"
              placeholder="Enter password"
            />
          </label>

          <div className="auth-options">
            <div className="check-inline">
              <input
                id="remember-me"
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <label htmlFor="remember-me">Remember me</label>
            </div>
            <Link className="auth-link" to="/forgot-password?from=admin">
              Forgot password?
            </Link>
          </div>

          {error && <p className="error">{error}</p>}

          <button className="primary full" disabled={busy}>
            {busy ? 'Please wait...' : 'Login'}
          </button>
        </form>

        <div className="auth-divider" />

        <GoogleSignInButton onCredential={googleLogin} onError={setError} disabled={busy} />
      </div>
    </div>
  );
}
