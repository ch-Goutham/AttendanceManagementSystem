import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import BackendNotice from './components/BackendNotice';
import Shell from './components/Shell';
import Spinner from './components/Spinner';
import EmployeeLogin from './pages/auth/EmployeeLogin';
import AdminLogin from './pages/auth/AdminLogin';
import AdminSignup from './pages/auth/AdminSignup';
import ForgotPasswordPage from './pages/auth/ForgotPassword';
import ResetPasswordPage from './pages/auth/ResetPassword';
import Terms from './pages/Terms';
import api from './api';
import { clearAuth, readAuth, saveAuth, updateAuthUser } from './lib/authStorage';
import Dashboard from './pages/admin/Dashboard';
import Employees from './pages/admin/Employees';
import Attendance from './pages/admin/Attendance';
import LeaveManagement from './pages/admin/LeaveManagement';
import Reports from './pages/admin/Reports';
import MarkAttendance from './pages/employee/MarkAttendance';
import ApplyLeave from './pages/employee/ApplyLeave';
import ApplyPermission from './pages/employee/ApplyPermission';
import EmployeeDashboard from './pages/employee/Dashboard';

const DEFAULT_PAGE = { admin: 'dashboard', employee: 'dashboard' };
const HOME_FOR_ROLE = { admin: '/admin', employee: '/employee' };

function AdminWorkspace({ user, activePage, setActivePage }) {
  if (activePage === 'employees') return <Employees />;
  if (activePage === 'attendance') return <Attendance />;
  if (activePage === 'leaves') return <LeaveManagement />;
  if (activePage === 'reports') return <Reports />;
  return <Dashboard user={user} onNavigate={setActivePage} />;
}

function EmployeeWorkspace({ user, activePage, setActivePage }) {
  if (activePage === 'mark') return <MarkAttendance />;
  if (activePage === 'leave') return <ApplyLeave />;
  if (activePage === 'permission') return <ApplyPermission />;
  return <EmployeeDashboard user={user} onNavigate={setActivePage} />;
}

function App() {
  const [initial] = useState(() => readAuth());
  const [auth, setAuth] = useState(initial?.user || null);
  // A stored session is only a claim until GET /auth/me confirms it.
  const [checking, setChecking] = useState(Boolean(initial?.token));
  const [activePage, setActivePage] = useState(
    () => DEFAULT_PAGE[initial?.user?.role] || 'dashboard'
  );
  const authRef = useRef(auth);
  const navigate = useNavigate();

  useEffect(() => {
    authRef.current = auth;
  }, [auth]);

  // Verify the saved session with the server before rendering any workspace.
  // This is what stops an expired or tampered admin session from opening /admin.
  useEffect(() => {
    if (!checking) return undefined;

    let alive = true;
    api
      .get('/auth/me')
      .then(({ data }) => {
        if (!alive) return;
        const user = data?.user;
        const stored = readAuth();
        if (!user || !stored || stored.user.role !== user.role) {
          clearAuth();
          setAuth(null);
          return;
        }
        updateAuthUser(user);
        setAuth(user);
        setActivePage(DEFAULT_PAGE[user.role] || 'dashboard');
      })
      .catch((error) => {
        if (!alive) return;
        // A temporary outage should not destroy a session that is probably
        // still valid; only an auth rejection clears it.
        const status = error.response?.status;
        if (status === 401 || status === 403) clearAuth();
        setAuth(null);
      })
      .finally(() => {
        if (alive) setChecking(false);
      });

    return () => {
      alive = false;
    };
  }, [checking]);

  // Any API call that returns 401 drops the session so the UI cannot keep
  // showing an admin/employee workspace with a dead token.
  useEffect(() => {
    const onExpired = () => {
      const wasAdmin = authRef.current?.role === 'admin';
      setAuth(null);
      setActivePage('dashboard');
      navigate(wasAdmin ? '/admin-login' : '/login', { replace: true });
    };
    window.addEventListener('attendance:auth-expired', onExpired);
    return () => window.removeEventListener('attendance:auth-expired', onExpired);
  }, [navigate]);

  // Keep tabs in sync when the session is replaced or cleared in another tab.
  useEffect(() => {
    const onStorage = () => {
      const next = readAuth();
      setAuth(next?.user || null);
      setActivePage(DEFAULT_PAGE[next?.user?.role] || 'dashboard');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const signOut = () => {
    const wasAdmin = authRef.current?.role === 'admin';
    clearAuth();
    setAuth(null);
    setActivePage('dashboard');
    navigate(wasAdmin ? '/admin-login' : '/login', { replace: true });
  };

  const onAuth = (data, remember = true) => {
    saveAuth(data, remember);
    setAuth(data.user);
    setActivePage(DEFAULT_PAGE[data.user.role] || 'dashboard');
    navigate(HOME_FOR_ROLE[data.user.role] || '/login', { replace: true });
  };

  if (checking) {
    return (
      <div className="auth-wrap">
        <div className="auth-card auth-card-splash">
          <Spinner label="Checking your session..." />
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <BackendNotice />
      <Routes>
        {/*
          Portal rules:
          - /login only auto-opens the employee workspace. An admin sees the
            employee sign-in form so they can switch accounts.
          - /admin-login is the only entry point to the admin console.
          - / (the base link) never opens the admin console.
        */}
        <Route
          path="/login"
          element={
            auth?.role === 'employee' ? (
              <Navigate to="/employee" replace />
            ) : (
              <EmployeeLogin onAuth={onAuth} currentUser={auth} />
            )
          }
        />
        <Route
          path="/admin-login"
          element={
            auth?.role === 'admin' ? (
              <Navigate to="/admin" replace />
            ) : (
              <AdminLogin onAuth={onAuth} currentUser={auth} />
            )
          }
        />
        <Route
          path="/admin-signup"
          element={
            auth?.role === 'admin' ? (
              <Navigate to="/admin" replace />
            ) : (
              <AdminSignup onAuth={onAuth} currentUser={auth} />
            )
          }
        />
        <Route path="/register-admin" element={<Navigate to="/admin-signup" replace />} />
        <Route path="/terms" element={<Terms />} />
        <Route
          path="/forgot-password"
          element={
            auth ? (
              <Navigate to={auth.role === 'employee' ? '/employee' : '/login'} replace />
            ) : (
              <ForgotPasswordPage />
            )
          }
        />
        <Route
          path="/reset-password"
          element={
            auth ? (
              <Navigate to={auth.role === 'employee' ? '/employee' : '/login'} replace />
            ) : (
              <ResetPasswordPage />
            )
          }
        />
        <Route
          path="/"
          element={
            !auth ? (
              <Navigate to="/login" replace />
            ) : (
              <Navigate to={auth.role === 'employee' ? '/employee' : '/login'} replace />
            )
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth user={auth} role="admin">
              <Shell
                user={auth}
                signOut={signOut}
                activePage={activePage}
                setActivePage={setActivePage}
              >
                <AdminWorkspace user={auth} activePage={activePage} setActivePage={setActivePage} />
              </Shell>
            </RequireAuth>
          }
        />
        <Route
          path="/employee"
          element={
            <RequireAuth user={auth} role="employee">
              <Shell
                user={auth}
                signOut={signOut}
                activePage={activePage}
                setActivePage={setActivePage}
              >
                <EmployeeWorkspace user={auth} activePage={activePage} setActivePage={setActivePage} />
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
  if (user.role !== role) {
    // An admin who lands on /employee goes to the employee sign-in page; an
    // employee who guesses /admin goes back to their own workspace.
    return <Navigate to={user.role === 'admin' ? '/login' : '/employee'} replace />;
  }
  return children;
}

export default App;
