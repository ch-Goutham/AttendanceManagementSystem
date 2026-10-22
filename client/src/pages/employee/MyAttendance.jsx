import { useEffect, useMemo, useState } from 'react';
import Calendar from 'react-calendar';
import {
  CalendarDays,
  ClipboardCheck,
  UserRound,
  ShieldCheck,
  Clock,
  LogIn,
  LogOut,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Spinner from '../../components/Spinner';
import { StatCard, Status } from '../../components/Ui';
import { dateKey, formatDate, formatTime, monthKey } from '../../lib/dates';
import { errMsg } from '../../lib/format';

export default function MyAttendance({ user }) {
  const notify = useToast();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activeDate, setActiveDate] = useState(new Date());
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [calendarResponse, summaryResponse, todayResponse] = await Promise.all([
        api.get('/attendance/calendar', { params: { month } }),
        api.get('/attendance/summary', { params: { month } }),
        api.get('/attendance/today'),
      ]);
      setRecords(calendarResponse.data.records || []);
      setSummary(summaryResponse.data);
      setToday(todayResponse.data);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [month]);

  async function checkIn() {
    setBusy(true);
    try {
      const { data } = await api.post('/attendance/check-in');
      setToday((current) => ({ ...current, record: data.record, config: data.config }));
      notify('success', 'Checked in. Your admin will confirm it.');
      await load();
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    setBusy(true);
    try {
      const { data } = await api.post('/attendance/check-out');
      setToday((current) => ({ ...current, record: data.record, config: data.config }));
      notify('success', 'Checked out. Hours and day type were updated.');
      await load();
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  const byDate = useMemo(() => Object.fromEntries(records.map((record) => [record.date, record])), [records]);

  const tileClassName = ({ date, view }) => {
    if (view !== 'month') return null;
    const record = byDate[dateKey(date)];
    if (!record) return null;
    if (record.approval === 'pending') return 'calendar-pending';
    if (record.approval === 'rejected') return 'calendar-rejected';
    return `calendar-${record.status.toLowerCase()}`;
  };

  const selected = byDate[dateKey(activeDate)];
  const approvalLabel = selected
    ? selected.approval === 'pending'
      ? 'Pending approval'
      : selected.approval === 'rejected'
        ? 'Rejected'
        : 'Confirmed'
    : '';

  const todayRecord = today?.record;
  const hasCheckIn = Boolean(todayRecord?.checkIn);
  const hasCheckOut = Boolean(todayRecord?.checkOut);
  const isConfirmed = todayRecord?.approval === 'confirmed';
  const onLeave = todayRecord?.status === 'Leave';
  const isAbsent = todayRecord?.status === 'Absent';

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EMPLOYEE WORKSPACE</p>
          <h1>My attendance</h1>
          <p className="muted">Hi {user.name}, here is your attendance summary and today's check-in.</p>
        </div>
        <div className="month-control">
          <CalendarDays size={17} />
          <input
            type="month"
            value={month}
            onChange={(event) => {
              const next = event.target.value;
              if (next) {
                setMonth(next);
                setActiveDate(new Date(`${next}-01T12:00:00`));
              }
            }}
          />
        </div>
      </div>

      {today && (
        <section className="panel checkin-panel">
          <div className="checkin-head">
            <div>
              <p className="eyebrow">TODAY · {formatDate(today.date)}</p>
              <h2>
                {onLeave
                  ? "You're on leave today"
                  : isAbsent
                    ? 'Marked absent today'
                    : hasCheckOut
                      ? 'Day complete'
                      : hasCheckIn
                        ? "You're checked in"
                        : 'Ready to start your day'}
              </h2>
              <p className="muted small-text">
                Shift {formatTime(today.config?.shiftStart)}–{formatTime(today.config?.shiftEnd)} · Grace{' '}
                {today.config?.graceMinutes ?? 0} min. Check-in and check-out are confirmed by your admin.
              </p>
            </div>
            <div className="checkin-actions">
              {!hasCheckIn && !isConfirmed && !onLeave && !isAbsent && (
                <button className="primary" onClick={checkIn} disabled={busy}>
                  <LogIn size={16} /> {busy ? 'Saving...' : 'Check in'}
                </button>
              )}
              {hasCheckIn && !hasCheckOut && !isConfirmed && (
                <button className="primary" onClick={checkOut} disabled={busy}>
                  <LogOut size={16} /> {busy ? 'Saving...' : 'Check out'}
                </button>
              )}
              {isConfirmed && <span className="status status-confirmed">Confirmed</span>}
              {todayRecord?.approval === 'pending' && (
                <span className="status status-pending">Awaiting approval</span>
              )}
            </div>
          </div>

          <div className="time-strip">
            <div>
              <span>Check in</span>
              <b>{formatTime(todayRecord?.checkIn)}</b>
            </div>
            <div>
              <span>Check out</span>
              <b>{formatTime(todayRecord?.checkOut)}</b>
            </div>
            <div>
              <span>Hours</span>
              <b>{todayRecord?.hoursLabel || '—'}</b>
            </div>
            <div>
              <span>Day type</span>
              <b>{todayRecord?.status === 'Present' ? todayRecord?.dayType || '—' : '—'}</b>
            </div>
            <div>
              <span>Status</span>
              <Status status={todayRecord?.status || 'Unmarked'} />
            </div>
          </div>

          {isConfirmed && (
            <p className="muted small-text checkin-foot">
              This day is confirmed. Ask your admin if a time needs correcting.
            </p>
          )}
        </section>
      )}

      <div className="stats-grid employee-stats">
        {StatCard({
          label: 'Present days',
          value: summary?.present ?? 0,
          icon: <ClipboardCheck size={19} />,
          foot: summary?.halfDays ? `${summary.halfDays} half day(s)` : 'Confirmed present',
        })}
        {StatCard({
          label: 'Absent days',
          value: summary?.absent ?? 0,
          icon: <CalendarDays size={19} />,
          foot: 'Confirmed absent',
        })}
        {StatCard({
          label: 'Leave days',
          value: summary?.leave ?? 0,
          icon: <UserRound size={19} />,
          foot: 'Approved leave',
        })}
        {StatCard({
          label: 'Attendance rate',
          value: `${summary?.attendancePercentage ?? 0}%`,
          icon: <ShieldCheck size={19} />,
          foot: 'Half days count as 0.5',
        })}
      </div>

      {summary?.pending > 0 && (
        <div className="alert info">
          <Clock size={15} /> {summary.pending} self-mark(s) awaiting admin approval.
        </div>
      )}

      <div className="calendar-layout">
        <section className="panel calendar-panel">
          <div className="panel-heading">
            <div>
              <h2>Attendance calendar</h2>
              <p className="muted small-text">Choose a date to see its attendance status.</p>
            </div>
          </div>
          {loading ? (
            <Spinner label="Loading calendar..." />
          ) : (
            <Calendar
              value={activeDate}
              onActiveStartDateChange={({ activeStartDate }) => {
                if (activeStartDate) {
                  const nextMonth = monthKey(activeStartDate);
                  if (nextMonth !== month) setMonth(nextMonth);
                }
              }}
              onChange={setActiveDate}
              tileClassName={tileClassName}
            />
          )}
        </section>

        <section className="panel calendar-details">
          <h2>Calendar legend</h2>
          <div className="legend-row">
            <span className="legend-swatch present" />
            <span>Present</span>
            <b>{summary?.present ?? 0}</b>
          </div>
          <div className="legend-row">
            <span className="legend-swatch absent" />
            <span>Absent</span>
            <b>{summary?.absent ?? 0}</b>
          </div>
          <div className="legend-row">
            <span className="legend-swatch leave" />
            <span>Leave</span>
            <b>{summary?.leave ?? 0}</b>
          </div>
          <div className="legend-row">
            <span className="legend-swatch pending" />
            <span>Pending</span>
            <b>{summary?.pending ?? 0}</b>
          </div>

          <div className="selected-date">
            <span className="eyebrow">SELECTED DATE</span>
            <h3>
              {activeDate.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </h3>
            {selected ? (
              <>
                <Status status={selected.status} />
                {selected.approval !== 'confirmed' && (
                  <span className={`status ml-8 status-${selected.approval}`}>{approvalLabel}</span>
                )}
                <div className="selected-times">
                  <span>In {formatTime(selected.checkIn)}</span>
                  <span>Out {formatTime(selected.checkOut)}</span>
                  <span>{selected.hoursLabel}</span>
                </div>
              </>
            ) : (
              <span className="status status-unmarked">Not marked</span>
            )}
          </div>

          <div className="percentage-box">
            <span>Monthly attendance</span>
            <strong>{summary?.attendancePercentage ?? 0}%</strong>
            <div className="progress">
              <span style={{ width: `${Math.min(100, summary?.attendancePercentage ?? 0)}%` }} />
            </div>
            <small>Based on confirmed Present and Absent days; half days count as 0.5.</small>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Attendance this month</h2>
            <p className="muted small-text">Your marked days, including check-in and check-out times.</p>
          </div>
        </div>
        <div className="table-wrap">
          {loading ? (
            <Spinner label="Loading..." />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Check in</th>
                  <th>Check out</th>
                  <th>Hours</th>
                  <th>Status</th>
                  <th>Day type</th>
                  <th>Approval</th>
                </tr>
              </thead>
              <tbody>
                {[...records]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((record) => (
                    <tr key={record.date}>
                      <td>{formatDate(record.date)}</td>
                      <td>{formatTime(record.checkIn)}</td>
                      <td>{formatTime(record.checkOut)}</td>
                      <td>{record.hoursLabel}</td>
                      <td>
                        <Status status={record.status} />
                      </td>
                      <td>{record.status === 'Present' ? record.dayType : '—'}</td>
                      <td>
                        <Status status={record.approval} />
                      </td>
                    </tr>
                  ))}
                {!records.length && (
                  <tr>
                    <td colSpan="7" className="empty">
                      No attendance has been recorded for this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
