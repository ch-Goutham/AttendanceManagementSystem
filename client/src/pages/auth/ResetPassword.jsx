import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import api from '../../api';
import { errMsg } from '../../lib/format';
import PasswordInput from '../../components/PasswordInput';
import PasswordChecklist from '../../components/PasswordChecklist';
import { passwordError } from '../../lib/password';
import { backDestination } from './ForgotPassword';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const backTo = backDestination();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    const passwordIssue = passwordError(password);
    if (passwordIssue) {
      setError(passwordIssue);
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { email, token, password });
      setDone(true);
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
          <ShieldCheck size={24} />
        </div>
        <p className="eyebrow">SET NEW PASSWORD</p>
        <h1>Reset password</h1>
        <p className="muted">Choose a new password for your account.</p>

        {done ? (
          <>
            <div className="alert success">Password updated. You can now sign in.</div>
            <p className="auth-foot">
              <Link to={backTo}>Go to sign in</Link>
            </p>
          </>
        ) : !token ? (
          <div className="alert error">
            This reset link is invalid. Request a new one from the login page.
          </div>
        ) : (
          <form onSubmit={submit}>
            <label>
              New password
              <PasswordInput
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={72}
                required
                placeholder="At least 8 characters"
              />
              <PasswordChecklist value={password} />
            </label>
            <label>
              Confirm password
              <PasswordInput
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                minLength={8}
                maxLength={72}
                required
                placeholder="Re-enter password"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary full" disabled={busy}>
              {busy ? 'Saving...' : 'Set password'}
            </button>
            <p className="auth-foot">
              <Link to={backTo}>Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
