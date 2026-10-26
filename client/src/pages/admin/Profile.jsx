import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import ProfileDetails from '../../components/ProfileDetails';
import Spinner from '../../components/Spinner';
import { getEmployees } from '../../lib/employeeDirectory';
import { errMsg } from '../../lib/format';

export default function AdminProfile({ user, selectedEmployeeId, onUserUpdate }) {
  const notify = useToast();
  const [admin, setAdmin] = useState(user);
  const [adminRefreshing, setAdminRefreshing] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [employeesRefreshing, setEmployeesRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState(selectedEmployeeId || '');
  const [search, setSearch] = useState('');

  async function loadAdmin() {
    setAdminRefreshing(true);
    try {
      const { data } = await api.get('/auth/me');
      if (data?.user) {
        setAdmin(data.user);
        onUserUpdate?.(data.user);
      }
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setAdminRefreshing(false);
    }
  }

  async function loadEmployees({ force = false } = {}) {
    setEmployeesRefreshing(true);
    try {
      const list = await getEmployees({ force });
      setEmployees(list);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoadingEmployees(false);
      setEmployeesRefreshing(false);
    }
  }

  useEffect(() => {
    loadAdmin();
    loadEmployees({ force: true });
  }, []);

  // A row-level "Profile" action in the Employees page passes its employee id
  // here. Clearing it from the sidebar nav resets the picker.
  useEffect(() => {
    setSelectedId(selectedEmployeeId || '');
  }, [selectedEmployeeId]);

  const selected = employees.find((employee) => employee.id === selectedId) || null;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.employeeCode,
        employee.department,
        employee.position,
        employee.location,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [employees, search]);

  const options = useMemo(() => {
    if (!selected || visible.some((employee) => employee.id === selected.id)) return visible;
    // Keep the active employee selectable even when the search hides their row.
    return [selected, ...visible];
  }, [selected, visible]);

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>Profile</h1>
          <p className="muted">
            Your account details and the full profile of every employee you manage.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-heading responsive-heading">
          <div>
            <h2>My profile</h2>
            <p className="muted small-text">Your administrator account details.</p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={loadAdmin}
            disabled={adminRefreshing}
          >
            <RefreshCw size={16} /> {adminRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <ProfileDetails
          person={admin}
          roleLabel="Administrator"
          readOnlyNote="Your administrator account details are managed by the system. Employee details are edited from the Employees page."
        />
      </section>

      <section className="panel">
        <div className="panel-heading responsive-heading">
          <div>
            <h2>Employee profiles</h2>
            <p className="muted small-text">
              Search for an employee, or open a profile from the Employees page, to see every detail
              entered for them.
            </p>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => loadEmployees({ force: true })}
            disabled={employeesRefreshing}
          >
            <RefreshCw size={16} /> {employeesRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="profile-picker">
          <div className="search-field">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, ID, department or position"
              aria-label="Search employees"
            />
          </div>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            aria-label="Select employee"
          >
            <option value="">Select an employee</option>
            {options.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
                {employee.position ? ` — ${employee.position}` : ''}
                {employee.isActive === false ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </div>

        {loadingEmployees ? (
          <Spinner label="Loading employee profiles..." />
        ) : selected ? (
          <ProfileDetails
            person={selected}
            roleLabel="Employee"
            readOnlyNote="These details were entered by the admin. Update them from the Employees page."
          />
        ) : (
          <div className="profile-empty">
            {employees.length
              ? 'Select an employee to see all the details entered for their account.'
              : 'No employees yet. Add an employee from the Employees page.'}
          </div>
        )}
      </section>
    </div>
  );
}
