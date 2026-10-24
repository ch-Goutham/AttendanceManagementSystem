import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import api from '../../api';
import { errMsg } from '../../lib/format';
import PasswordInput from '../../components/PasswordInput';
import GoogleSignInButton from '../../components/GoogleSignInButton';

export default function EmployeeLogin({ onAuth, currentUser }) {
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
      const { data } = await api.post('/auth/login', { ...form, portal: 'employee' });
      if (data.user?.role !== 'employee') {
        setError('This is an admin account. Please use the admin login page.');
        return;
      }
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
      const { data } = await api.post('/auth/google/login', { credential, portal: 'employee' });
      if (data.user?.role !== 'employee') {
        setError('This is an admin account. Please use the admin login page.');
        return;
      }
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
          <ClipboardCheck size={25} />
        </div>
        <p className="eyebrow">EMPLOYEE PORTAL</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to mark your attendance and apply for leave.</p>

        {currentUser?.role === 'admin' && (
          <div className="auth-note">
            Signed in as <b>{currentUser.name}</b> (administrator). Signing in here opens the
            employee portal in this tab; your admin session stays signed in on its own tab.{' '}
            <Link to="/admin">Open admin console</Link>
          </div>
        )}

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
                id="employee-remember-me"
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <label htmlFor="employee-remember-me">Remember me</label>
            </div>
            <Link className="auth-link" to="/forgot-password">
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
