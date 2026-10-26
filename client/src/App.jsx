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
import {
  clearAuth,
  currentPortal,
  getSessionKey,
  portalForPath,
  readAuth,
  saveAuth,
  updateAuthUser,
} from './lib/authStorage';
import { clearEmployeeCache } from './lib/employeeDirectory';
import { clearPageCache } from './lib/pageCache';
import Dashboard from './pages/admin/Dashboard';
import Employees from './pages/admin/Employees';
import Attendance from './pages/admin/Attendance';
import LeaveManagement from './pages/admin/LeaveManagement';
import Reports from './pages/admin/Reports';
import AdminProfile from './pages/admin/Profile';
import MarkAttendance from './pages/employee/MarkAttendance';
import ApplyLeave from './pages/employee/ApplyLeave';
import ApplyPermission from './pages/employee/ApplyPermission';
import EmployeeDashboard from './pages/employee/Dashboard';
import EmployeeProfile from './pages/employee/Profile';

const DEFAULT_PAGE = { admin: 'dashboard', employee: 'dashboard' };
const HOME_FOR_ROLE = { admin: '/admin', employee: '/employee' };

function clearClientCaches() {
  clearPageCache();
  clearEmployeeCache();
}

function AdminWorkspace({
  user,
  activePage,
  setActivePage,
  profileEmployeeId,
  onOpenProfile,
  onUserUpdate,
}) {
  if (activePage === 'profile')
    return (
      <AdminProfile
        user={user}
        selectedEmployeeId={profileEmployeeId}
        onUserUpdate={onUserUpdate}
      />
    );
  if (activePage === 'employees') return <Employees onOpenProfile={onOpenProfile} />;
  if (activePage === 'attendance') return <Attendance />;
  if (activePage === 'leaves') return <LeaveManagement />;
  if (activePage === 'reports') return <Reports />;
  return <Dashboard user={user} onNavigate={setActivePage} />;
}

function EmployeeWorkspace({ user, activePage, setActivePage, onUserUpdate }) {
  if (activePage === 'profile')
    return <EmployeeProfile user={user} onUserUpdate={onUserUpdate} />;
  if (activePage === 'mark') return <MarkAttendance user={user} />;
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
  const [profileEmployeeId, setProfileEmployeeId] = useState('');
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
          clearAuth(stored?.user?.role || currentPortal());
          clearClientCaches();
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
        if (status === 401 || status === 403) clearAuth(currentPortal());
        clearClientCaches();
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
      clearClientCaches();
      setAuth(null);
      setActivePage('dashboard');
      setProfileEmployeeId('');
      navigate(wasAdmin ? '/admin-login' : '/login', { replace: true });
    };
    window.addEventListener('attendance:auth-expired', onExpired);
    return () => window.removeEventListener('attendance:auth-expired', onExpired);
  }, [navigate]);

  // Keep tabs in sync when this tab's portal session is replaced or cleared in
  // another tab. Writes to the other portal's slot are ignored, which is what
  // lets an admin tab and an employee tab stay signed in side by side.
  useEffect(() => {
    const onStorage = (event) => {
      const portal = portalForPath();
      if (!portal) return;
      // `event.key === null` means storage.clear(), so re-read in that case.
      if (event?.key != null && event.key !== getSessionKey(portal)) return;
      const next = readAuth(portal);
      clearClientCaches();
      setAuth(next?.user || null);
      setActivePage(DEFAULT_PAGE[next?.user?.role] || 'dashboard');
      setProfileEmployeeId('');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const signOut = () => {
    const role = authRef.current?.role || currentPortal();
    const wasAdmin = role === 'admin';
    clearAuth(role);
    clearClientCaches();
    setAuth(null);
    setActivePage('dashboard');
    setProfileEmployeeId('');
    navigate(wasAdmin ? '/admin-login' : '/login', { replace: true });
  };

  // Keep the sidebar and stored session in sync after a Profile page refreshes
  // from /auth/me (an admin may have edited these details meanwhile).
  const updateUser = (nextUser) => {
    if (!nextUser) return;
    updateAuthUser(nextUser);
    setAuth(nextUser);
  };

  // Opening Profile from the sidebar shows the signed-in user's own profile;
  // only the employee-row action preselects someone else.
  const selectPage = (key) => {
    if (key === 'profile') setProfileEmployeeId('');
    setActivePage(key);
  };

  const openEmployeeProfile = (employeeId) => {
    setProfileEmployeeId(employeeId || '');
    setActivePage('profile');
  };

  const onAuth = (data, remember = true) => {
    saveAuth(data, remember);
    clearClientCaches();
    setAuth(data.user);
    setActivePage(DEFAULT_PAGE[data.user.role] || 'dashboard');
    setProfileEmployeeId('');
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
                setActivePage={selectPage}
              >
                <AdminWorkspace
                  user={auth}
                  activePage={activePage}
                  setActivePage={selectPage}
                  profileEmployeeId={profileEmployeeId}
                  onOpenProfile={openEmployeeProfile}
                  onUserUpdate={updateUser}
                />
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
                setActivePage={selectPage}
              >
                <EmployeeWorkspace
                  user={auth}
                  activePage={activePage}
                  setActivePage={selectPage}
                  onUserUpdate={updateUser}
                />
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
