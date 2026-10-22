import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import api from '../../api';
import { errMsg } from '../../lib/format';
import PasswordInput from '../../components/PasswordInput';
import GoogleSignInButton from '../../components/GoogleSignInButton';

const EMPTY_FORM = { name: '', phone: '', email: '', password: '', confirmPassword: '' };

// This route is intentionally not linked from anywhere in the app. Admins
// reach it by typing /admin-signup directly.
export default function AdminSignup({ onAuth }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!acceptTerms) {
      setError('You must agree to all the Terms & Conditions');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/auth/register-admin', {
        name: form.name,
        phone: form.phone,
        email: form.email,
        password: form.password,
        acceptTerms
      });
      onAuth(data, true);
    } catch (error) {
      setError(errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  async function googleSignup(credential) {
    setError('');
    if (!acceptTerms) {
      setError('Please agree to the Terms & Conditions before continuing with Google.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post('/auth/google/register-admin', {
        credential,
        phone: form.phone,
        acceptTerms
      });
      onAuth(data, true);
    } catch (error) {
      setError(errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-in auth-card-wide">
        <div className="brand-mark">
          <ShieldCheck size={25} />
        </div>
        <p className="eyebrow">ADMIN CONSOLE</p>
        <h1>Create admin account</h1>
        <p className="muted">Set up the administrator account for your workspace.</p>

        <form onSubmit={submit}>
          <label>
            Name
            <input
              name="name"
              value={form.name}
              onChange={change}
              required
              autoComplete="name"
              placeholder="Please enter your name"
            />
          </label>
          <label>
            Phone Number
            <input
              name="phone"
              type="tel"
              value={form.phone}
              onChange={change}
              required
              autoComplete="tel"
              pattern="[+()0-9\s-]{7,25}"
              title="Enter 7-15 digits. Spaces, dashes, parentheses and + are allowed."
              placeholder="Please enter your phone number"
            />
          </label>
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
              autoComplete="new-password"
              placeholder="Enter password"
            />
          </label>
          <label>
            Confirm Password
            <PasswordInput
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={change}
              minLength={8}
              required
              autoComplete="new-password"
              placeholder="Enter confirm password"
            />
          </label>

          <div className="terms-row">
            <input
              id="accept-terms"
              type="checkbox"
              checked={acceptTerms}
              onChange={(event) => setAcceptTerms(event.target.checked)}
              required
            />
            <label htmlFor="accept-terms">
              I agree to all the{' '}
              <Link to="/terms" target="_blank" rel="noreferrer">
                Terms &amp; Conditions
              </Link>
            </label>
          </div>

          {error && <p className="error">{error}</p>}

          <button className="primary full" disabled={busy}>
            {busy ? 'Please wait...' : 'Sign Up'}
          </button>
        </form>

        <div className="auth-divider" />

        <GoogleSignInButton
          onCredential={googleSignup}
          onError={setError}
          disabled={busy || !acceptTerms}
        />

        {!acceptTerms && (
          <p className="auth-note">
            Tick the Terms &amp; Conditions box above to continue with Google.
          </p>
        )}

        <p className="auth-foot">
          Already have an account? <Link to="/admin-login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
