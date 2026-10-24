import { useEffect, useState } from 'react';
import { RefreshCw, Pencil } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Spinner from '../../components/Spinner';
import { Status, DayFlag } from '../../components/Ui';
import { currentMonth, formatDate, formatTime, sessionSummary } from '../../lib/dates';
import { errMsg, initials } from '../../lib/format';
import { getEmployees } from '../../lib/employeeDirectory';
import { clearPageCache, readPageCache, writePageCache } from '../../lib/pageCache';

const INITIAL_FILTERS = { month: currentMonth(), date: '', employeeId: '' };
const attendanceKey = (filters) =>
  `admin:attendance:${filters.month}|${filters.date || 'all'}|${filters.employeeId || 'all'}`;

const EDIT_EMPTY = {
  status: 'Present',
  checkIn: '',
  checkOut: '',
  dayType: '',
  note: '',
  location: 'Office',
};

export default function Attendance() {
  const notify = useToast();
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState(
    () => readPageCache(attendanceKey(INITIAL_FILTERS)) || []
  );
  const [loading, setLoading] = useState(
    () => !readPageCache(attendanceKey(INITIAL_FILTERS))
  );
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(EDIT_EMPTY);
  const [editBusy, setEditBusy] = useState(false);

  async function loadEmployees() {
    setEmployees(await getEmployees());
  }

  async function load({ silent = false } = {}) {
    const cacheKey = attendanceKey(filters);
    const cached = readPageCache(cacheKey);
    if (cached) {
      setRecords(cached);
      if (!silent) setLoading(false);
    } else if (!silent) {
      setRecords([]);
      setLoading(true);
    }

    try {
      const params = { month: filters.month };
      if (filters.date) params.date = filters.date;
      if (filters.employeeId) params.employeeId = filters.employeeId;

      const { data } = await api.get('/attendance', { params });
      const nextRecords = data.records || [];
      setRecords(nextRecords);
      writePageCache(cacheKey, nextRecords);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees().catch((error) => notify('error', errMsg(error)));
  }, []);

  useEffect(() => {
    load();
  }, [filters.month, filters.date, filters.employeeId]);

  function startEdit(record) {
    setEditing(record);
    setEditForm({
      status: record.status,
      checkIn: record.checkIn || '',
      checkOut: record.checkOut || '',
      dayType: record.dayType || '',
      note: record.note || '',
      location: record.location || 'Office',
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    setEditBusy(true);
    try {
      await api.patch(`/attendance/${editing.id}`, {
        status: editForm.status,
        checkIn: editForm.status === 'Present' ? editForm.checkIn : '',
        checkOut: editForm.status === 'Present' ? editForm.checkOut : '',
        dayType: editForm.status === 'Present' ? editForm.dayType : '',
        note: editForm.note,
        location: editForm.location,
      });
      notify('success', `Attendance corrected for ${editing.employee?.name || 'employee'}.`);
      setEditing(null);
      clearPageCache();
      await load({ silent: true });
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setEditBusy(false);
    }
  }

  const filtersActive = !!filters.date || !!filters.employeeId;

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>Attendance</h1>
          <p className="muted">
            View every employee&apos;s check-in and check-out times, day type and late or early
            flags. Correct a record when needed.
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-heading responsive-heading">
          <div>
            <h2>Attendance records</h2>
            <p className="muted small-text">
              {filtersActive
                ? 'Filtered view. An exact date overrides the selected month.'
                : 'Review records for the selected month.'}
            </p>
          </div>
          <div className="filters">
            <input
              type="month"
              value={filters.month}
              onChange={(event) => setFilters({ ...filters, month: event.target.value })}
              title="Month"
            />
            <input
              type="date"
              value={filters.date}
              onChange={(event) => setFilters({ ...filters, date: event.target.value })}
              title="Exact date"
            />
            <select
              value={filters.employeeId}
              onChange={(event) => setFilters({ ...filters, employeeId: event.target.value })}
            >
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
            {filtersActive && (
              <button
                type="button"
                className="link-btn"
                onClick={() => setFilters({ ...filters, date: '', employeeId: '' })}
              >
                Clear filters
              </button>
            )}
            <button className="icon-btn" onClick={() => load()} title="Refresh" type="button">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="table-wrap">
          {loading ? (
            <Spinner label="Loading records..." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Hours</th>
                  <th>Status</th>
                  <th>Day type</th>
                  <th>Location</th>
                  <th>Flags</th>
                  <th className="col-action">Edit</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <div className="employee-cell">
                        <div className="avatar tiny">{initials(record.employee?.name)}</div>
                        <div>
                          <b>{record.employee?.name || 'Employee'}</b>
                          <small>{record.employee?.department || record.employee?.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>{formatDate(record.date)}</td>
                    <td>
                      {formatTime(record.checkIn)}
                      {record.sessionCount > 1 && (
                        <small className="cell-note" title={sessionSummary(record)}>
                          {record.sessionCount} sessions
                        </small>
                      )}
                    </td>
                    <td>{formatTime(record.checkOut)}</td>
                    <td>{record.hoursLabel}</td>
                    <td>
                      <Status status={record.status} />
                    </td>
                    <td>{record.status === 'Present' ? record.dayType : '—'}</td>
                    <td>
                      <span
                        className={`location-badge ${
                          record.location === 'Work from home' ? 'wfh' : 'office'
                        }`}
                      >
                        {record.location || '—'}
                      </span>
                    </td>
                    <td>
                      <DayFlag
                        late={record.late}
                        earlyCheckout={record.earlyCheckout}
                        missingCheckOut={record.missingCheckOut}
                        missingCheckIn={record.missingCheckIn}
                      />
                      {record.late && record.lateReason && (
                        <small className="cell-note" title={record.lateReason}>
                          Reason: {record.lateReason}
                        </small>
                      )}
                    </td>
                    <td className="col-action">
                      <button className="link-btn" onClick={() => startEdit(record)}>
                        <Pencil size={13} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {!records.length && (
                  <tr>
                    <td colSpan="10" className="empty">
                      No attendance records match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal wide" onClick={(event) => event.stopPropagation()}>
            <h3>Correct attendance</h3>
            <p className="muted">
              {editing.employee?.name || 'Employee'} · {formatDate(editing.date)}
            </p>
            <form className="edit-form" onSubmit={saveEdit}>
              <label>
                Status
                <select
                  value={editForm.status}
                  onChange={(event) => {
                    const status = event.target.value;
                    setEditForm({
                      ...editForm,
                      status,
                      checkIn: status === 'Present' ? editForm.checkIn : '',
                      checkOut: status === 'Present' ? editForm.checkOut : '',
                      dayType: status === 'Present' ? editForm.dayType : '',
                    });
                  }}
                >
                  <option>Present</option>
                  <option>Absent</option>
                  <option>Leave</option>
                </select>
              </label>
              <label>
                Check in
                <input
                  type="time"
                  value={editForm.checkIn}
                  disabled={editForm.status !== 'Present'}
                  onChange={(event) => setEditForm({ ...editForm, checkIn: event.target.value })}
                />
              </label>
              <label>
                Check out
                <input
                  type="time"
                  value={editForm.checkOut}
                  disabled={editForm.status !== 'Present'}
                  onChange={(event) => setEditForm({ ...editForm, checkOut: event.target.value })}
                />
              </label>
              <label>
                Day type
                <select
                  value={editForm.dayType}
                  disabled={editForm.status !== 'Present'}
                  onChange={(event) => setEditForm({ ...editForm, dayType: event.target.value })}
                >
                  <option value="">Auto from hours</option>
                  <option value="Full day">Full day</option>
                  <option value="Half day">Half day</option>
                </select>
              </label>
              <label className="edit-note">
                Location
                <select
                  value={editForm.location}
                  onChange={(event) => setEditForm({ ...editForm, location: event.target.value })}
                >
                  <option value="">Not set</option>
                  <option value="Office">Office</option>
                  <option value="Work from home">Work from home</option>
                </select>
              </label>
              <label className="edit-note">
                Note
                <input
                  value={editForm.note}
                  onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
                  placeholder="Reason for the correction (optional)"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button className="primary" disabled={editBusy}>
                  {editBusy ? 'Saving...' : 'Save correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
