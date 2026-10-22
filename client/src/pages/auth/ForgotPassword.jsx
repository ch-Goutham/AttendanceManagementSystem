import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Send } from 'lucide-react';
import api from '../../api';
import { errMsg } from '../../lib/format';

const PW_FROM_KEY = 'attendance_pw_from';

export function backDestination() {
  try {
    return sessionStorage.getItem(PW_FROM_KEY) === 'admin' ? '/admin-login' : '/login';
  } catch {
    return '/login';
  }
}

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const fromAdmin = searchParams.get('from') === 'admin';
  const backTo = fromAdmin ? '/admin-login' : '/login';
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      sessionStorage.setItem(PW_FROM_KEY, fromAdmin ? 'admin' : 'login');
    } catch {
      /* ignore */
    }
  }, [fromAdmin]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
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
          <Send size={24} />
        </div>
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Forgot password</h1>
        <p className="muted">Enter your email and we'll send you a link to set a new password.</p>

        {done ? (
          <>
            <div className="alert success">
              If that email is registered, a reset link has been sent. Check your inbox.
            </div>
            <p className="auth-foot">
              <Link to={backTo}>Back to sign in</Link>
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="you@company.com"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary full" disabled={busy}>
              {busy ? 'Sending...' : 'Send reset link'}
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
