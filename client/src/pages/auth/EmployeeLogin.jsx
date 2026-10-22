import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import api from '../../api';
import { errMsg } from '../../lib/format';
import PasswordInput from '../../components/PasswordInput';

export default function EmployeeLogin({ onAuth }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', form);
      onAuth(data);
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

        <form onSubmit={submit}>
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
              placeholder="Enter your password"
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="primary full" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="auth-hint">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
      </div>
    </div>
  );
}
