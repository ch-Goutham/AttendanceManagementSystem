import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CalendarOff,
  Clock,
  LogIn,
  LogOut,
  MapPin,
  ShieldCheck,
  UserCheck,
  UserX,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Spinner from '../../components/Spinner';
import { DayFlag, StatCard, Status } from '../../components/Ui';
import {
  countdownLabel,
  formatDate,
  formatExactTime,
  formatTime,
  monthKey,
  sessionSummary,
  todayKey,
} from '../../lib/dates';
import { errMsg } from '../../lib/format';
import { clearPageCache, readPageCache, writePageCache } from '../../lib/pageCache';

const WORK_LOCATIONS = ['Office', 'Work from home'];
const todayCacheKey = () => `me:today:${todayKey()}`;
const recordsCacheKey = (month) => `me:attendance:${month}`;

export default function MarkAttendance({ user }) {
  const notify = useToast();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [initialToday] = useState(() => readPageCache(todayCacheKey()));
  const [records, setRecords] = useState(
    () => readPageCache(recordsCacheKey(monthKey(new Date()))) || []
  );
  const [today, setToday] = useState(initialToday || null);
  const [openRecord, setOpenRecord] = useState(initialToday?.openRecord || null);
  const [lateReason, setLateReason] = useState(initialToday?.record?.lateReason || '');
  const [location, setLocation] = useState(
    initialToday?.record?.location || user?.location || 'Office'
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reasonBusy, setReasonBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  async function load({ silent = false } = {}) {
    const cacheKey = recordsCacheKey(month);
    const cachedRecords = readPageCache(cacheKey);
    if (cachedRecords) {
      setRecords(cachedRecords);
    } else if (!silent) {
      setRecords([]);
      setLoading(true);
    }

    try {
      const [recordsResponse, todayResponse] = await Promise.all([
        api.get('/attendance', { params: { month } }),
        api.get('/attendance/today'),
      ]);
      const nextRecords = recordsResponse.data.records || [];
      setRecords(nextRecords);
      writePageCache(cacheKey, nextRecords);
      setToday(todayResponse.data);
      writePageCache(todayCacheKey(), todayResponse.data);
      setOpenRecord(todayResponse.data.openRecord || null);
      setLateReason(todayResponse.data.record?.lateReason || '');
      if (todayResponse.data.record?.location) {
        setLocation(todayResponse.data.record.location);
      }
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [month]);

  const todayRecord = today?.record;
  const sessions = todayRecord?.sessions || [];
  const isCheckedIn = Boolean(
    todayRecord?.isCheckedIn ?? (todayRecord?.checkIn && !todayRecord?.checkOut)
  );
  const hasAnySession = sessions.length > 0 || Boolean(todayRecord?.checkIn);
  const onLeave = todayRecord?.status === 'Leave';
  const isAbsent = todayRecord?.status === 'Absent';

  // Keep the "check in again" countdown live without refetching the record.
  useEffect(() => {
    if (!todayRecord?.nextCheckInAt || isCheckedIn) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [todayRecord?.nextCheckInAt, isCheckedIn]);

  const cooldownRemaining = todayRecord?.nextCheckInAt
    ? Math.max(0, Math.ceil((new Date(todayRecord.nextCheckInAt).getTime() - now) / 1000))
    : 0;
  const waitingForCooldown = !isCheckedIn && hasAnySession && cooldownRemaining > 0;

  async function checkIn() {
    setBusy(true);
    try {
      const { data } = await api.post('/attendance/check-in', { location });
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
      clearPageCache();
      await load({ silent: true });
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
      clearPageCache();
      await load({ silent: true });
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
      clearPageCache();
      await load({ silent: true });
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setReasonBusy(false);
    }
  }

  const summary = useMemo(() => {
    const presentRecords = records.filter((record) => record.status === 'Present');
    const halfDays = presentRecords.filter((record) => record.dayType === 'Half day').length;
    const absent = records.filter((record) => record.status === 'Absent').length;
    const leave = records.filter((record) => record.status === 'Leave').length;
    const weightedPresent = presentRecords.reduce(
      (sum, record) => sum + (record.dayWeight ?? (record.dayType === 'Half day' ? 0.5 : 1)),
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
                      : isCheckedIn
                        ? "You're checked in"
                        : waitingForCooldown
                          ? "You're checked out"
                          : hasAnySession
                            ? 'Ready to check in again'
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
                {!isCheckedIn && !onLeave && !isAbsent && !openRecord && !hasAnySession && (
                  <button className="primary" onClick={checkIn} disabled={busy}>
                    <LogIn size={16} /> {busy ? 'Saving...' : 'Check in'}
                  </button>
                )}
                {openRecord && !isCheckedIn && !hasAnySession && (
                  <button className="primary" onClick={checkOut} disabled={busy}>
                    <LogOut size={16} /> {busy ? 'Saving...' : 'Check out now'}
                  </button>
                )}
                {isCheckedIn && (
                  <button className="primary" onClick={checkOut} disabled={busy}>
                    <LogOut size={16} /> {busy ? 'Saving...' : 'Check out'}
                  </button>
                )}
                {!isCheckedIn && hasAnySession && !onLeave && !isAbsent && (
                  <button
                    className="primary"
                    onClick={checkIn}
                    disabled={busy || waitingForCooldown}
                    title={
                      waitingForCooldown
                        ? 'A new session is available after the check-out cooldown.'
                        : 'Start another session today'
                    }
                  >
                    <LogIn size={16} />{' '}
                    {busy
                      ? 'Saving...'
                      : waitingForCooldown
                        ? `Check in again in ${countdownLabel(cooldownRemaining)}`
                        : 'Check in again'}
                  </button>
                )}
              </div>
            </div>

            {!isCheckedIn && !onLeave && !isAbsent && (
              <div className="location-picker">
                <span>
                  <MapPin size={14} /> Working from
                </span>
                <div className="segmented">
                  {WORK_LOCATIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={location === option ? 'active' : ''}
                      onClick={() => setLocation(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="time-strip">
              <div>
                <span>First check in</span>
                <b>{formatTime(todayRecord?.checkIn)}</b>
                {todayRecord?.checkInAt && (
                  <small>exact {formatExactTime(todayRecord.checkInAt, today?.config?.timeZone)}</small>
                )}
              </div>
              <div>
                <span>Last check out</span>
                <b>{formatTime(todayRecord?.checkOut)}</b>
                {todayRecord?.checkOutAt && (
                  <small>
                    exact {formatExactTime(todayRecord.checkOutAt, today?.config?.timeZone)}
                  </small>
                )}
              </div>
              <div>
                <span>Total hours</span>
                <b>{todayRecord?.hoursLabel || '—'}</b>
              </div>
              <div>
                <span>Day type</span>
                <b>{todayRecord?.status === 'Present' ? todayRecord?.dayType || '—' : '—'}</b>
              </div>
              <div>
                <span>Location</span>
                <b>{todayRecord?.location || location}</b>
              </div>
              <div>
                <span>Status</span>
                <Status status={todayRecord?.status || 'Unmarked'} />
              </div>
            </div>

            {sessions.length > 1 && (
              <div className="session-list">
                <p className="late-reason-title">
                  <Clock size={14} /> Today&apos;s sessions
                </p>
                {sessions.map((session, index) => (
                  <div className="session-row" key={session.id || index}>
                    <span>Session {index + 1}</span>
                    <b>
                      {formatTime(session.checkIn)} –{' '}
                      {session.checkOut ? formatTime(session.checkOut) : 'open'}
                    </b>
                    <small>{session.hoursLabel}</small>
                  </div>
                ))}
              </div>
            )}

            {waitingForCooldown && (
              <div className="late-reason-box open-checkout-box">
                <div>
                  <p className="late-reason-title">
                    <Clock size={14} /> Check-out saved
                  </p>
                  <p className="muted small-text">
                    Your first session is saved. You can start another session in{' '}
                    {countdownLabel(cooldownRemaining)}.
                  </p>
                </div>
              </div>
            )}

            {openRecord && !hasAnySession && (
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

      {(!loading || records.length > 0) && (
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
          {loading && !records.length ? (
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
                        {record.sessionCount > 1 && (
                          <small className="cell-note" title={sessionSummary(record)}>
                            {record.sessionCount} sessions
                          </small>
                        )}
                        {record.checkInAt && (
                          <small className="cell-note">
                            exact {formatExactTime(record.checkInAt, today?.config?.timeZone)}
                          </small>
                        )}
                      </td>
                      <td>
                        {formatTime(record.checkOut)}
                        {record.checkOutAt && record.sessionCount <= 1 && (
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
