import { useEffect, useMemo, useState } from 'react';
import { Check, CalendarPlus, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import Spinner from '../../components/Spinner';
import { Status, DayFlag } from '../../components/Ui';
import { currentMonth, formatDate, formatExactTime, formatTime, todayKey } from '../../lib/dates';
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

const MARK_EMPTY = {
  employeeId: '',
  date: '',
  status: 'Present',
  checkIn: '',
  checkOut: '',
  dayType: '',
  location: 'Office',
  note: '',
};

const REPORT_FORM_EMPTY = {
  checkIn: '',
  checkOut: '',
  dayType: '',
  location: 'Office',
  note: '',
};

const reportCacheKey = (filters, status) =>
  `admin:missed:${
    status === 'Pending' ? 'pending' : `${filters.month}|${filters.date || 'all'}`
  }|${filters.employeeId || 'all'}|${status || 'all'}`;

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
  const [reports, setReports] = useState(() => {
    const cached = readPageCache(reportCacheKey(INITIAL_FILTERS, 'Pending'));
    return Array.isArray(cached) ? cached : [];
  });
  const [reportStatus, setReportStatus] = useState('Pending');
  const [reportsLoading, setReportsLoading] = useState(
    () => !readPageCache(reportCacheKey(INITIAL_FILTERS, 'Pending'))
  );
  const [markOpen, setMarkOpen] = useState(false);
  const [markForm, setMarkForm] = useState(MARK_EMPTY);
  const [markBusy, setMarkBusy] = useState(false);
  const [approving, setApproving] = useState(null);
  const [approveForm, setApproveForm] = useState(REPORT_FORM_EMPTY);
  const [approveBusy, setApproveBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

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

  async function loadReports({ silent = false } = {}) {
    const cacheKey = reportCacheKey(filters, reportStatus);
    const cached = readPageCache(cacheKey);
    if (Array.isArray(cached)) {
      setReports(cached);
      if (!silent) setReportsLoading(false);
    } else if (!silent) {
      setReports([]);
      setReportsLoading(true);
    }

    try {
      const params = {};
      // Pending reports are shown across every month so a forgotten check-in is
      // never hidden just because the attendance table is on another month.
      if (reportStatus !== 'Pending') {
        if (filters.date) params.date = filters.date;
        else if (filters.month) params.month = filters.month;
      }
      if (filters.employeeId) params.employeeId = filters.employeeId;
      if (reportStatus) params.status = reportStatus;

      const { data } = await api.get('/missed-check-ins', { params });
      const nextReports = data.reports || [];
      setReports(nextReports);
      writePageCache(cacheKey, nextReports);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      if (!silent) setReportsLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees().catch((error) => notify('error', errMsg(error)));
  }, []);

  useEffect(() => {
    load();
  }, [filters.month, filters.date, filters.employeeId]);

  useEffect(() => {
    loadReports();
  }, [filters.month, filters.date, filters.employeeId, reportStatus]);

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

  function openMarkModal() {
    setMarkForm({
      ...MARK_EMPTY,
      date: todayKey(),
      employeeId: filters.employeeId || '',
    });
    setMarkOpen(true);
  }

  async function saveMark(event) {
    event.preventDefault();
    if (!markForm.employeeId) {
      notify('error', 'Choose an employee.');
      return;
    }
    if (!markForm.date) {
      notify('error', 'Choose the date to mark.');
      return;
    }
    if (markForm.date > todayKey()) {
      notify('error', 'Attendance cannot be marked for a future date.');
      return;
    }
    if (
      markForm.status === 'Present' &&
      markForm.checkIn &&
      markForm.checkOut &&
      markForm.checkOut <= markForm.checkIn
    ) {
      notify('error', 'Check-out must be later than check-in.');
      return;
    }

    setMarkBusy(true);
    try {
      await api.post('/attendance', {
        employeeId: markForm.employeeId,
        date: markForm.date,
        status: markForm.status,
        checkIn: markForm.status === 'Present' ? markForm.checkIn : '',
        checkOut: markForm.status === 'Present' ? markForm.checkOut : '',
        dayType: markForm.status === 'Present' ? markForm.dayType : '',
        location: markForm.status === 'Present' ? markForm.location : '',
        note: markForm.note,
      });
      const employeeName =
        employees.find((employee) => employee.id === markForm.employeeId)?.name || 'employee';
      notify('success', `Attendance marked for ${employeeName} on ${formatDate(markForm.date)}.`);
      setMarkOpen(false);
      clearPageCache();

      const targetMonth = markForm.date.slice(0, 7);
      const sameView =
        filters.month === targetMonth &&
        (!filters.date || filters.date === markForm.date) &&
        (!filters.employeeId || filters.employeeId === markForm.employeeId);
      if (sameView) {
        await load({ silent: true });
      } else {
        setFilters({
          month: targetMonth,
          date: markForm.date,
          employeeId: markForm.employeeId,
        });
      }
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setMarkBusy(false);
    }
  }

  function openApprove(report) {
    setApproving(report);
    setApproveForm({
      checkIn: report.requestedCheckIn || '',
      checkOut: report.requestedCheckOut || '',
      dayType: '',
      location: report.location || 'Office',
      note: '',
    });
  }

  async function saveApprove(event) {
    event.preventDefault();
    if (!approving) return;
    if (approving.date < todayKey() && (!approveForm.checkIn || !approveForm.checkOut)) {
      notify('error', 'For a past date, enter both check-in and check-out times.');
      return;
    }
    if (
      approveForm.checkIn &&
      approveForm.checkOut &&
      approveForm.checkOut <= approveForm.checkIn
    ) {
      notify('error', 'Check-out must be later than check-in.');
      return;
    }

    setApproveBusy(true);
    try {
      await api.patch(`/missed-check-ins/${approving.id}/review`, {
        action: 'approve',
        ...approveForm,
      });
      notify(
        'success',
        `Attendance marked for ${approving.employee?.name || 'employee'} on ${formatDate(
          approving.date
        )}.`
      );
      setApproving(null);
      clearPageCache();
      await Promise.all([load({ silent: true }), loadReports({ silent: true })]);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setApproveBusy(false);
    }
  }

  async function rejectReport(report) {
    try {
      await api.patch(`/missed-check-ins/${report.id}/review`, { action: 'reject' });
      notify(
        'success',
        `Missed check-in report rejected for ${formatDate(report.date)}.`
      );
      clearPageCache();
      await loadReports({ silent: true });
    } catch (error) {
      notify('error', errMsg(error));
    }
  }

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
            correct a record when needed, or mark attendance for a day with no entry.
          </p>
        </div>
        <button className="primary" type="button" onClick={openMarkModal}>
          <Plus size={16} /> Mark attendance
        </button>
      </div>

      <section className="panel">
        <div className="panel-heading responsive-heading">
          <div>
            <h2 className="title-with-icon">
              <CalendarPlus size={16} /> Missed check-in reports
              {reportStatus === 'Pending' && reports.length > 0 && (
                <span className="tab-count badge-warn">{reports.length}</span>
              )}
            </h2>
            <p className="muted small-text">
              Employees can report a day they forgot to check in. Use Mark attendance to confirm
              the times and record the day.
            </p>
          </div>
          <div className="filters">
            <select
              value={reportStatus}
              onChange={(event) => setReportStatus(event.target.value)}
              title="Report status"
            >
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="">All reports</option>
            </select>
            <button
              className="icon-btn"
              onClick={() => loadReports()}
              title="Refresh reports"
              type="button"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="table-wrap">
          {reportsLoading ? (
            <Spinner label="Loading missed check-in reports..." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Reported times</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Reviewed by</th>
                  <th className="col-action">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <div className="employee-cell">
                        <div className="avatar tiny">{initials(report.employee?.name)}</div>
                        <div>
                          <b>{report.employee?.name || 'Employee'}</b>
                          <small>
                            {report.employee?.department || report.employee?.email}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{formatDate(report.date)}</td>
                    <td>
                      {report.requestedCheckIn || report.requestedCheckOut
                        ? `${formatTime(report.requestedCheckIn)} – ${formatTime(
                            report.requestedCheckOut
                          )}`
                        : '—'}
                    </td>
                    <td className="reason-cell" title={report.reason}>
                      {report.reason}
                    </td>
                    <td>
                      <Status status={report.status} />
                    </td>
                    <td>
                      {report.reviewer?.name || '—'}
                      {report.reviewNote && (
                        <small className="cell-note">{report.reviewNote}</small>
                      )}
                    </td>
                    <td className="col-action">
                      {report.status === 'Pending' ? (
                        <div className="row-actions">
                          <button
                            className="approve-btn"
                            type="button"
                            onClick={() => openApprove(report)}
                          >
                            <Check size={14} /> Mark attendance
                          </button>
                          <button
                            className="reject-btn"
                            type="button"
                            onClick={() =>
                              setConfirm({
                                title: 'Reject missed check-in report?',
                                message: `${
                                  report.employee?.name || 'This employee'
                                } reported a missed check-in on ${formatDate(report.date)}.`,
                                confirmLabel: 'Reject',
                                danger: true,
                                onConfirm: () => rejectReport(report),
                              })
                            }
                          >
                            <X size={14} /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="muted small-text">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!reports.length && (
                  <tr>
                    <td colSpan="7" className="empty">
                      No missed check-in reports match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

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

      {markOpen && (
        <div className="modal-backdrop" onClick={() => setMarkOpen(false)}>
          <div className="modal wide" onClick={(event) => event.stopPropagation()}>
            <h3>Mark attendance</h3>
            <p className="muted">
              Create a record for an employee and date with no attendance entry. Times are
              optional; leaving them blank records a Present day without a session. To change an
              existing row, use Edit instead.
            </p>
            <form className="edit-form" onSubmit={saveMark}>
              <label>
                Employee
                <select
                  required
                  value={markForm.employeeId}
                  onChange={(event) =>
                    setMarkForm({ ...markForm, employeeId: event.target.value })
                  }
                >
                  <option value="">Choose employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  type="date"
                  required
                  max={todayKey()}
                  value={markForm.date}
                  onChange={(event) => setMarkForm({ ...markForm, date: event.target.value })}
                />
              </label>
              <label>
                Status
                <select
                  value={markForm.status}
                  onChange={(event) => {
                    const status = event.target.value;
                    setMarkForm({
                      ...markForm,
                      status,
                      checkIn: status === 'Present' ? markForm.checkIn : '',
                      checkOut: status === 'Present' ? markForm.checkOut : '',
                      dayType: status === 'Present' ? markForm.dayType : '',
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
                  value={markForm.checkIn}
                  disabled={markForm.status !== 'Present'}
                  onChange={(event) =>
                    setMarkForm({ ...markForm, checkIn: event.target.value })
                  }
                />
              </label>
              <label>
                Check out
                <input
                  type="time"
                  value={markForm.checkOut}
                  disabled={markForm.status !== 'Present'}
                  onChange={(event) =>
                    setMarkForm({ ...markForm, checkOut: event.target.value })
                  }
                />
              </label>
              <label>
                Day type
                <select
                  value={markForm.dayType}
                  disabled={markForm.status !== 'Present'}
                  onChange={(event) =>
                    setMarkForm({ ...markForm, dayType: event.target.value })
                  }
                >
                  <option value="">Auto from hours</option>
                  <option value="Full day">Full day</option>
                  <option value="Half day">Half day</option>
                </select>
              </label>
              <label className="edit-note">
                Location
                <select
                  value={markForm.location}
                  disabled={markForm.status !== 'Present'}
                  onChange={(event) =>
                    setMarkForm({ ...markForm, location: event.target.value })
                  }
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
                  value={markForm.note}
                  onChange={(event) => setMarkForm({ ...markForm, note: event.target.value })}
                  placeholder="Why is this record being added? (optional)"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setMarkOpen(false)}>
                  Cancel
                </button>
                <button className="primary" disabled={markBusy}>
                  {markBusy ? 'Saving...' : 'Mark attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {approving && (
        <div className="modal-backdrop" onClick={() => setApproving(null)}>
          <div className="modal wide" onClick={(event) => event.stopPropagation()}>
            <h3>Mark attendance for this report</h3>
            <p className="muted">
              {approving.employee?.name || 'Employee'} · {formatDate(approving.date)}
              {approving.requestedCheckIn || approving.requestedCheckOut
                ? ` · reported ${formatTime(approving.requestedCheckIn)} – ${formatTime(
                    approving.requestedCheckOut
                  )}`
                : ''}
            </p>
            <div className="modal-sessions">
              <p className="late-reason-title">Employee reason</p>
              <p className="muted small-text">{approving.reason}</p>
            </div>
            <form className="edit-form" onSubmit={saveApprove}>
              <label>
                Check in
                <input
                  type="time"
                  required
                  value={approveForm.checkIn}
                  onChange={(event) =>
                    setApproveForm({ ...approveForm, checkIn: event.target.value })
                  }
                />
              </label>
              <label>
                Check out{approving.date < todayKey() ? '' : ' (optional)'}
                <input
                  type="time"
                  required={approving.date < todayKey()}
                  value={approveForm.checkOut}
                  onChange={(event) =>
                    setApproveForm({ ...approveForm, checkOut: event.target.value })
                  }
                />
              </label>
              <label>
                Day type
                <select
                  value={approveForm.dayType}
                  onChange={(event) =>
                    setApproveForm({ ...approveForm, dayType: event.target.value })
                  }
                >
                  <option value="">Auto from hours</option>
                  <option value="Full day">Full day</option>
                  <option value="Half day">Half day</option>
                </select>
              </label>
              <label>
                Location
                <select
                  value={approveForm.location}
                  onChange={(event) =>
                    setApproveForm({ ...approveForm, location: event.target.value })
                  }
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
                  value={approveForm.note}
                  onChange={(event) =>
                    setApproveForm({ ...approveForm, note: event.target.value })
                  }
                  placeholder="Optional note for the attendance record"
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setApproving(null)}>
                  Cancel
                </button>
                <button className="primary" disabled={approveBusy}>
                  {approveBusy ? 'Saving...' : 'Approve and mark'}
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
