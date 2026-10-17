import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Calendar from 'react-calendar';
import {
  CalendarDays,
  Users,
  ClipboardCheck,
  LogOut,
  UserRound,
  ShieldCheck,
  Plus,
  RefreshCw,
  Eye,
  EyeOff,
  Check,
  X,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Send,
  Menu,
  KeyRound,
  UserX,
  UserCheck,
  Trash2,
} from 'lucide-react';
import api from './api';
import 'react-calendar/dist/Calendar.css';

const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const errMsg = (error) =>
  error.response?.data?.message ||
  error.message ||
  'Something went wrong. Please try again.';

function randomPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/* ---------------- Toast notifications ---------------- */
const ToastContext = React.createContext(() => {});
const useToast = () => React.useContext(ToastContext);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const remove = (id) => setToasts((list) => list.filter((t) => t.id !== id));
  const notify = (type, message) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, type, message }]);
    setTimeout(() => remove(id), 4500);
  };
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => remove(t.id)}>
            <span className="toast-icon">
              {t.type === 'success' ? <CheckCircle2 size={17} /> : t.type === 'error' ? <XCircle size={17} /> : <AlertCircle size={17} />}
            </span>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------------- Confirm dialog ---------------- */
function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-badge ${danger ? 'danger' : ''}`}>{danger ? <AlertCircle size={22} /> : <ShieldCheck size={22} />}</div>
        <h3>{title}</h3>
        <p className="muted">{message}</p>
        <div className="modal-actions">
          <button className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner({ label = 'Loading...' }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" />
      <span className="spinner-label">{label}</span>
    </div>
  );
}

function PasswordInput({ value, onChange, ...props }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-field">
      <input {...props} type={show ? 'text' : 'password'} value={value} onChange={onChange} />
      <button
        type="button"
        className="eye-btn"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState('attendance');
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('attendance_user') || 'null');
    } catch {
      return null;
    }
  });

  const navigate = useNavigate();

  const signOut = () => {
    const wasAdmin = auth?.role === 'admin';
    localStorage.removeItem('attendance_token');
    localStorage.removeItem('attendance_user');
    setAuth(null);
    // Always return to the sign-in screen that matches the role: employees to
    // the employee portal, admins to the admin console. `replace` keeps the
    // protected screen out of the history so Back can't re-enter it.
    navigate(wasAdmin ? '/admin-login' : '/login', { replace: true });
  };

  const onAuth = (data) => {
    localStorage.setItem('attendance_token', data.token);
    localStorage.setItem('attendance_user', JSON.stringify(data.user));
    setAuth(data.user);
    setActivePage('attendance');
    navigate('/');
  };

  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={auth ? <Navigate to="/" replace /> : <EmployeeLogin onAuth={onAuth} />} />
        <Route path="/admin-login" element={auth ? <Navigate to="/" replace /> : <AdminLogin onAuth={onAuth} />} />
        {/* Public admin self-registration no longer exists as a page — the
            first (and only bootstrap) admin registers on /admin-login. */}
        <Route path="/register-admin" element={<Navigate to="/admin-login" replace />} />
        <Route path="/forgot-password" element={auth ? <Navigate to="/" replace /> : <ForgotPasswordPage />} />
        <Route path="/reset-password" element={auth ? <Navigate to="/" replace /> : <ResetPasswordPage />} />
        <Route
          path="/"
          element={!auth ? <Navigate to="/login" replace /> : <Navigate to={auth.role === 'admin' ? '/admin' : '/employee'} replace />}
        />
        <Route
          path="/admin"
          element={
            <RequireAuth user={auth} role="admin">
              <Shell user={auth} signOut={signOut} activePage={activePage} setActivePage={setActivePage}>
                <AdminDashboard user={auth} activePage={activePage} setActivePage={setActivePage} />
              </Shell>
            </RequireAuth>
          }
        />
        <Route
          path="/employee"
          element={
            <RequireAuth user={auth} role="employee">
              <Shell user={auth} signOut={signOut} activePage={activePage} setActivePage={setActivePage}>
                <EmployeeDashboard user={auth} activePage={activePage} />
              </Shell>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}

function RequireAuth({ user, role, children }) {
  if (!user) return <Navigate to={role === 'admin' ? '/admin-login' : '/login'} replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return children;
}

/* ---------------------------------------------------------------------------
 * Employee sign-in — the ONLY screen employees ever see. It deliberately has
 * no mention of admin accounts or registration of any kind.
 * ------------------------------------------------------------------------- */
function EmployeeLogin({ onAuth }) {
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
        <div className="brand-mark"><ClipboardCheck size={25} /></div>
        <p className="eyebrow">EMPLOYEE PORTAL</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in to mark your attendance and apply for leave.</p>

        <form onSubmit={submit}>
          <label>
            Email address
            <input name="email" type="email" value={form.email} onChange={change} required placeholder="you@company.com" />
          </label>
          <label>
            Password
            <PasswordInput name="password" value={form.password} onChange={change} minLength={8} required placeholder="Enter your password" />
          </label>

          {error && <p className="error">{error}</p>}

          <button className="primary full" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="auth-hint"><Link to="/forgot-password">Forgot password?</Link></p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Admin sign-in (+ one-time bootstrap registration). Register only appears
 * while no admin exists; after that admins are created from inside the console.
 * ------------------------------------------------------------------------- */
function AdminLogin({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Fail closed: assume registration is shut until the server says otherwise.
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
        // Fresh install: put the very first admin straight onto Register.
        if (!exists) setMode('register');
      })
      .catch(() => {
        if (!alive) return;
        setAdminExists(true);
        setStatusLoaded(true);
      });
    return () => { alive = false; };
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
        // Someone else created the first admin meanwhile — close registration.
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
        <div className="brand-mark"><ShieldCheck size={25} /></div>
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
              onClick={() => { setMode('login'); setError(''); }}
            >Sign in</button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); setError(''); }}
            >Register</button>
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Full name
              <input name="name" value={form.name} onChange={change} required placeholder="Your name" />
            </label>
          )}
          <label>
            Email address
            <input name="email" type="email" value={form.email} onChange={change} required placeholder="you@company.com" />
          </label>
          <label>
            Password
            <PasswordInput name="password" value={form.password} onChange={change} minLength={8} required placeholder="At least 8 characters" />
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

        <p className="auth-hint"><Link to="/forgot-password?from=admin">Forgot password?</Link></p>

        <p className="auth-foot"><Link to="/login">Employee sign in</Link></p>
      </div>
    </div>
  );
}

const PW_FROM_KEY = 'attendance_pw_from';
const backDestination = () => {
  try {
    return sessionStorage.getItem(PW_FROM_KEY) === 'admin' ? '/admin-login' : '/login';
  } catch {
    return '/login';
  }
};

function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const fromAdmin = searchParams.get('from') === 'admin';
  const backTo = fromAdmin ? '/admin-login' : '/login';
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Remember which sign-in screen to return to after the emailed link is used.
  useEffect(() => {
    try { sessionStorage.setItem(PW_FROM_KEY, fromAdmin ? 'admin' : 'login'); } catch { /* ignore */ }
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
        <div className="brand-mark"><Send size={24} /></div>
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Forgot password</h1>
        <p className="muted">Enter your email and we'll send you a link to set a new password.</p>

        {done ? (
          <>
            <div className="alert success">If that email is registered, a reset link has been sent. Check your inbox.</div>
            <p className="auth-foot"><Link to={backTo}>Back to sign in</Link></p>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              Email address
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary full" disabled={busy}>{busy ? 'Sending...' : 'Send reset link'}</button>
            <p className="auth-foot"><Link to={backTo}>Back to sign in</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}

function ResetPasswordPage() {
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
    if (password !== confirm) return setError('Passwords do not match');
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
        <div className="brand-mark"><ShieldCheck size={24} /></div>
        <p className="eyebrow">SET NEW PASSWORD</p>
        <h1>Reset password</h1>
        <p className="muted">Choose a new password for your account.</p>

        {done ? (
          <>
            <div className="alert success">Password updated. You can now sign in.</div>
            <p className="auth-foot"><Link to={backTo}>Go to sign in</Link></p>
          </>
        ) : !token ? (
          <div className="alert error">This reset link is invalid. Request a new one from the login page.</div>
        ) : (
          <form onSubmit={submit}>
            <label>
              New password
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required placeholder="At least 8 characters" />
            </label>
            <label>
              Confirm password
              <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required placeholder="Re-enter password" />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary full" disabled={busy}>{busy ? 'Saving...' : 'Set password'}</button>
            <p className="auth-foot"><Link to={backTo}>Back to sign in</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}

const ADMIN_NAV = [
  { key: 'attendance', label: 'Attendance', icon: <CalendarDays size={18} /> },
  { key: 'approvals', label: 'Approvals', icon: <CheckCircle2 size={18} /> },
  { key: 'employees', label: 'Employees', icon: <Users size={18} /> },
  { key: 'leaves', label: 'Leave requests', icon: <ClipboardCheck size={18} /> },
];

const EMPLOYEE_NAV = [
  { key: 'attendance', label: 'My attendance', icon: <CalendarDays size={18} /> },
  { key: 'mark', label: 'Mark attendance', icon: <ClipboardCheck size={18} /> },
  { key: 'leave', label: 'Apply leave', icon: <UserRound size={18} /> },
];

const PAGE_TITLES = {
  admin: {
    attendance: 'Attendance overview',
    approvals: 'Self-mark approvals',
    employees: 'Accounts',
    leaves: 'Leave requests',
  },
  employee: {
    attendance: 'My attendance',
    mark: 'Mark attendance',
    leave: 'Apply leave',
  },
};

function Shell({ user, signOut, children, activePage, setActivePage }) {
  const nav = user.role === 'admin' ? ADMIN_NAV : EMPLOYEE_NAV;
  const title = PAGE_TITLES[user.role]?.[activePage] || 'Workspace';
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer whenever the visible page changes.
  useEffect(() => { setMenuOpen(false); }, [activePage]);

  const selectPage = (key) => {
    setActivePage(key);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      {menuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="side-brand">
          <div className="brand-mark small"><ClipboardCheck size={20} /></div>
          <span>Attend<span className="brand-light">wise</span></span>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="side-label">WORKSPACE</div>
        {nav.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${activePage === item.key ? 'active' : ''}`}
            onClick={() => selectPage(item.key)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}

        <div className="side-bottom">
          <div className="profile-chip">
            <div className="avatar">{user.name?.[0]?.toUpperCase() || 'U'}</div>
            <div className="profile-info">
              <b>{user.name}</b>
              <small>{user.role === 'admin' ? 'Administrator' : 'Employee'}</small>
            </div>
          </div>
          <button className="logout" onClick={signOut}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="menu-btn"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div>
              <span className="breadcrumb">Workspace / </span>
              <b>{title}</b>
            </div>
          </div>
          <div className="top-user"><span className="online-dot" /> {user.email}</div>
        </header>
        {children}
      </main>
    </div>
  );
}

