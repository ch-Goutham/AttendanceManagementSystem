import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import BackendNotice from './components/BackendNotice';
import Shell from './components/Shell';
import EmployeeLogin from './pages/auth/EmployeeLogin';
import AdminLogin from './pages/auth/AdminLogin';
import AdminSignup from './pages/auth/AdminSignup';
import ForgotPasswordPage from './pages/auth/ForgotPassword';
import ResetPasswordPage from './pages/auth/ResetPassword';
import Terms from './pages/Terms';
import { clearAuth, readAuth, saveAuth } from './lib/authStorage';
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
  const [auth, setAuth] = useState(() => readAuth());
  const [activePage, setActivePage] = useState(() => DEFAULT_PAGE[auth?.role] || 'dashboard');
  const navigate = useNavigate();

  const signOut = () => {
    const wasAdmin = auth?.role === 'admin';
    clearAuth();
    setAuth(null);
    setActivePage('dashboard');
    navigate(wasAdmin ? '/admin-login' : '/login', { replace: true });
  };

  const onAuth = (data, remember = true) => {
    saveAuth(data, remember);
    setAuth(data.user);
    setActivePage(DEFAULT_PAGE[data.user.role] || 'dashboard');
    navigate('/');
  };

  return (
    <ToastProvider>
      <BackendNotice />
      <Routes>
        <Route
          path="/login"
          element={auth ? <Navigate to="/" replace /> : <EmployeeLogin onAuth={onAuth} />}
        />
        <Route
          path="/admin-login"
          element={auth ? <Navigate to="/" replace /> : <AdminLogin onAuth={onAuth} />}
        />
        <Route
          path="/admin-signup"
          element={auth ? <Navigate to="/" replace /> : <AdminSignup onAuth={onAuth} />}
        />
        <Route path="/register-admin" element={<Navigate to="/admin-signup" replace />} />
        <Route path="/terms" element={<Terms />} />
        <Route
          path="/forgot-password"
          element={auth ? <Navigate to="/" replace /> : <ForgotPasswordPage />}
        />
        <Route
          path="/reset-password"
          element={auth ? <Navigate to="/" replace /> : <ResetPasswordPage />}
        />
        <Route
          path="/"
          element={
            !auth ? (
              <Navigate to="/login" replace />
            ) : (
              <Navigate to={auth.role === 'admin' ? '/admin' : '/employee'} replace />
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
  if (user.role !== role) return <Navigate to="/" replace />;
  return children;
}

export default App;
