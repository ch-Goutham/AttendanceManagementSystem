import { useEffect, useState } from 'react';
import {
  CalendarDays,
  ClipboardCheck,
  LogOut,
  Menu,
  UserRound,
  Users,
  BarChart3,
  LayoutDashboard,
  X,
  FileText,
} from 'lucide-react';
import { initials } from '../lib/format';

const ADMIN_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { key: 'employees', label: 'Employees', icon: <Users size={18} /> },
  { key: 'attendance', label: 'Attendance', icon: <CalendarDays size={18} /> },
  { key: 'leaves', label: 'Leave Management', icon: <ClipboardCheck size={18} /> },
  { key: 'reports', label: 'Reports', icon: <BarChart3 size={18} /> },
];

const EMPLOYEE_NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { key: 'mark', label: 'Mark Attendance', icon: <ClipboardCheck size={18} /> },
  { key: 'permission', label: 'Permission', icon: <FileText size={18} /> },
  { key: 'leave', label: 'Apply Leave', icon: <UserRound size={18} /> },
];

const PAGE_TITLES = {
  admin: {
    dashboard: 'Dashboard',
    employees: 'Employees',
    attendance: 'Attendance',
    leaves: 'Leave Management',
    reports: 'Reports',
  },
  employee: {
    dashboard: 'Dashboard',
    mark: 'Mark Attendance',
    permission: 'Permission',
    leave: 'Apply Leave',
  },
};

export default function Shell({ user, signOut, activePage, setActivePage, children }) {
  const nav = user.role === 'admin' ? ADMIN_NAV : EMPLOYEE_NAV;
  const title = PAGE_TITLES[user.role]?.[activePage] || 'Workspace';
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [activePage]);

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
          <div className="brand-mark small">
            <ClipboardCheck size={20} />
          </div>
          <span>
            Attend<span className="brand-light">wise</span>
          </span>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="side-label">{user.role === 'admin' ? 'ADMIN CONSOLE' : 'WORKSPACE'}</div>
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
            <div className="avatar">{initials(user.name)}</div>
            <div className="profile-info">
              <b>{user.name}</b>
              <small>{user.role === 'admin' ? 'Administrator' : 'Employee'}</small>
            </div>
          </div>
          <button className="logout" onClick={signOut}>
            <LogOut size={17} /> Sign out
          </button>
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
          <div className="top-user">
            <span className="online-dot" /> {user.email}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
