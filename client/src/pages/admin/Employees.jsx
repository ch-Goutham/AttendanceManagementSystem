import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RefreshCw,
  KeyRound,
  UserCheck,
  UserX,
  Trash2,
  Search,
  Pencil,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import PasswordInput from '../../components/PasswordInput';
import PasswordChecklist from '../../components/PasswordChecklist';
import Spinner from '../../components/Spinner';
import { Status } from '../../components/Ui';
import { errMsg, initials, randomPassword } from '../../lib/format';
import { passwordError } from '../../lib/password';
import { clearEmployeeCache, getEmployees, patchCachedEmployee } from '../../lib/employeeDirectory';
import { clearPageCache } from '../../lib/pageCache';

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  password: '',
  employeeCode: '',
  department: '',
  location: 'Office',
};
const LOCATIONS = ['Office', 'Work from home', 'College'];
const EDIT_FIELDS = [
  ['name', 'Full name', 'text'],
  ['email', 'Email', 'email'],
  ['phone', 'Phone number', 'tel'],
  ['employeeCode', 'Employee ID', 'text'],
  ['department', 'Department', 'text'],
];

export default function Employees() {
  const notify = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [resetId, setResetId] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  const askConfirm = (options) => setConfirm(options);
  async function runConfirm() {
    if (!confirm?.onConfirm) return;
    setConfirmBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setConfirmBusy(false);
      setConfirm(null);
    }
  }

  async function load({ force = false } = {}) {
    setLoading(true);
    try {
      setEmployees(await getEmployees({ force }));
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createEmployee(event) {
    event.preventDefault();
    const passwordIssue = passwordError(form.password);
    if (passwordIssue) {
      notify('error', passwordIssue);
      return;
    }
    setSaving(true);
    try {
      await api.post('/employees', form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      notify('success', 'Employee login created.');
      clearEmployeeCache();
      clearPageCache();
      await load({ force: true });
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(id, isActive) {
    try {
      await api.patch(`/employees/${id}/status`, { isActive });
      notify('success', `Account ${isActive ? 'reactivated' : 'deactivated'}.`);
      clearEmployeeCache();
      clearPageCache();
      await load({ force: true });
    } catch (error) {
      notify('error', errMsg(error));
    }
  }

  async function updateLocation(id, location) {
    const previous = employees;
    const updated = employees.map((employee) =>
      employee.id === id ? { ...employee, location } : employee
    );
    setEmployees(updated);
    patchCachedEmployee({ id, location });
    try {
      const { data } = await api.patch(`/employees/${id}/location`, { location });
      setEmployees((current) =>
        current.map((employee) => (employee.id === id ? data.employee : employee))
      );
      notify('success', `Location set to ${data.employee?.location || location}.`);
      clearPageCache();
    } catch (error) {
      setEmployees(previous);
      clearEmployeeCache();
      notify('error', errMsg(error));
    }
  }

  function startEdit(employee) {
    setEditId(employee.id);
    setEditForm({
      name: employee.name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      employeeCode: employee.employeeCode || '',
      department: employee.department || '',
      location: employee.location || 'Office',
    });
  }

  function closeEdit() {
    setEditId('');
    setEditForm(null);
  }

  async function saveEdit(event) {
    event.preventDefault();
    setEditSaving(true);
    try {
      const { data } = await api.patch(`/employees/${editId}`, editForm);
      const updated = data.employee;
      setEmployees((current) =>
        current
          .map((employee) => (employee.id === updated.id ? updated : employee))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      );
      patchCachedEmployee(updated);
      clearPageCache();
      notify('success', 'Employee details updated.');
      closeEdit();
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setEditSaving(false);
    }
  }

  async function remove(id) {
    try {
      await api.delete(`/employees/${id}`);
      notify('success', 'Employee account deleted.');
      if (resetId === id) {
        setResetId('');
        setTempPassword('');
      }
      clearEmployeeCache();
      clearPageCache();
      await load({ force: true });
    } catch (error) {
      notify('error', errMsg(error));
    }
  }

  async function submitReset(event) {
    event.preventDefault();
    const passwordIssue = passwordError(tempPassword);
    if (passwordIssue) {
      notify('error', passwordIssue);
      return;
    }
    setResetBusy(true);
    try {
      await api.patch(`/employees/${resetId}/password`, { password: tempPassword });
      notify('success', 'Password reset. Share the new password with the employee.');
      setResetId('');
      setTempPassword('');
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setResetBusy(false);
    }
  }

  const resetTarget = employees.find((employee) => employee.id === resetId);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.email,
        employee.phone,
        employee.employeeCode,
        employee.department,
        employee.location,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [employees, search]);

  const employeeCount = employees.filter((employee) => employee.role === 'employee').length;

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>Employees</h1>
          <p className="muted">
            Create employee logins, reset passwords and manage access. {employeeCount} employee
            {employeeCount === 1 ? '' : 's'} on record.
          </p>
        </div>
        <button className="primary" onClick={() => setShowForm((current) => !current)}>
          <Plus size={17} /> Add employee
        </button>
      </div>

      {resetTarget && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Reset password for {resetTarget.name}</h2>
              <p className="muted small-text">
                Set a new temporary password and share it with the employee out-of-band.
              </p>
            </div>
          </div>
          <form className="reset-form" onSubmit={submitReset}>
            <label>
              New temporary password
              <PasswordInput
                value={tempPassword}
                onChange={(event) => setTempPassword(event.target.value)}
                minLength={8}
                maxLength={72}
                required
                placeholder="At least 8 characters"
              />
              <PasswordChecklist value={tempPassword} />
            </label>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={() => setTempPassword(randomPassword())}>
                Generate
              </button>
              <button className="primary" disabled={resetBusy}>
                {resetBusy ? 'Saving...' : 'Set password'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setResetId('');
                  setTempPassword('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {showForm && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Create employee login</h2>
              <p className="muted small-text">
                The employee signs in with this email and password to mark attendance and apply for leave.
              </p>
            </div>
          </div>
          <form className="form-grid" onSubmit={createEmployee}>
            {[
              ['name', 'Full name'],
              ['email', 'Email'],
              ['phone', 'Phone number'],
              ['password', 'Temporary password'],
              ['employeeCode', 'Employee ID'],
              ['department', 'Department'],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                {key === 'password' ? (
                  <>
                    <PasswordInput
                      required
                      minLength={8}
                      maxLength={72}
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                      placeholder={label}
                    />
                    <PasswordChecklist value={form.password} />
                  </>
                ) : (
                  <input
                    required={['name', 'email'].includes(key)}
                    type={key === 'email' ? 'email' : 'text'}
                    value={form[key]}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                    placeholder={label}
                  />
                )}
              </label>
            ))}
            <label>
              Location
              <select
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.target.value })}
              >
                {LOCATIONS.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button className="primary" disabled={saving}>
                {saving ? 'Creating...' : 'Create employee'}
              </button>
              <button type="button" className="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading responsive-heading">
          <div>
            <h2>Accounts</h2>
            <p className="muted small-text">
              Deactivate someone who has resigned; reactivate to restore access. Deleting removes their history.
            </p>
          </div>
          <div className="filters">
            <div className="search-field">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search accounts"
              />
            </div>
            <button className="icon-btn" onClick={load} title="Refresh" type="button">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <div className="table-wrap">
          {loading ? (
            <Spinner label="Loading accounts..." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee ID</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Account</th>
                  <th className="col-action">Edit</th>
                  <th className="col-action">Reset</th>
                  <th className="col-action">Access</th>
                  <th className="col-action">Delete</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <div className="employee-cell">
                        <div className="avatar tiny">{initials(employee.name)}</div>
                        <div>
                          <b>{employee.name}</b>
                          <small>{employee.department || 'No department'}</small>
                        </div>
                      </div>
                    </td>
                    <td>{employee.employeeCode || '—'}</td>
                    <td>{employee.email}</td>
                    <td>{employee.phone || '—'}</td>
                    <td>{employee.department || '—'}</td>
                    <td>
                      <select
                        className="inline-select"
                        value={employee.location || 'Office'}
                        onChange={(event) => updateLocation(employee.id, event.target.value)}
                        title="Working location"
                      >
                        {LOCATIONS.map((location) => (
                          <option key={location} value={location}>
                            {location}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Status status={employee.isActive === false ? 'Inactive' : 'Active'} />
                    </td>
                    <td className="col-action">
                      <button
                        className="link-btn"
                        title="Edit employee details"
                        onClick={() => startEdit(employee)}
                        disabled={editId === employee.id}
                      >
                        <Pencil size={14} /> Edit
                      </button>
                    </td>
                    <td className="col-action">
                      <button
                        className="link-btn"
                        title="Reset password"
                        onClick={() => {
                          setResetId(employee.id);
                          setTempPassword(randomPassword());
                        }}
                        disabled={resetId === employee.id}
                      >
                        <KeyRound size={14} /> Reset
                      </button>
                    </td>
                    <td className="col-action">
                      {employee.isActive === false ? (
                        <button
                          className="link-btn"
                          title="Reactivate account"
                          onClick={() => setActive(employee.id, true)}
                        >
                          <UserCheck size={14} /> Reactivate
                        </button>
                      ) : (
                        <button
                          className="link-btn danger-text"
                          title="Deactivate account"
                          onClick={() =>
                            askConfirm({
                              title: 'Deactivate account?',
                              message: `${employee.name} will no longer be able to sign in. Their attendance and leave history are kept.`,
                              confirmLabel: 'Deactivate',
                              danger: true,
                              onConfirm: () => setActive(employee.id, false),
                            })
                          }
                        >
                          <UserX size={14} /> Deactivate
                        </button>
                      )}
                    </td>
                    <td className="col-action">
                      <button
                        className="link-btn danger-text"
                        title="Delete employee"
                        onClick={() =>
                          askConfirm({
                            title: 'Delete employee permanently?',
                            message: `${employee.name}, their attendance and their leave records will be permanently removed. This cannot be undone.`,
                            confirmLabel: 'Delete',
                            danger: true,
                            onConfirm: () => remove(employee.id),
                          })
                        }
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!visible.length && (
                  <tr>
                    <td colSpan="11" className="empty">
                      {employees.length
                        ? 'No employees match your search.'
                        : 'No employees yet. Add your first employee.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {editForm && (
        <div className="modal-backdrop" onClick={closeEdit}>
          <div className="modal wide" onClick={(event) => event.stopPropagation()}>
            <h3>Edit employee</h3>
            <p className="muted">
              Update the profile details for {editForm.name || 'this employee'}.
            </p>
            <form className="edit-form" onSubmit={saveEdit}>
              {EDIT_FIELDS.map(([key, label, type]) => (
                <label key={key}>
                  {label}
                  <input
                    required={['name', 'email'].includes(key)}
                    type={type}
                    value={editForm[key]}
                    onChange={(event) => setEditForm({ ...editForm, [key]: event.target.value })}
                    placeholder={label}
                  />
                </label>
              ))}
              <label>
                Location
                <select
                  value={editForm.location}
                  onChange={(event) => setEditForm({ ...editForm, location: event.target.value })}
                >
                  {LOCATIONS.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>
              </label>
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={closeEdit}>
                  Cancel
                </button>
                <button className="primary" disabled={editSaving}>
                  {editSaving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