function statCard(label, value, icon, foot) {
  return (
    <div className="stat-card" key={label}>
      <div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{foot}</div>
    </div>
  );
}

function Status({ status }) {
  const value = status || 'Unmarked';
  const cls = String(value).toLowerCase();
  return <span className={`status status-${cls}`}>{value}</span>;
}

function AdminDashboard({ user, activePage, setActivePage }) {
  const notify = useToast();
  const [employees, setEmployees] = useState([]);
  const [month, setMonth] = useState(monthKey(new Date()));
  const [employeeId, setEmployeeId] = useState('');
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [newEmp, setNewEmp] = useState({ name: '', email: '', password: '', employeeCode: '', department: '' });
  const [mark, setMark] = useState({ employeeId: '', date: dateKey(new Date()), status: 'Present' });

  const [leaves, setLeaves] = useState([]);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('');
  const [pending, setPending] = useState([]);

  const [resetId, setResetId] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadingLeaves, setLoadingLeaves] = useState(true);
  const [loadingPending, setLoadingPending] = useState(true);

  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const askConfirm = (opts) => setConfirm(opts);
  async function runConfirm() {
    if (!confirm?.onConfirm) return;
    setConfirmBusy(true);
    try { await confirm.onConfirm(); } finally { setConfirmBusy(false); setConfirm(null); }
  }

  async function loadEmployees() {
    const { data } = await api.get('/employees');
    const list = data.employees || [];
    setEmployees(list);
    setMark((current) => ({
      ...current,
      employeeId:
        current.employeeId ||
        list.find((e) => e.role === 'employee' && e.isActive !== false)?.id ||
        '',
    }));
  }

  async function load() {
    setLoadingRecords(true);
    try {
      const params = { month };
      if (employeeId) params.employeeId = employeeId;
      const [rec, sum] = await Promise.all([
        api.get('/attendance', { params }),
        api.get('/attendance/summary', { params }),
      ]);
      setRecords(rec.data.records || []);
      setSummary(sum.data);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoadingRecords(false);
    }
  }

  async function loadLeaves() {
    setLoadingLeaves(true);
    try {
      const params = {};
      if (leaveStatusFilter) params.status = leaveStatusFilter;
      const { data } = await api.get('/leaves', { params });
      setLeaves(data.leaves || []);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoadingLeaves(false);
    }
  }

  async function loadPending() {
    setLoadingPending(true);
    try {
      const { data } = await api.get('/attendance/pending');
      setPending(data.records || []);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoadingPending(false);
    }
  }

  useEffect(() => { loadEmployees().catch((e) => notify('error', errMsg(e))); }, []);
  useEffect(() => { load(); }, [month, employeeId]);
  useEffect(() => { loadLeaves(); }, [leaveStatusFilter]);
  useEffect(() => { if (activePage === 'approvals') loadPending(); }, [activePage]);

  async function createEmployee(event) {
    event.preventDefault();
    try {
      await api.post('/employees', newEmp);
      setNewEmp({ name: '', email: '', password: '', employeeCode: '', department: '' });
      setShowForm(false);
      notify('success', 'Employee account created.');
      await loadEmployees();
    } catch (error) { notify('error', errMsg(error)); }
  }

  async function markAttendance(event) {
    event.preventDefault();
    try {
      await api.post('/attendance', mark);
      notify('success', 'Attendance saved.');
      await load();
    } catch (error) { notify('error', errMsg(error)); }
  }

  async function reviewLeave(id, action) {
    try {
      await api.patch(`/leaves/${id}/review`, { action });
      notify('success', `Leave ${action === 'approve' ? 'approved' : 'rejected'}.`);
      await Promise.all([loadLeaves(), load()]);
    } catch (error) { notify('error', errMsg(error)); }
  }

  async function reviewSelfMark(id, action) {
    try {
      await api.patch(`/attendance/${id}/review`, { action });
      notify('success', `Self-mark ${action === 'approve' ? 'confirmed' : 'rejected'}.`);
      await Promise.all([loadPending(), load()]);
    } catch (error) { notify('error', errMsg(error)); }
  }

  async function setEmployeeActive(id, isActive) {
    try {
      await api.patch(`/employees/${id}/status`, { isActive });
      notify('success', `Employee ${isActive ? 'reactivated' : 'deactivated'}.`);
      await loadEmployees();
    } catch (error) { notify('error', errMsg(error)); }
  }

  async function deleteEmployee(id) {
    try {
      await api.delete(`/employees/${id}`);
      notify('success', 'Employee account deleted.');
      if (resetId === id) { setResetId(''); setTempPassword(''); }
      if (employeeId === id) setEmployeeId('');
      await Promise.all([loadEmployees(), load(), loadPending(), loadLeaves()]);
    } catch (error) { notify('error', errMsg(error)); }
  }

  async function submitReset(event) {
    event.preventDefault();
    setResetBusy(true);
    try {
      await api.patch(`/employees/${resetId}/password`, { password: tempPassword });
      notify('success', 'Password reset successfully.');
      setResetId(''); setTempPassword('');
    } catch (error) { notify('error', errMsg(error)); }
    finally { setResetBusy(false); }
  }

  function startReset(id) { setResetId(id); setTempPassword(randomPassword()); }

  // The directory lists employees AND admins; attendance/leave flows only
  // ever apply to people with the employee role.
  const employeeList = employees.filter((e) => e.role === 'employee');
  const activeEmployees = employeeList.filter((e) => e.isActive !== false);
  const resetTarget = employees.find((e) => e.id === resetId);
  const isSelf = (id) => String(id) === String(user?.id);

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>{PAGE_TITLES.admin[activePage]}</h1>
          <p className="muted">
            {activePage === 'attendance' && 'Manage your team and keep daily attendance up to date.'}
            {activePage === 'approvals' && 'Confirm attendance employees marked themselves.'}
            {activePage === 'employees' && 'Create employee accounts, reset passwords and handle resignations.'}
            {activePage === 'leaves' && "Review and approve your team's leave applications."}
          </p>
        </div>
        {activePage === 'attendance' && (
          <button className="primary" onClick={() => { setActivePage('employees'); setShowForm(true); }}>
            <Plus size={17} /> Add account
          </button>
        )}
      </div>

      {activePage === 'attendance' && (
        <>
          <div className="stats-grid">
            {statCard('Team members', employeeList.length, <Users size={19} />, 'Total employee accounts')}
            {statCard('Present days', summary?.present ?? 0, <ClipboardCheck size={19} />, `${month} reporting period`)}
            {statCard('Absent days', summary?.absent ?? 0, <CalendarDays size={19} />, 'Recorded absences')}
            {statCard('Attendance rate', `${summary?.attendancePercentage ?? 0}%`, <ShieldCheck size={19} />, 'Present ÷ (present + absent)')}
          </div>

          {summary?.pending > 0 && (
            <div className="alert info"><AlertCircle size={15} /> {summary.pending} self-mark(s) await your approval in <b>Approvals</b>.</div>
          )}

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Mark attendance</h2>
                <p className="muted small-text">Select an employee, date and status. Saving again updates that date.</p>
              </div>
            </div>
            <form className="mark-grid" onSubmit={markAttendance}>
              <label>
                Employee
                <select required value={mark.employeeId} onChange={(e) => setMark({ ...mark, employeeId: e.target.value })}>
                  <option value="">Select employee</option>
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}{e.employeeCode ? ` (${e.employeeCode})` : ''}</option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" required value={mark.date} onChange={(e) => setMark({ ...mark, date: e.target.value })} />
              </label>
              <label>
                Status
                <select value={mark.status} onChange={(e) => setMark({ ...mark, status: e.target.value })}>
                  <option>Present</option><option>Absent</option><option>Leave</option>
                </select>
              </label>
              <button className="primary" disabled={activeEmployees.length === 0}>Save attendance</button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-heading responsive-heading">
              <div>
                <h2>Attendance records</h2>
                <p className="muted small-text">Review records for the selected month.</p>
              </div>
              <div className="filters">
                <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">All employees</option>
                  {employeeList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <button className="icon-btn" onClick={load} title="Refresh" type="button"><RefreshCw size={16} /></button>
              </div>
            </div>
            <div className="table-wrap">
              {loadingRecords ? (
                <Spinner label="Loading records..." />
              ) : (
                <table>
                  <thead>
                    <tr><th>Employee</th><th>Date</th><th>Department</th><th>Status</th><th>Approval</th></tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r._id}>
                        <td>
                          <div className="employee-cell">
                            <div className="avatar tiny">{r.employee?.name?.[0]?.toUpperCase() || 'E'}</div>
                            <div><b>{r.employee?.name || 'Employee'}</b><small>{r.employee?.email}</small></div>
                          </div>
                        </td>
                        <td>{r.date}</td>
                        <td>{r.employee?.department || '—'}</td>
                        <td><Status status={r.status} /></td>
                        <td><Status status={r.approval} /></td>
                      </tr>
                    ))}
                    {!records.length && <tr><td colSpan="5" className="empty">No attendance records for this month yet.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {activePage === 'approvals' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Self-mark approvals</h2>
              <p className="muted small-text">Only confirmed marks count toward attendance. Rejecting removes the claim.</p>
            </div>
            <button className="icon-btn" onClick={loadPending} title="Refresh" type="button"><RefreshCw size={16} /></button>
          </div>
          <div className="table-wrap">
            {loadingPending ? (
              <Spinner label="Loading approvals..." />
            ) : (
              <table>
                <thead>
                  <tr><th>Employee</th><th>Date</th><th>Marked</th><th>Submitted</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {pending.map((r) => (
                    <tr key={r._id}>
                      <td>
                        <div className="employee-cell">
                          <div className="avatar tiny">{r.employee?.name?.[0]?.toUpperCase() || 'E'}</div>
                          <div><b>{r.employee?.name || 'Employee'}</b><small>{r.employee?.department || r.employee?.email}</small></div>
                        </div>
                      </td>
                      <td>{r.date}</td>
                      <td><Status status={r.status} /></td>
                      <td>{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—'}</td>
                      <td>
                        <div className="row-actions">
                          <button className="approve-btn" onClick={() => reviewSelfMark(r._id, 'approve')}><Check size={14} /> Confirm</button>
                          <button
                            className="reject-btn"
                            onClick={() =>
                              askConfirm({
                                title: 'Reject this self-mark?',
                                message: `${r.employee?.name || 'This employee'} marked ${r.date} as ${r.status}. Rejecting removes the record so it won't count as attendance.`,
                                confirmLabel: 'Reject',
                                danger: true,
                                onConfirm: () => reviewSelfMark(r._id, 'reject'),
                              })
                            }
                          ><X size={14} /> Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pending.length && <tr><td colSpan="5" className="empty">No self-marks awaiting approval.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {activePage === 'employees' && (
        <>
          {resetTarget && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Reset password for {resetTarget.name}</h2>
                  <p className="muted small-text">Set a new temporary password and share it with the employee out-of-band.</p>
                </div>
              </div>
              <form className="reset-form" onSubmit={submitReset}>
                <label>
                  New temporary password
                  <PasswordInput value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} minLength={8} required placeholder="At least 8 characters" />
                </label>
                <div className="form-actions">
                  <button type="button" className="secondary" onClick={() => setTempPassword(randomPassword())}>Generate</button>
                  <button className="primary" disabled={resetBusy}>{resetBusy ? 'Saving...' : 'Set password'}</button>
                  <button type="button" className="secondary" onClick={() => { setResetId(''); setTempPassword(''); }}>Cancel</button>
                </div>
              </form>
            </section>
          )}

          {showForm && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Create account</h2>
                  <p className="muted small-text">Create an employee account. Employees sign in to mark their own attendance and apply for leave.</p>
                </div>
              </div>
              <form className="form-grid" onSubmit={createEmployee}>
                {[['name', 'Full name'], ['email', 'Email'], ['password', 'Temporary password'], ['employeeCode', 'Employee ID'], ['department', 'Department']].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    {key === 'password' ? (
                      <PasswordInput required minLength={8} value={newEmp.password} onChange={(e) => setNewEmp({ ...newEmp, password: e.target.value })} placeholder={label} />
                    ) : (
                      <input required={['name', 'email'].includes(key)} type={key === 'email' ? 'email' : 'text'} value={newEmp[key]} onChange={(e) => setNewEmp({ ...newEmp, [key]: e.target.value })} placeholder={label} />
                    )}
                  </label>
                ))}
                <div className="form-actions">
                  <button className="primary">Create employee</button>
                  <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
                </div>
              </form>
            </section>
          )}

          <div className="page-heading" style={{ marginBottom: '16px' }}>
            <div />
            <button className="primary" onClick={() => setShowForm((s) => !s)}><Plus size={17} /> Add account</button>
          </div>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2 id="employee-directory">Accounts</h2>
                <p className="muted small-text">Employees and administrators. Deactivate someone who has resigned; reactivate to restore access.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th><th>Role</th><th>Employee ID</th><th>Email</th><th>Department</th><th>Account</th>
                    <th className="col-action">Reset</th>
                    <th className="col-action">Deactivate</th>
                    <th className="col-action">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id}>
                      <td><b>{e.name}</b>{isSelf(e.id) && <span className="muted small-text"> · you</span>}</td>
                      <td><Status status={e.role === 'admin' ? 'Admin' : 'Employee'} /></td>
                      <td>{e.employeeCode || '—'}</td>
                      <td>{e.email}</td>
                      <td>{e.department || '—'}</td>
                      <td><Status status={e.isActive === false ? 'Resigned' : 'Active'} /></td>
                      <td className="col-action">
                        <button className="link-btn" title="Reset password" onClick={() => startReset(e.id)} disabled={resetId === e.id}>
                          <KeyRound size={14} /> Reset
                        </button>
                      </td>
                      <td className="col-action">
                        {e.isActive === false ? (
                          <button className="link-btn" title="Reactivate account" onClick={() => setEmployeeActive(e.id, true)}>
                            <UserCheck size={14} /> Reactivate
                          </button>
                        ) : isSelf(e.id) ? (
                          <span className="muted small-text">You</span>
                        ) : (
                          <button
                            className="link-btn danger-text"
                            title="Deactivate account"
                            onClick={() =>
                              askConfirm({
                                title: 'Deactivate account?',
                                message: `${e.name} will no longer be able to sign in. Their attendance and leave history are kept.`,
                                confirmLabel: 'Deactivate',
                                danger: true,
                                onConfirm: () => setEmployeeActive(e.id, false),
                              })
                            }
                          ><UserX size={14} /> Deactivate</button>
                        )}
                      </td>
                      <td className="col-action">
                        {e.role === 'employee' ? (
                          <button
                            className="link-btn danger-text"
                            title="Delete employee"
                            onClick={() =>
                              askConfirm({
                                title: 'Delete employee permanently?',
                                message: `${e.name}, their attendance and their leave records will be permanently removed. This cannot be undone.`,
                                confirmLabel: 'Delete',
                                danger: true,
                                onConfirm: () => deleteEmployee(e.id),
                              })
                            }
                          ><Trash2 size={14} /> Delete</button>
                        ) : (
                          <span className="muted small-text">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!employees.length && <tr><td colSpan="9" className="empty">No accounts yet. Add your first employee above.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activePage === 'leaves' && (
        <section className="panel">
          <div className="panel-heading responsive-heading">
            <div>
              <h2>Leave requests</h2>
              <p className="muted small-text">Approving records the range as Leave in attendance.</p>
            </div>
            <div className="filters">
              <select value={leaveStatusFilter} onChange={(e) => setLeaveStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
              <button className="icon-btn" onClick={loadLeaves} title="Refresh" type="button"><RefreshCw size={16} /></button>
            </div>
          </div>
          <div className="table-wrap">
            {loadingLeaves ? (
              <Spinner label="Loading leave requests..." />
            ) : (
              <table>
                <thead>
                  <tr><th>Employee</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {leaves.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="employee-cell">
                          <div className="avatar tiny">{l.employee?.name?.[0]?.toUpperCase() || 'E'}</div>
                          <div><b>{l.employee?.name || 'Employee'}</b><small>{l.employee?.department || l.employee?.email}</small></div>
                        </div>
                      </td>
                      <td>{l.startDate}</td>
                      <td>{l.endDate}</td>
                      <td>{l.reason}</td>
                      <td><Status status={l.status} /></td>
                      <td>
                        {l.status === 'Pending' ? (
                          <div className="row-actions">
                            <button className="approve-btn" onClick={() => reviewLeave(l.id, 'approve')}><Check size={14} /> Approve</button>
                            <button
                              className="reject-btn"
                              onClick={() =>
                                askConfirm({
                                  title: 'Reject leave request?',
                                  message: `${l.employee?.name || 'This employee'} requested leave from ${l.startDate} to ${l.endDate}.`,
                                  confirmLabel: 'Reject',
                                  danger: true,
                                  onConfirm: () => reviewLeave(l.id, 'reject'),
                                })
                              }
                            ><X size={14} /> Reject</button>
                          </div>
                        ) : (
                          <span className="muted small-text">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!leaves.length && <tr><td colSpan="6" className="empty">No leave requests found.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        busy={confirmBusy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function EmployeeDashboard({ user, activePage }) {
  const notify = useToast();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeDate, setActiveDate] = useState(new Date());
  const [mark, setMark] = useState({ date: dateKey(new Date()), status: 'Present' });
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const askConfirm = (opts) => setConfirm(opts);
  async function runConfirm() {
    if (!confirm?.onConfirm) return;
    setConfirmBusy(true);
    try { await confirm.onConfirm(); } finally { setConfirmBusy(false); setConfirm(null); }
  }

  async function load() {
    setLoading(true);
    try {
      const [cal, sum] = await Promise.all([
        api.get('/attendance/calendar', { params: { month } }),
        api.get('/attendance/summary', { params: { month } }),
      ]);
      setRecords(cal.data.records || []);
      setSummary(sum.data);
    } catch (error) { notify('error', errMsg(error)); }
    finally { setLoading(false); }
  }

  async function loadLeaves() {
    try {
      const { data } = await api.get('/leaves');
      setLeaves(data.leaves || []);
    } catch (error) { notify('error', errMsg(error)); }
  }

  useEffect(() => { load(); }, [month]);
  useEffect(() => { loadLeaves(); }, []);

  async function markOwnAttendance(event) {
    event.preventDefault();
    try {
      await api.post('/attendance', mark);
      notify('success', 'Submitted for admin approval.');
      await load();
    } catch (error) { notify('error', errMsg(error)); }
  }

  async function applyLeave(event) {
    event.preventDefault();
    try {
      await api.post('/leaves', leaveForm);
      notify('success', 'Leave request submitted.');
      setLeaveForm({ startDate: '', endDate: '', reason: '' });
      await loadLeaves();
    } catch (error) { notify('error', errMsg(error)); }
  }

  async function withdrawLeave(id) {
    try {
      await api.delete(`/leaves/${id}`);
      notify('success', 'Leave request withdrawn.');
      await loadLeaves();
    } catch (error) { notify('error', errMsg(error)); }
  }

  const byDate = useMemo(() => Object.fromEntries(records.map((r) => [r.date, r])), [records]);

  const tileClassName = ({ date, view }) => {
    if (view !== 'month') return null;
    const r = byDate[dateKey(date)];
    if (!r) return null;
    if (r.approval === 'pending') return 'calendar-pending';
    if (r.approval === 'rejected') return 'calendar-rejected';
    return `calendar-${r.status.toLowerCase()}`;
  };

  const selected = byDate[dateKey(activeDate)];
  const approvalLabel = selected ? (selected.approval === 'pending' ? 'Pending approval' : selected.approval === 'rejected' ? 'Rejected' : 'Confirmed') : '';

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EMPLOYEE WORKSPACE</p>
          <h1>{PAGE_TITLES.employee[activePage]}</h1>
          <p className="muted">
            {activePage === 'attendance' && `Hi ${user.name}, here is your attendance summary.`}
            {activePage === 'mark' && 'Record your own attendance for a day.'}
            {activePage === 'leave' && 'Submit a leave request and track its status.'}
          </p>
        </div>
        {activePage === 'attendance' && (
          <div className="month-control">
            <CalendarDays size={17} />
            <input
              type="month"
              value={month}
              onChange={(e) => {
                const next = e.target.value;
                if (next) { setMonth(next); setActiveDate(new Date(`${next}-01T12:00:00`)); }
              }}
            />
          </div>
        )}
      </div>

      {activePage === 'attendance' && (
        <>
          <div className="stats-grid employee-stats">
            {statCard('Present days', summary?.present ?? 0, <ClipboardCheck size={19} />, 'Confirmed present')}
            {statCard('Absent days', summary?.absent ?? 0, <CalendarDays size={19} />, 'Confirmed absent')}
            {statCard('Leave days', summary?.leave ?? 0, <UserRound size={19} />, 'Approved leave')}
            {statCard('Attendance rate', `${summary?.attendancePercentage ?? 0}%`, <ShieldCheck size={19} />, 'Present ÷ (present + absent)')}
          </div>

          {summary?.pending > 0 && (
            <div className="alert info"><Clock size={15} /> {summary.pending} self-mark(s) awaiting admin approval.</div>
          )}

          <div className="calendar-layout">
            <section className="panel calendar-panel">
              <div className="panel-heading">
                <div>
                  <h2>Attendance calendar</h2>
                  <p className="muted small-text">Choose a date to see its attendance status.</p>
                </div>
              </div>
              {loading ? (
                <Spinner label="Loading calendar..." />
              ) : (
                <Calendar value={activeDate} onActiveStartDateChange={({ activeStartDate }) => { if (activeStartDate) { const nm = monthKey(activeStartDate); if (nm !== month) setMonth(nm); } }} onChange={setActiveDate} tileClassName={tileClassName} />
              )}
            </section>

            <section className="panel calendar-details">
              <h2>Calendar legend</h2>
              <div className="legend-row"><span className="legend-swatch present" /><span>Present</span><b>{summary?.present ?? 0}</b></div>
              <div className="legend-row"><span className="legend-swatch absent" /><span>Absent</span><b>{summary?.absent ?? 0}</b></div>
              <div className="legend-row"><span className="legend-swatch leave" /><span>Leave</span><b>{summary?.leave ?? 0}</b></div>
              <div className="legend-row"><span className="legend-swatch pending" /><span>Pending</span><b>{summary?.pending ?? 0}</b></div>

              <div className="selected-date">
                <span className="eyebrow">SELECTED DATE</span>
                <h3>{activeDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</h3>
                {selected ? (
                  <>
                    <Status status={selected.status} />
                    {selected.approval !== 'confirmed' && <span className={`status ml-8 status-${selected.approval}`}>{approvalLabel}</span>}
                  </>
                ) : (
                  <span className="status status-unmarked">Not marked</span>
                )}
              </div>

              <div className="percentage-box">
                <span>Monthly attendance</span>
                <strong>{summary?.attendancePercentage ?? 0}%</strong>
                <div className="progress"><span style={{ width: `${Math.min(100, summary?.attendancePercentage ?? 0)}%` }} /></div>
                <small>Based on days confirmed Present or Absent.</small>
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Recent attendance</h2>
                <p className="muted small-text">Your latest marked days for this month.</p>
              </div>
            </div>
            <div className="table-wrap">
              {loading ? (
                <Spinner label="Loading..." />
              ) : (
                <table>
                  <thead><tr><th>Date</th><th>Status</th><th>Approval</th></tr></thead>
                  <tbody>
                    {[...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((r) => (
                      <tr key={r.date}>
                        <td>{r.date}</td>
                        <td><Status status={r.status} /></td>
                        <td><Status status={r.approval} /></td>
                      </tr>
                    ))}
                    {!records.length && <tr><td colSpan="3" className="empty">No attendance has been recorded for this month.</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {activePage === 'mark' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Mark attendance</h2>
              <p className="muted small-text">Record your own day as Present or Absent. Your admin confirms it before it counts.</p>
            </div>
          </div>
          <form className="mark-grid" onSubmit={markOwnAttendance}>
            <label>
              Date
              <input type="date" required value={mark.date} onChange={(e) => setMark({ ...mark, date: e.target.value })} />
            </label>
            <label>
              Status
              <select value={mark.status} onChange={(e) => setMark({ ...mark, status: e.target.value })}>
                <option>Present</option><option>Absent</option>
              </select>
            </label>
            <button className="primary">Submit for approval</button>
          </form>
        </section>
      )}

      {activePage === 'leave' && (
        <>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Apply for leave</h2>
                <p className="muted small-text">Choose the dates and give a reason. Your admin will review it.</p>
              </div>
            </div>
            <form className="mark-grid" onSubmit={applyLeave}>
              <label>
                From
                <input type="date" required value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
              </label>
              <label>
                To
                <input type="date" required value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} />
              </label>
              <label>
                Reason
                <input required value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Why are you taking leave?" />
              </label>
              <button className="primary">Submit request</button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>My leave requests</h2>
                <p className="muted small-text">Track the status of your leave applications.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>From</th><th>To</th><th>Reason</th><th>Status</th><th>Review note</th><th>Actions</th></tr></thead>
                <tbody>
                  {leaves.map((l) => (
                    <tr key={l.id}>
                      <td>{l.startDate}</td>
                      <td>{l.endDate}</td>
                      <td>{l.reason}</td>
                      <td><Status status={l.status} /></td>
                      <td>{l.reviewNote || '—'}</td>
                      <td>
                        {l.status === 'Pending' ? (
                          <button
                            className="link-btn danger-text"
                            onClick={() =>
                              askConfirm({
                                title: 'Withdraw leave request?',
                                message: `Your request from ${l.startDate} to ${l.endDate} will be removed.`,
                                confirmLabel: 'Withdraw',
                                danger: true,
                                onConfirm: () => withdrawLeave(l.id),
                              })
                            }
                          >Withdraw</button>
                        ) : (
                          <span className="muted small-text">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!leaves.length && <tr><td colSpan="6" className="empty">You have not applied for any leave yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        danger={confirm?.danger}
        busy={confirmBusy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

export default App;
