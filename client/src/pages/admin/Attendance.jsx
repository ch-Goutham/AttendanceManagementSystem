import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock,
  RefreshCw,
  Check,
  X,
  Pencil,
  Plus,
  UserCheck,
  UserX,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import Spinner from '../../components/Spinner';
import { StatCard, Status, DayFlag } from '../../components/Ui';
import { currentMonth, formatDate, formatTime, todayKey } from '../../lib/dates';
import { errMsg, initials } from '../../lib/format';

const EDIT_EMPTY = {
  status: 'Present',
  checkIn: '',
  checkOut: '',
  dayType: '',
  note: '',
};

export default function Attendance({ onNavigate }) {
  const notify = useToast();
  const [employees, setEmployees] = useState([]);
  const [config, setConfig] = useState(null);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [filters, setFilters] = useState({
    month: currentMonth(),
    date: '',
    employeeId: '',
    status: '',
    lateOnly: false,
  });
  const [mark, setMark] = useState({
    employeeId: '',
    date: todayKey(),
    status: 'Present',
    checkIn: '',
    checkOut: '',
    dayType: '',
  });
  const [markBusy, setMarkBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(EDIT_EMPTY);
  const [editBusy, setEditBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

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

  async function loadEmployees() {
    const { data } = await api.get('/employees');
    const list = (data.employees || []).filter((employee) => employee.role === 'employee');
    setEmployees(list);
    setMark((current) => ({
      ...current,
      employeeId:
        current.employeeId || list.find((employee) => employee.isActive !== false)?.id || '',
    }));
  }

  async function loadConfig() {
    try {
      const { data } = await api.get('/attendance/config');
      setConfig(data.config);
    } catch {
      /* shift labels are non-critical */
    }
  }

  async function load() {
    setLoading(true);
    try {
      const params = { month: filters.month };
      if (filters.employeeId) params.employeeId = filters.employeeId;
      if (filters.date) params.date = filters.date;
      if (filters.status) params.status = filters.status;
      if (filters.lateOnly) params.late = 'true';

      const summaryParams = { month: filters.month };
      if (filters.employeeId) summaryParams.employeeId = filters.employeeId;

      const [recordsResponse, summaryResponse] = await Promise.all([
        api.get('/attendance', { params }),
        api.get('/attendance/summary', { params: summaryParams }),
      ]);
      setRecords(recordsResponse.data.records || []);
      setSummary(summaryResponse.data);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadPending() {
    setPendingLoading(true);
    try {
      const { data } = await api.get('/attendance/pending');
      setPending(data.records || []);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setPendingLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees().catch((error) => notify('error', errMsg(error)));
    loadConfig();
    loadPending();
  }, []);

  useEffect(() => {
    load();
  }, [filters.month, filters.date, filters.employeeId, filters.status, filters.lateOnly]);

  const activeEmployees = employees.filter((employee) => employee.isActive !== false);

  async function markAttendance(event) {
    event.preventDefault();
    setMarkBusy(true);
    try {
      await api.post('/attendance', {
        employeeId: mark.employeeId,
        date: mark.date,
        status: mark.status,
        checkIn: mark.status === 'Present' ? mark.checkIn : '',
        checkOut: mark.status === 'Present' ? mark.checkOut : '',
        dayType: mark.status === 'Present' ? mark.dayType : '',
      });
      notify('success', 'Attendance saved.');
      await Promise.all([load(), loadPending()]);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setMarkBusy(false);
    }
  }

  function startEdit(record) {
    setEditing(record);
    setEditForm({
      status: record.status,
      checkIn: record.checkIn || '',
      checkOut: record.checkOut || '',
      dayType: record.dayType || '',
      note: record.note || '',
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
      });
      notify('success', `Attendance corrected for ${editing.employee?.name || 'employee'}.`);
      setEditing(null);
      await Promise.all([load(), loadPending()]);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setEditBusy(false);
    }
  }

  async function review(id, action) {
    try {
      await api.patch(`/attendance/${id}/review`, { action });
      notify('success', `Self-mark ${action === 'approve' ? 'confirmed' : 'rejected'}.`);
      await Promise.all([loadPending(), load()]);
    } catch (error) {
      notify('error', errMsg(error));
    }
  }

  const flaggedCount = useMemo(
    () => records.filter((record) => record.late || record.earlyCheckout).length,
    [records]
  );

  const filtersActive =
    !!filters.date || !!filters.employeeId || !!filters.status || filters.lateOnly;

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>Attendance</h1>
          <p className="muted">
            Check-in and check-out times, day type, late arrivals and corrections.
            {config
              ? ` Shift ${formatTime(config.shiftStart)}–${formatTime(config.shiftEnd)} · ${config.graceMinutes} min grace.`
              : ''}
          </p>
        </div>
        <button className="primary" onClick={() => onNavigate('employees')}>
          <Plus size={17} /> Add employee
        </button>
      </div>

      <div className="stats-grid">
        {StatCard({
          label: 'Present days',
          value: summary?.present ?? 0,
          icon: <UserCheck size={19} />,
          foot: summary?.halfDays ? `${summary.halfDays} half day(s)` : `${filters.month} total`,
        })}
        {StatCard({
          label: 'Absent days',
          value: summary?.absent ?? 0,
          icon: <UserX size={19} />,
          foot: 'Confirmed absences',
        })}
        {StatCard({
          label: 'Leave days',
          value: summary?.leave ?? 0,
          icon: <CalendarDays size={19} />,
          foot: 'Approved leave',
        })}
        {StatCard({
          label: 'Late arrivals',
          value: summary?.late ?? 0,
          icon: <Clock size={19} />,
          foot: summary?.earlyCheckout ? `${summary.earlyCheckout} early checkout(s)` : 'After shift start + grace',
        })}
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Mark or add attendance</h2>
            <p className="muted small-text">
              Select an employee, date and status. Saving again updates that day. Leave times blank to record a full day.
            </p>
          </div>
        </div>
        <form className="mark-grid attendance-form" onSubmit={markAttendance}>
          <label>
            Employee
            <select
              required
              value={mark.employeeId}
              onChange={(event) => setMark({ ...mark, employeeId: event.target.value })}
            >
              <option value="">Select employee</option>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                  {employee.employeeCode ? ` (${employee.employeeCode})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              required
              value={mark.date}
              onChange={(event) => setMark({ ...mark, date: event.target.value })}
            />
          </label>
          <label>
            Status
            <select
              value={mark.status}
              onChange={(event) => setMark({ ...mark, status: event.target.value })}
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
              value={mark.checkIn}
              disabled={mark.status !== 'Present'}
              onChange={(event) => setMark({ ...mark, checkIn: event.target.value })}
            />
          </label>
          <label>
            Check out
            <input
              type="time"
              value={mark.checkOut}
              disabled={mark.status !== 'Present'}
              onChange={(event) => setMark({ ...mark, checkOut: event.target.value })}
            />
          </label>
          <label>
            Day type
            <select
              value={mark.dayType}
              disabled={mark.status !== 'Present'}
              onChange={(event) => setMark({ ...mark, dayType: event.target.value })}
            >
              <option value="">Auto from hours</option>
              <option value="Full day">Full day</option>
              <option value="Half day">Half day</option>
            </select>
          </label>
          <button className="primary" disabled={markBusy || activeEmployees.length === 0}>
            {markBusy ? 'Saving...' : 'Save attendance'}
          </button>
        </form>
      </section>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === 'all' ? 'active' : ''}`}
          onClick={() => setTab('all')}
        >
          Attendance records
          <span className="tab-count">{records.length}</span>
        </button>
        <button
          type="button"
          className={`tab ${tab === 'pending' ? 'active' : ''}`}
          onClick={() => setTab('pending')}
        >
          Pending self-marks
          {pending.length > 0 && <span className="tab-count badge-warn">{pending.length}</span>}
        </button>
      </div>

      {tab === 'all' && (
        <section className="panel">
          <div className="panel-heading responsive-heading">
            <div>
              <h2>Attendance records</h2>
              <p className="muted small-text">
                {filtersActive
                  ? 'Filtered view. Exact date overrides the selected month.'
                  : 'Review records for the selected month.'}
                {flaggedCount ? ` ${flaggedCount} record(s) flagged late or early.` : ''}
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
              <select
                value={filters.status}
                onChange={(event) => setFilters({ ...filters, status: event.target.value })}
              >
                <option value="">All statuses</option>
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Leave">Leave</option>
              </select>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={filters.lateOnly}
                  onChange={(event) => setFilters({ ...filters, lateOnly: event.target.checked })}
                />
                Late only
              </label>
              {filtersActive && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    setFilters({ ...filters, date: '', employeeId: '', status: '', lateOnly: false })
                  }
                >
                  Clear filters
                </button>
              )}
              <button className="icon-btn" onClick={load} title="Refresh" type="button">
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
                    <th>Flags</th>
                    <th>Approval</th>
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
                      <td>{formatTime(record.checkIn)}</td>
                      <td>{formatTime(record.checkOut)}</td>
                      <td>{record.hoursLabel}</td>
                      <td>
                        <Status status={record.status} />
                      </td>
                      <td>{record.status === 'Present' ? record.dayType : '—'}</td>
                      <td>
                        <DayFlag
                          late={record.late}
                          earlyCheckout={record.earlyCheckout}
                          missingCheckOut={record.missingCheckOut}
                          missingCheckIn={record.missingCheckIn}
                        />
                      </td>
                      <td>
                        <Status status={record.approval} />
                        {record.source === 'self' && (
                          <small className="cell-note">Self-marked</small>
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
      )}

      {tab === 'pending' && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Self-mark approvals</h2>
              <p className="muted small-text">
                Accounts confirmed count toward attendance. Rejecting removes the claim.
              </p>
            </div>
            <button className="icon-btn" onClick={loadPending} title="Refresh" type="button">
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="table-wrap">
            {pendingLoading ? (
              <Spinner label="Loading approvals..." />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Marked</th>
                    <th>Check in / out</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((record) => (
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
                        <Status status={record.status} />
                      </td>
                      <td>
                        {formatTime(record.checkIn)} – {formatTime(record.checkOut)}
                      </td>
                      <td>{record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—'}</td>
                      <td>
                        <div className="row-actions">
                          <button className="approve-btn" onClick={() => review(record.id, 'approve')}>
                            <Check size={14} /> Confirm
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() =>
                              askConfirm({
                                title: 'Reject this self-mark?',
                                message: `${record.employee?.name || 'This employee'} marked ${record.date} as ${record.status}. The record will be marked rejected and will not count.`,
                                confirmLabel: 'Reject',
                                danger: true,
                                onConfirm: () => review(record.id, 'reject'),
                              })
                            }
                          >
                            <X size={14} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pending.length && (
                    <tr>
                      <td colSpan="6" className="empty">
                        No self-marks awaiting approval.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

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
