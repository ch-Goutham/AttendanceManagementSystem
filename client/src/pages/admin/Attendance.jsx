import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Pencil } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Spinner from '../../components/Spinner';
import { Status, DayFlag } from '../../components/Ui';
import { currentMonth, formatDate, formatExactTime, formatTime } from '../../lib/dates';
import { errMsg, initials } from '../../lib/format';
import { getEmployees } from '../../lib/employeeDirectory';
import { clearPageCache, readPageCache, writePageCache } from '../../lib/pageCache';

const LOCATIONS = ['Office', 'Work from home', 'College'];
const LOCATION_BADGES = { Office: 'office', 'Work from home': 'wfh', College: 'college' };
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
  const [records, setRecords] = useState(() => {
    const cached = readPageCache(attendanceKey(INITIAL_FILTERS));
    return (Array.isArray(cached) ? cached : cached?.records) || [];
  });
  const [timeZone, setTimeZone] = useState(() => {
    const cached = readPageCache(attendanceKey(INITIAL_FILTERS));
    return Array.isArray(cached) ? '' : cached?.timeZone || '';
  });
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
    const cachedRecords = Array.isArray(cached) ? cached : cached?.records;
    if (cachedRecords) {
      setRecords(cachedRecords);
      if (!Array.isArray(cached)) setTimeZone(cached.timeZone || '');
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
      const payload = { records: data.records || [], timeZone: data.timeZone || '' };
      setRecords(payload.records);
      setTimeZone(payload.timeZone);
      writePageCache(cacheKey, payload);
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

  // One row per check-in/check-out session so a day with several sessions is
  // readable at a glance. The parent day record stays attached for editing.
  // Rows are ordered by employee name A-Z, then newest date first, then session.
  const rows = useMemo(() => {
    const list = [];
    for (const record of records) {
      const sessions = Array.isArray(record.sessions) ? record.sessions : [];
      if (!sessions.length) {
        list.push({ key: record.id, record, session: null, sessionNumber: 0 });
        continue;
      }
      sessions.forEach((session, index) => {
        list.push({
          key: `${record.id}:${session.id || index}`,
          record,
          session,
          sessionNumber: index + 1,
        });
      });
    }
    return list.sort((a, b) => {
      const byName = (a.record.employee?.name || '').localeCompare(
        b.record.employee?.name || '',
        undefined,
        { sensitivity: 'base' }
      );
      if (byName) return byName;
      if (a.record.date !== b.record.date) return a.record.date < b.record.date ? 1 : -1;
      return a.sessionNumber - b.sessionNumber;
    });
  }, [records]);

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>Attendance</h1>
          <p className="muted">
            View every employee&apos;s daily check-in and check-out counts, exact session
            timestamps, day type and late or early flags. Each session is listed on its own row;
            correct a record when needed.
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
                  <th>Session</th>
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
                {rows.map(({ key, record, session, sessionNumber }) => {
                  // Day-level cells render once, on the first session row.
                  const isDayStart = sessionNumber <= 1;
                  const sessionCount = record.sessionCount ?? (record.sessions?.length || 0);
                  const checkOutCount =
                    record.checkOutCount ??
                    (record.sessions || []).filter((item) => item.checkOut || item.checkOutAt)
                      .length;
                  const openCount =
                    record.openSessionCount ?? Math.max(0, sessionCount - checkOutCount);
                  const multiSession = sessionCount > 1;
                  return (
                    <tr key={key}>
                      <td>
                        <div className="employee-cell">
                          <div className="avatar tiny">{initials(record.employee?.name)}</div>
                          <div>
                            <b>{record.employee?.name || 'Employee'}</b>
                            <small>{record.employee?.department || record.employee?.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>{isDayStart ? formatDate(record.date) : ''}</td>
                      <td>
                        {session ? (
                          <>
                            <b>Session {sessionNumber}</b>
                            {multiSession && (
                              <small className="cell-note">of {sessionCount}</small>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                        {isDayStart && (
                          <small className="cell-note">
                            {sessionCount
                              ? `${sessionCount} check-in${
                                  sessionCount === 1 ? '' : 's'
                                } · ${checkOutCount} check-out${
                                  checkOutCount === 1 ? '' : 's'
                                }${openCount ? ` · ${openCount} open` : ''}`
                              : 'No sessions'}
                          </small>
                        )}
                      </td>
                      <td>
                        {formatTime(session?.checkIn)}
                        {session?.checkInAt && (
                          <small className="cell-note">
                            exact {formatExactTime(session.checkInAt, timeZone)}
                          </small>
                        )}
                      </td>
                      <td>
                        {session
                          ? session.checkOut || session.checkOutAt
                            ? formatTime(session.checkOut)
                            : 'Still checked in'
                          : '-'}
                        {session?.checkOutAt && (
                          <small className="cell-note">
                            exact {formatExactTime(session.checkOutAt, timeZone)}
                          </small>
                        )}
                      </td>
                      <td>
                        {session ? session.hoursLabel : '—'}
                        {isDayStart && multiSession && (
                          <small className="cell-note">Day total: {record.hoursLabel}</small>
                        )}
                      </td>
                      <td>{isDayStart ? <Status status={record.status} /> : ''}</td>
                      <td>{isDayStart ? (record.status === 'Present' ? record.dayType : '—') : ''}</td>
                      <td>
                        {isDayStart ? (
                          <span
                            className={`location-badge ${
                              LOCATION_BADGES[record.location] || 'office'
                            }`}
                          >
                            {record.location || '—'}
                          </span>
                        ) : (
                          ''
                        )}
                      </td>
                      <td>
                        {isDayStart ? (
                          <>
                            <DayFlag
                              late={record.late}
                              earlyCheckout={record.earlyCheckout}
                              missingCheckOut={record.missingCheckOut}
                              missingCheckIn={record.missingCheckIn}
                            />
                            {record.late && record.lateReason && (
                              <small
                                className="cell-note late-reason-note"
                                title={record.lateReason}
                              >
                                Reason: {record.lateReason}
                              </small>
                            )}
                          </>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="col-action">
                        {isDayStart ? (
                          <button className="link-btn" onClick={() => startEdit(record)}>
                            <Pencil size={13} /> Edit
                          </button>
                        ) : (
                          ''
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan="11" className="empty">
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
            {Array.isArray(editing.sessions) && editing.sessions.length > 0 && (
              <div className="modal-sessions">
                <p className="late-reason-title">
                  Sessions · {editing.sessionCount}
                </p>
                {editing.sessions.map((session, index) => (
                  <div className="modal-session" key={session.id || index}>
                    <span>Session {index + 1}</span>
                    <b>
                      {formatTime(session.checkIn)} →{' '}
                      {session.checkOut ? formatTime(session.checkOut) : 'open'}
                    </b>
                    <small>
                      {session.checkInAt
                        ? `in ${formatExactTime(session.checkInAt, timeZone)}`
                        : ''}
                      {session.checkOutAt
                        ? ` · out ${formatExactTime(session.checkOutAt, timeZone)}`
                        : ''}
                      {session.hoursLabel && session.hoursLabel !== '—'
                        ? ` · ${session.hoursLabel}`
                        : ''}
                    </small>
                  </div>
                ))}
                {(editing.sessionCount || 0) > 1 && (
                  <p className="muted small-text">
                    Changing the check-in or check-out fields below replaces the session history.
                  </p>
                )}
              </div>
            )}
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
                  {LOCATIONS.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
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
