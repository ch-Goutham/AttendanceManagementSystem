import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  CalendarDays,
  Users,
  UserRound,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Spinner from '../../components/Spinner';
import { StatCard } from '../../components/Ui';
import { currentMonth, formatDate, formatTime } from '../../lib/dates';
import { downloadBlob, errMsg, initials } from '../../lib/format';

const summaryCards = (report) => [
  ['Present days', report.totals.weightedPresent, `${report.totals.fullDays} full · ${report.totals.halfDays} half`],
  ['Absent days', report.totals.absent, 'Excluded from leave'],
  ['Leave days', report.totals.leave, 'Approved leave only'],
  ['Late arrivals', report.totals.late, `${report.totals.earlyCheckout} early checkout(s)`],
];

export default function Reports() {
  const notify = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [scope, setScope] = useState('');
  const [employees, setEmployees] = useState([]);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    api
      .get('/employees')
      .then(({ data }) => {
        setEmployees((data.employees || []).filter((employee) => employee.role === 'employee'));
      })
      .catch((error) => notify('error', errMsg(error)));
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = { month };
      if (scope) params.employeeId = scope;
      const { data } = await api.get('/reports/attendance', { params });
      setReport(data);
    } catch (loadError) {
      setReport(null);
      setError(errMsg(loadError));
    } finally {
      setLoading(false);
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
          <button className="icon-btn" onClick={load} title="Refresh" type="button">
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
            <button type="button" className="primary" onClick={load}>
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="stats-grid stats-five">
            {summaryCards(report).map(([label, value, foot]) => (
              <StatCard
                key={label}
                label={label}
                value={value}
                icon={<CalendarDays size={19} />}
                foot={foot}
              />
            ))}
            <StatCard
              label="Attendance rate"
              value={`${report.totals.attendancePercentage}%`}
              icon={<FileText size={19} />}
              foot="Half days count as 0.5"
            />
          </div>

          {report.meta.scope === 'individual' ? (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Daily attendance</h2>
                  <p className="muted small-text">
                    Every recorded day for {report.meta.employee.name} in {month}.
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
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
                        <td>{formatTime(day.checkIn)}</td>
                        <td>{formatTime(day.checkOut)}</td>
                        <td>{day.hoursLabel}</td>
                        <td>{day.status === 'Present' ? day.dayType : '—'}</td>
                        <td>{day.late ? 'Yes' : 'No'}</td>
                        <td>{day.earlyCheckout ? 'Yes' : 'No'}</td>
                        <td className="reason-cell">{day.note || '—'}</td>
                      </tr>
                    ))}
                    {!report.days.length && (
                      <tr>
                        <td colSpan="9" className="empty">
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
                  <h2>Monthly attendance by employee</h2>
                  <p className="muted small-text">
                    Present days are weighted: a half day counts as 0.5. Leave is excluded from the rate.
                  </p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Code</th>
                      <th>Department</th>
                      <th>Present</th>
                      <th>Full</th>
                      <th>Half</th>
                      <th>Absent</th>
                      <th>Leave</th>
                      <th>Late</th>
                      <th>Early out</th>
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
                        <td>{row.employee.employeeCode || '—'}</td>
                        <td>{row.employee.department || '—'}</td>
                        <td>
                          <b>{row.weightedPresent}</b>
                        </td>
                        <td>{row.fullDays}</td>
                        <td>{row.halfDays}</td>
                        <td>{row.absent}</td>
                        <td>{row.leave}</td>
                        <td>{row.late}</td>
                        <td>{row.earlyCheckout}</td>
                        <td>
                          {row.recordedDays ? (
                            <span className={`percent-pill ${row.attendancePercentage >= 90 ? 'good' : row.attendancePercentage >= 75 ? 'warn' : 'bad'}`}>
                              {row.attendancePercentage}%
                            </span>
                          ) : (
                            <span className="muted small-text">—</span>
                          )}
                        </td>
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
                        <td colSpan="2" />
                        <td>
                          <b>{report.totals.weightedPresent}</b>
                        </td>
                        <td>
                          <b>{report.totals.fullDays}</b>
                        </td>
                        <td>
                          <b>{report.totals.halfDays}</b>
                        </td>
                        <td>
                          <b>{report.totals.absent}</b>
                        </td>
                        <td>
                          <b>{report.totals.leave}</b>
                        </td>
                        <td>
                          <b>{report.totals.late}</b>
                        </td>
                        <td>
                          <b>{report.totals.earlyCheckout}</b>
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
        </>
      )}
    </div>
  );
}
