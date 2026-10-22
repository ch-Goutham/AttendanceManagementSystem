import { useEffect, useState } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  CalendarOff,
  Clock,
  ArrowRight,
  AlertCircle,
  Timer,
  CalendarDays,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import { StatCard } from '../../components/Ui';
import Spinner from '../../components/Spinner';
import { formatDate, formatTime, todayKey } from '../../lib/dates';
import { errMsg } from '../../lib/format';

export default function Dashboard({ user, onNavigate }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data: payload } = await api.get('/dashboard');
      setData(payload);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>
            {greeting}, {user.name.split(' ')[0]}
          </h1>
          <p className="muted">
            {formatDate(todayKey())}
            {data ? ` · ${data.isWorkingDay ? 'Working day' : 'Non-working day'}` : ''}
          </p>
        </div>
        <button className="primary" onClick={() => onNavigate('attendance')}>
          View attendance <ArrowRight size={16} />
        </button>
      </div>

      {loading || !data ? (
        <Spinner label="Loading today's numbers..." />
      ) : (
        <>
          {!data.isWorkingDay && (
            <div className="alert info">
              <CalendarDays size={15} /> Today is not a working day, so absence counts stay at zero.
            </div>
          )}

          {data.pendingApprovals > 0 && (
            <button type="button" className="alert info alert-button" onClick={() => onNavigate('attendance')}>
              <AlertCircle size={15} />
              {data.pendingApprovals} self-mark{data.pendingApprovals === 1 ? '' : 's'} awaiting confirmation
              <ArrowRight size={14} />
            </button>
          )}

          <div className="stats-grid stats-five">
            {StatCard({
              label: 'Total Employees',
              value: data.totalEmployees,
              icon: <Users size={19} />,
              foot: 'Active employee accounts',
              onClick: () => onNavigate('employees'),
            })}
            {StatCard({
              label: 'Present Today',
              value: data.presentToday,
              icon: <UserCheck size={19} />,
              foot: data.halfDaysToday ? `${data.halfDaysToday} half day(s)` : 'Checked in or confirmed',
              onClick: () => onNavigate('attendance'),
            })}
            {StatCard({
              label: 'Absent Today',
              value: data.absentToday,
              icon: <UserX size={19} />,
              foot: `${data.unmarkedToday} not marked yet`,
              onClick: () => onNavigate('attendance'),
            })}
            {StatCard({
              label: 'On Leave Today',
              value: data.onLeaveToday,
              icon: <CalendarOff size={19} />,
              foot: 'Approved leave',
              onClick: () => onNavigate('leaves'),
            })}
            {StatCard({
              label: 'Late Arrivals',
              value: data.lateArrivals,
              icon: <Clock size={19} />,
              foot: 'After shift start + grace',
              onClick: () => onNavigate('attendance'),
            })}
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Today at a glance</h2>
                  <p className="muted small-text">Confirmed and self-marked records for {formatDate(data.date)}.</p>
                </div>
              </div>
              <div className="breakdown">
                <div className="breakdown-row">
                  <span className="legend-swatch present" /> <span>Present</span>
                  <b>{data.presentToday}</b>
                </div>
                <div className="breakdown-row">
                  <span className="legend-swatch absent" /> <span>Absent</span>
                  <b>{data.absentToday}</b>
                </div>
                <div className="breakdown-row">
                  <span className="legend-swatch leave" /> <span>On leave</span>
                  <b>{data.onLeaveToday}</b>
                </div>
                <div className="breakdown-row">
                  <span className="legend-swatch pending" /> <span>Not marked</span>
                  <b>{data.unmarkedToday}</b>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Shift &amp; attendance rules</h2>
                  <p className="muted small-text">Used for late arrivals, early checkouts and half days.</p>
                </div>
                <Timer size={20} className="panel-icon" />
              </div>
              <div className="rules-list">
                <div>
                  <span>Shift start</span>
                  <b>{formatTime(data.config.shiftStart)}</b>
                </div>
                <div>
                  <span>Shift end</span>
                  <b>{formatTime(data.config.shiftEnd)}</b>
                </div>
                <div>
                  <span>Grace period</span>
                  <b>{data.config.graceMinutes} min</b>
                </div>
                <div>
                  <span>Half day below</span>
                  <b>{Math.floor(data.config.halfDayMinutes / 60)}h</b>
                </div>
                <div className="rules-wide">
                  <span>Working days</span>
                  <b>{data.config.workingDayNames.join(' · ')}</b>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
