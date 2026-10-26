import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Users,
  UserRound,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Spinner from '../../components/Spinner';
import { getEmployees } from '../../lib/employeeDirectory';
import { currentMonth, formatDate, formatExactTime, formatTime } from '../../lib/dates';
import { downloadBlob, errMsg, initials } from '../../lib/format';
import { readPageCache, writePageCache } from '../../lib/pageCache';

const reportKey = (month, scope) => `admin:report:${month}|${scope || 'team'}`;

const attendanceTone = (value) =>
  value >= 90 ? 'good' : value >= 75 ? 'warn' : 'bad';

export default function Reports() {
  const notify = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [scope, setScope] = useState('');
  const [employees, setEmployees] = useState([]);
  const [report, setReport] = useState(() =>
    readPageCache(reportKey(currentMonth(), ''))
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(
    () => !readPageCache(reportKey(currentMonth(), ''))
  );
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    let alive = true;
    getEmployees()
      .then((list) => {
        if (alive) setEmployees(list);
      })
      .catch((loadError) => notify('error', errMsg(loadError)));
    return () => {
      alive = false;
    };
  }, []);

  async function load({ silent = false } = {}) {
    const cacheKey = reportKey(month, scope);
    const cached = readPageCache(cacheKey);
    if (cached) {
      setReport(cached);
      if (!silent) setLoading(false);
    } else if (!silent) {
      setLoading(true);
    }
    setError('');
    try {
      const params = { month };
      if (scope) params.employeeId = scope;
      const { data } = await api.get('/reports/attendance', { params });
      setReport(data);
      writePageCache(cacheKey, data);
    } catch (loadError) {
      setReport(null);
      setError(errMsg(loadError));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [month, scope]);

  async function download(type) {
    setDownloading(type);
    try {
      const params = { month };
      if (scope) params.employeeId = scope;
      const response = await api.get(`/reports/attendance.${type}`, {
        params,
        responseType: 'blob',
        timeout: 120000,
      });

      const disposition = response.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const fallback = `attendance-${month}-${scope ? 'employee' : 'team'}.${type}`;
      downloadBlob(response.data, match?.[1] || fallback);
      notify('success', `${type.toUpperCase()} report downloaded.`);
    } catch (downloadError) {
      // With responseType 'blob', JSON error bodies arrive as a Blob. Pull the
      // text back out so the shared error helper can explain what happened.
      if (downloadError.response?.data instanceof Blob) {
        try {
          const text = await downloadError.response.data.text();
          try {
            downloadError.response.data = JSON.parse(text);
          } catch {
            downloadError.response.data = text;
          }
        } catch {
          /* keep the original error */
        }
      }
      notify('error', errMsg(downloadError));
    } finally {
      setDownloading('');
    }
  }

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === scope) || null,
    [employees, scope]
  );

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>Reports</h1>
          <p className="muted">
            Monthly attendance for the whole team or one employee. Download the same figures as
            Excel or PDF.
          </p>
        </div>
        <div className="filters">
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            title="Report month"
          />
          <select value={scope} onChange={(event) => setScope(event.target.value)} title="Report scope">
            <option value="">Whole team</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
          <button className="icon-btn" onClick={() => load()} title="Refresh" type="button">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <section className="panel report-toolbar">
        <div className="report-scope">
          <div className="report-scope-icon">
            {selectedEmployee ? <UserRound size={20} /> : <Users size={20} />}
          </div>
          <div>
            <h2>
              {selectedEmployee ? `${selectedEmployee.name} — ${month}` : `Team report — ${month}`}
            </h2>
            <p className="muted small-text">
              {report
                ? `${report.meta.workingDays} working days · Shift ${formatTime(
                    report.meta.config.shiftStart
                  )}–${formatTime(report.meta.config.shiftEnd)} · Grace ${
                    report.meta.config.graceMinutes
                  } min`
                : error
                  ? 'Report unavailable until the backend is reachable.'
                  : 'Preparing report...'}
            </p>
          </div>
        </div>
        <div className="report-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => download('xlsx')}
            disabled={loading || !report || Boolean(downloading)}
          >
            <FileSpreadsheet size={16} />
            {downloading === 'xlsx' ? 'Preparing...' : 'Download Excel'}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => download('pdf')}
            disabled={loading || !report || Boolean(downloading)}
          >
            <FileText size={16} />
            {downloading === 'pdf' ? 'Preparing...' : 'Download PDF'}
          </button>
        </div>
      </section>

      {loading ? (
        <Spinner label="Building report..." />
      ) : !report ? (
        <section className="panel report-error">
          <div className="report-error-icon">
            <AlertTriangle size={22} />
          </div>
          <h2>Could not build this report</h2>
          <p className="muted">
            {error || 'The backend did not return a report for this month.'}
          </p>
          <div className="report-error-actions">
            <button type="button" className="primary" onClick={() => load()}>
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        </section>
      ) : report.meta.scope === 'individual' ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Daily attendance</h2>
              <p className="muted small-text">
                Every recorded day for {report.meta.employee.name} in {month}. Sessions show the
                exact check-in and check-out timestamps. Half days count as 0.5; leave is excluded
                from the attendance percentage.
              </p>
            </div>
            <span
              className={`percent-pill ${attendanceTone(
                report.totals.attendancePercentage
              )}`}
              title="Half days count as 0.5; leave is excluded"
            >
              {report.totals.attendancePercentage}% attendance
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Sessions</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Hours</th>
                  <th>Day type</th>
                  <th>Late</th>
                  <th>Early out</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {report.days.map((day) => (
                  <tr key={day.date}>
                    <td>{formatDate(day.date)}</td>
                    <td>{day.status}</td>
                    <td>
                      {day.sessionCount ? (
                        <details className="session-details">
                          <summary>
                            {day.sessionCount} session{day.sessionCount === 1 ? '' : 's'}
                            {day.openSessionCount ? ` · ${day.openSessionCount} open` : ''}
                          </summary>
                          <div className="session-details-list">
                            {(day.sessions || []).map((session, index) => (
                              <div key={session.id || index} className="session-detail-row">
                                <span>Session {index + 1}</span>
                                <b>
                                  {formatTime(session.checkIn)} –{' '}
                                  {session.checkOut ? formatTime(session.checkOut) : 'open'}
                                </b>
                                <small>
                                  {session.checkInAt
                                    ? `in ${formatExactTime(
                                        session.checkInAt,
                                        report.meta.config.timeZone
                                      )}`
                                    : ''}
                                  {session.checkOutAt
                                    ? ` · out ${formatExactTime(
                                        session.checkOutAt,
                                        report.meta.config.timeZone
                                      )}`
                                    : ''}
                                </small>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {formatTime(day.checkIn)}
                      {day.checkInAt && (
                        <small className="cell-note">
                          exact{' '}
                          {formatExactTime(day.checkInAt, report.meta.config.timeZone)}
                        </small>
                      )}
                    </td>
                    <td>
                      {day.checkOut || day.checkOutAt
                        ? formatTime(day.checkOut)
                        : day.openSessionCount
                          ? 'Still checked in'
                          : '-'}
                      {day.checkOutAt && (
                        <small className="cell-note">
                          exact{' '}
                          {formatExactTime(day.checkOutAt, report.meta.config.timeZone)}
                        </small>
                      )}
                      {day.openSessionCount > 0 && (
                        <small className="cell-note">
                          {day.openSessionCount} session
                          {day.openSessionCount === 1 ? '' : 's'} still open
                        </small>
                      )}
                    </td>
                    <td>{day.hoursLabel}</td>
                    <td>{day.status === 'Present' ? day.dayType : '—'}</td>
                    <td>{day.late ? 'Yes' : 'No'}</td>
                    <td>{day.earlyCheckout ? 'Yes' : 'No'}</td>
                    <td className="reason-cell">{day.note || '—'}</td>
                  </tr>
                ))}
                {!report.days.length && (
                  <tr>
                    <td colSpan="10" className="empty">
                      No attendance recorded for this employee in {month}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Monthly attendance</h2>
              <p className="muted small-text">
                Full and half days come from attendance. Permission counts approved requests in the
                selected month. Check-ins and check-outs count every session.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Full day</th>
                  <th>Half day</th>
                  <th>Permission</th>
                  <th>Check-ins</th>
                  <th>Check-outs</th>
                  <th>Open</th>
                  <th>Early logout</th>
                  <th>Leave</th>
                  <th>Attendance %</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.employee.id}>
                    <td>
                      <div className="employee-cell">
                        <div className="avatar tiny">{initials(row.employee.name)}</div>
                        <div>
                          <b>{row.employee.name}</b>
                          <small>{row.employee.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>{row.employee.department || '—'}</td>
                    <td>{row.fullDays}</td>
                    <td>{row.halfDays}</td>
                    <td>{row.permission}</td>
                    <td>{row.checkIns}</td>
                    <td>{row.checkOuts}</td>
                    <td>{row.openSessions}</td>
                    <td>{row.earlyCheckout}</td>
                    <td>{row.leave}</td>
                    <td>{row.attendancePercentage}%</td>
                  </tr>
                ))}
                {!report.rows.length && (
                  <tr>
                    <td colSpan="11" className="empty">
                      No employees on record yet.
                    </td>
                  </tr>
                )}
              </tbody>
              {report.rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td>
                      <b>Team total</b>
                    </td>
                    <td />
                    <td>
                      <b>{report.totals.fullDays}</b>
                    </td>
                    <td>
                      <b>{report.totals.halfDays}</b>
                    </td>
                    <td>
                      <b>{report.totals.permission}</b>
                    </td>
                    <td>
                      <b>{report.totals.checkIns}</b>
                    </td>
                    <td>
                      <b>{report.totals.checkOuts}</b>
                    </td>
                    <td>
                      <b>{report.totals.openSessions}</b>
                    </td>
                    <td>
                      <b>{report.totals.earlyCheckout}</b>
                    </td>
                    <td>
                      <b>{report.totals.leave}</b>
                    </td>
                    <td>
                      <b>{report.totals.attendancePercentage}%</b>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
