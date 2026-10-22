import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import api from '../../api';
import { errMsg } from '../../lib/format';
import PasswordInput from '../../components/PasswordInput';

export default function AdminLogin({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminExists, setAdminExists] = useState(true);
  const [statusLoaded, setStatusLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get('/auth/registration-status')
      .then(({ data }) => {
        if (!alive) return;
        const exists = Boolean(data.adminExists);
        setAdminExists(exists);
        setStatusLoaded(true);
        if (!exists) setMode('register');
      })
      .catch(() => {
        if (!alive) return;
        setAdminExists(true);
        setStatusLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const register = mode === 'register';
      const payload = register ? form : { email: form.email, password: form.password };
      const { data } = await api.post(register ? '/auth/register-admin' : '/auth/login', payload);
      onAuth(data);
    } catch (error) {
      setError(errMsg(error));
      if (error.response?.status === 403) {
        setAdminExists(true);
        setMode('login');
      }
    } finally {
      setBusy(false);
    }
  }

  const canRegister = statusLoaded && !adminExists;

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-in">
        <div className="brand-mark">
          <ShieldCheck size={25} />
        </div>
        <p className="eyebrow">ADMIN CONSOLE</p>
        <h1>{mode === 'register' ? 'Create admin account' : 'Administrator sign in'}</h1>
        <p className="muted">
          {mode === 'register'
            ? 'Set up the administrator for your company workspace.'
            : 'Sign in to manage employees, attendance and leave.'}
        </p>

        {canRegister && (
          <div className="auth-tabs" role="tablist" aria-label="Admin access">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Register
            </button>
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Full name
              <input
                name="name"
                value={form.name}
                onChange={change}
                required
                placeholder="Your name"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={change}
              required
              placeholder="you@company.com"
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
              placeholder="At least 8 characters"
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="primary full" disabled={busy || (mode === 'register' && !statusLoaded)}>
            {busy
              ? 'Please wait...'
              : mode === 'register'
                ? 'Create admin account'
                : 'Sign in'}
          </button>
        </form>

        <p className="auth-hint">
          <Link to="/forgot-password?from=admin">Forgot password?</Link>
        </p>

        <p className="auth-foot">
          <Link to="/login">Employee sign in</Link>
        </p>
      </div>
    </div>
  );
}
