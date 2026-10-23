import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarOff,
  Clock,
  LogIn,
  LogOut,
  ShieldCheck,
  UserCheck,
  UserX,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Spinner from '../../components/Spinner';
import { DayFlag, StatCard, Status } from '../../components/Ui';
import { formatDate, formatExactTime, formatTime, monthKey } from '../../lib/dates';
import { errMsg } from '../../lib/format';

export default function MarkAttendance() {
  const notify = useToast();
  const [month, setMonth] = useState(monthKey(new Date()));
  const [records, setRecords] = useState([]);
  const [today, setToday] = useState(null);
  const [openRecord, setOpenRecord] = useState(null);
  const [lateReason, setLateReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reasonBusy, setReasonBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [recordsResponse, todayResponse] = await Promise.all([
        api.get('/attendance', { params: { month } }),
        api.get('/attendance/today'),
      ]);
      setRecords(recordsResponse.data.records || []);
      setToday(todayResponse.data);
      setOpenRecord(todayResponse.data.openRecord || null);
      setLateReason(todayResponse.data.record?.lateReason || '');
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
      // Show the saved state from the response immediately; the refetch below
      // keeps the monthly history in sync.
      setToday((current) => ({
        date: current?.date || data.record?.date,
        record: data.record,
        openRecord: null,
        config: data.config || current?.config,
      }));
      setOpenRecord(null);
      notify(
        'success',
        data.record?.late
          ? 'Checked in. You are late — please add the reason below.'
          : 'Checked in. Your exact check-in time was saved.'
      );
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
      if (data.carriedOver) {
        notify(
          'success',
          `Closed the open check-in from ${formatDate(data.record?.date)}. Hours were saved.`
        );
      } else {
        notify('success', 'Checked out. Your exact check-out time and hours were saved.');
      }
      setToday((current) => {
        if (data.carriedOver) return { ...(current || {}), openRecord: null };
        return {
          date: current?.date || data.record?.date,
          record: data.record,
          openRecord: null,
          config: data.config || current?.config,
        };
      });
      setOpenRecord(null);
      await load();
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveLateReason(event) {
    event.preventDefault();
    if (!lateReason.trim()) {
      notify('error', 'Enter a reason for the late arrival.');
      return;
    }
    setReasonBusy(true);
    try {
      await api.patch('/attendance/today/late-reason', { lateReason: lateReason.trim() });
      notify('success', 'Late-arrival reason saved.');
      await load();
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setReasonBusy(false);
    }
  }

  const todayRecord = today?.record;
  const hasCheckIn = Boolean(todayRecord?.checkIn);
  const hasCheckOut = Boolean(todayRecord?.checkOut);
  const onLeave = todayRecord?.status === 'Leave';
  const isAbsent = todayRecord?.status === 'Absent';

  const summary = useMemo(() => {
    const presentRecords = records.filter((record) => record.status === 'Present');
    const halfDays = presentRecords.filter((record) => record.dayType === 'Half day').length;
    const absent = records.filter((record) => record.status === 'Absent').length;
    const leave = records.filter((record) => record.status === 'Leave').length;
    const weightedPresent = presentRecords.reduce(
      (sum, record) =>
        sum +
        (record.dayWeight ?? (record.dayType === 'Half day' ? 0.5 : 1)),
      0
    );
    const denominator = weightedPresent + absent;

    return {
      presentDays: Math.round(weightedPresent * 100) / 100,
      recordedPresent: presentRecords.length,
      halfDays,
      absent,
      leave,
      percentage: denominator ? Math.round((weightedPresent / denominator) * 10000) / 100 : 0,
    };
  }, [records]);

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EMPLOYEE WORKSPACE</p>
          <h1>Mark Attendance</h1>
          <p className="muted">
            Check in and out with the exact server time, add a late-arrival reason, and review your
            own attendance history.
          </p>
        </div>
        <div className="month-control">
          <CalendarDays size={17} />
          <input
            type="month"
            value={month}
            onChange={(event) => {
              if (event.target.value) setMonth(event.target.value);
            }}
          />
        </div>
      </div>

      <section className="panel checkin-panel">
        {loading && !today ? (
          <Spinner label="Loading today's attendance..." />
        ) : (
          <>
            <div className="checkin-head">
              <div>
                <p className="eyebrow">TODAY · {formatDate(today?.date)}</p>
                <h2>
                  {onLeave
                    ? "You're on leave today"
                    : isAbsent
                      ? 'Marked absent today'
                      : hasCheckOut
                        ? 'Day complete'
                        : hasCheckIn
                          ? "You're checked in"
                          : openRecord
                            ? 'Finish your open check-out'
                            : 'Ready to start your day'}
                </h2>
                <p className="muted small-text">
                  {today?.config
                    ? `Shift ${formatTime(today.config.shiftStart)}–${formatTime(
                        today.config.shiftEnd
                      )} · Grace ${today.config.graceMinutes ?? 0} min.`
                    : 'Check-in and check-out times are recorded automatically.'}
                </p>
              </div>
              <div className="checkin-actions">
                {!hasCheckIn && !onLeave && !isAbsent && !openRecord && (
                  <button className="primary" onClick={checkIn} disabled={busy}>
                    <LogIn size={16} /> {busy ? 'Saving...' : 'Check in'}
                  </button>
                )}
                {openRecord && !hasCheckIn && (
                  <button className="primary" onClick={checkOut} disabled={busy}>
                    <LogOut size={16} /> {busy ? 'Saving...' : 'Check out now'}
                  </button>
                )}
                {hasCheckIn && !hasCheckOut && (
                  <button className="primary" onClick={checkOut} disabled={busy}>
                    <LogOut size={16} /> {busy ? 'Saving...' : 'Check out'}
                  </button>
                )}
                {hasCheckIn && hasCheckOut && (
                  <span className="status status-present">Attendance complete</span>
                )}
              </div>
            </div>

            <div className="time-strip">
              <div>
                <span>Check in</span>
                <b>{formatTime(todayRecord?.checkIn)}</b>
                {todayRecord?.checkInAt && (
                  <small>exact {formatExactTime(todayRecord.checkInAt, today?.config?.timeZone)}</small>
                )}
              </div>
              <div>
                <span>Check out</span>
                <b>{formatTime(todayRecord?.checkOut)}</b>
                {todayRecord?.checkOutAt && (
                  <small>
                    exact {formatExactTime(todayRecord.checkOutAt, today?.config?.timeZone)}
                  </small>
                )}
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

            {openRecord && !hasCheckIn && (
              <div className="late-reason-box open-checkout-box">
                <div>
                  <p className="late-reason-title">
                    <Clock size={14} /> Open check-out
                  </p>
                  <p className="muted small-text">
                    You checked in on {formatDate(openRecord.date)} at{' '}
                    {formatTime(openRecord.checkIn)} and never checked out. Close that day before
                    starting a new one.
                  </p>
                </div>
              </div>
            )}

            {todayRecord?.late && (
              <div className="late-reason-box">
                <div>
                  <p className="late-reason-title">
                    <Clock size={14} /> Late arrival
                  </p>
                  <p className="muted small-text">
                    You checked in after the {today.config?.graceMinutes ?? 0}-minute grace period.
                    Add the reason for your admin.
                  </p>
                </div>
                <form className="late-reason-form" onSubmit={saveLateReason}>
                  <input
                    value={lateReason}
                    onChange={(event) => setLateReason(event.target.value)}
                    placeholder="Reason for being late"
                    maxLength={300}
                  />
                  <button className="primary" disabled={reasonBusy}>
                    {reasonBusy ? 'Saving...' : todayRecord.lateReason ? 'Update reason' : 'Save reason'}
                  </button>
                </form>
                {todayRecord.lateReason && (
                  <p className="late-reason-saved">
                    Saved: <b>{todayRecord.lateReason}</b>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {!loading && (
        <div className="stats-grid employee-stats">
          {StatCard({
            label: 'Present days',
            value: summary.presentDays,
            icon: <UserCheck size={19} />,
            foot: `${summary.recordedPresent} recorded · ${summary.halfDays} half day(s)`,
          })}
          {StatCard({
            label: 'Absent days',
            value: summary.absent,
            icon: <UserX size={19} />,
            foot: 'Marked absent this month',
          })}
          {StatCard({
            label: 'Leave days',
            value: summary.leave,
            icon: <CalendarOff size={19} />,
            foot: 'Approved leave this month',
          })}
          {StatCard({
            label: 'Attendance percentage',
            value: `${summary.percentage}%`,
            icon: <ShieldCheck size={19} />,
            foot: 'Half days count as 0.5 · leave excluded',
          })}
        </div>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>My attendance history</h2>
            <p className="muted small-text">
              Your records for {formatDate(`${month}-01`)}, newest first.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          {loading ? (
            <Spinner label="Loading attendance history..." />
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
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {[...records]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((record) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.date)}</td>
                      <td>
                        {formatTime(record.checkIn)}
                        {record.checkInAt && (
                          <small className="cell-note">
                            exact {formatExactTime(record.checkInAt, today?.config?.timeZone)}
                          </small>
                        )}
                      </td>
                      <td>
                        {formatTime(record.checkOut)}
                        {record.checkOutAt && (
                          <small className="cell-note">
                            exact {formatExactTime(record.checkOutAt, today?.config?.timeZone)}
                          </small>
                        )}
                      </td>
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
                        {record.late && record.lateReason && (
                          <small className="cell-note" title={record.lateReason}>
                            Reason: {record.lateReason}
                          </small>
                        )}
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
