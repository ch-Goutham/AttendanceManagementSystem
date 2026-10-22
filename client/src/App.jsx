import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import BackendNotice from './components/BackendNotice';
import Shell from './components/Shell';
import EmployeeLogin from './pages/auth/EmployeeLogin';
import AdminLogin from './pages/auth/AdminLogin';
import ForgotPasswordPage from './pages/auth/ForgotPassword';
import ResetPasswordPage from './pages/auth/ResetPassword';
import Dashboard from './pages/admin/Dashboard';
import Employees from './pages/admin/Employees';
import Attendance from './pages/admin/Attendance';
import LeaveManagement from './pages/admin/LeaveManagement';
import Reports from './pages/admin/Reports';
import MyAttendance from './pages/employee/MyAttendance';
import MarkAttendance from './pages/employee/MarkAttendance';
import ApplyLeave from './pages/employee/ApplyLeave';

const DEFAULT_PAGE = { admin: 'dashboard', employee: 'attendance' };

function AdminWorkspace({ user, activePage, setActivePage }) {
  if (activePage === 'employees') return <Employees user={user} />;
  if (activePage === 'attendance') return <Attendance onNavigate={setActivePage} />;
  if (activePage === 'leaves') return <LeaveManagement onNavigate={setActivePage} />;
  if (activePage === 'reports') return <Reports />;
  return <Dashboard user={user} onNavigate={setActivePage} />;
}

function EmployeeWorkspace({ user, activePage }) {
  if (activePage === 'mark') return <MarkAttendance />;
  if (activePage === 'leave') return <ApplyLeave />;
  return <MyAttendance user={user} />;
}

function App() {
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('attendance_user') || 'null');
    } catch {
      return null;
    }
  });
  const [activePage, setActivePage] = useState(() => DEFAULT_PAGE[auth?.role] || 'attendance');
  const navigate = useNavigate();

  const signOut = () => {
    const wasAdmin = auth?.role === 'admin';
    localStorage.removeItem('attendance_token');
    localStorage.removeItem('attendance_user');
    setAuth(null);
    setActivePage('attendance');
    navigate(wasAdmin ? '/admin-login' : '/login', { replace: true });
  };

  const onAuth = (data) => {
    localStorage.setItem('attendance_token', data.token);
    localStorage.setItem('attendance_user', JSON.stringify(data.user));
    setAuth(data.user);
    setActivePage(DEFAULT_PAGE[data.user.role] || 'attendance');
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
        <Route path="/register-admin" element={<Navigate to="/admin-login" replace />} />
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
                <EmployeeWorkspace user={auth} activePage={activePage} />
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
