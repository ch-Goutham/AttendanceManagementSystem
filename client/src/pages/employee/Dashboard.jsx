import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  FileText,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Spinner from '../../components/Spinner';
import { StatCard, Status } from '../../components/Ui';
import { durationLabel, formatDate, formatTime } from '../../lib/dates';
import { errMsg } from '../../lib/format';
import { readPageCache, writePageCache } from '../../lib/pageCache';

const CACHE_KEY = 'me:dashboard';

export default function EmployeeDashboard({ user, onNavigate }) {
  const notify = useToast();
  const [data, setData] = useState(() => readPageCache(CACHE_KEY));

  async function load() {
    try {
      const { data: payload } = await api.get('/dashboard/me');
      setData(payload);
      writePageCache(CACHE_KEY, payload);
    } catch (error) {
      notify('error', errMsg(error));
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

  const leaveStats = data?.leaveStats;
  const permissionStats = data?.permissionStats;

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EMPLOYEE WORKSPACE</p>
          <h1>
            {greeting}, {user.name.split(' ')[0]}
          </h1>
          <p className="muted">Your leave and permission totals with their approval status.</p>
        </div>
      </div>

      {!data ? (
        <Spinner label="Loading your dashboard..." />
      ) : (
        <>
          <div className="stats-grid">
            {StatCard({
              label: 'Leave requests',
              value: leaveStats.total,
              icon: <UserRound size={19} />,
              foot: `${leaveStats.approved} approved · ${leaveStats.pending} pending`,
              onClick: () => onNavigate('leave'),
            })}
            {StatCard({
              label: 'Approved leave days',
              value: leaveStats.approvedDays,
              icon: <CalendarDays size={19} />,
              foot: `${leaveStats.totalDays} day(s) requested in total`,
              onClick: () => onNavigate('leave'),
            })}
            {StatCard({
              label: 'Permission requests',
              value: permissionStats.total,
              icon: <FileText size={19} />,
              foot: `${permissionStats.approved} approved · ${permissionStats.pending} pending`,
              onClick: () => onNavigate('permission'),
            })}
            {StatCard({
              label: 'Approved permission time',
              value: durationLabel(permissionStats.approvedMinutes),
              icon: <ShieldCheck size={19} />,
              foot: `${durationLabel(permissionStats.totalMinutes)} requested in total`,
              onClick: () => onNavigate('permission'),
            })}
          </div>

          <section className="panel">
            <div className="panel-heading responsive-heading">
              <div>
                <h2>My leave requests</h2>
                <p className="muted small-text">
                  {leaveStats.approved} approved, {leaveStats.pending} pending, {leaveStats.rejected} rejected.
                </p>
              </div>
              <div className="filters">
                <button type="button" className="link-btn" onClick={() => onNavigate('leave')}>
                  View all <ArrowRight size={13} />
                </button>
                <button className="icon-btn" onClick={() => load()} title="Refresh" type="button">
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Days</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Reviewed by</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaves.map((leave) => (
                    <tr key={leave.id}>
                      <td>{formatDate(leave.startDate)}</td>
                      <td>{formatDate(leave.endDate)}</td>
                      <td>{leave.days}</td>
                      <td className="reason-cell" title={leave.reason}>
                        {leave.reason}
                      </td>
                      <td>
                        <Status status={leave.status} />
                      </td>
                      <td>{leave.reviewer?.name || '—'}</td>
                    </tr>
                  ))}
                  {!data.leaves.length && (
                    <tr>
                      <td colSpan="6" className="empty">
                        You have not applied for any leave yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading responsive-heading">
              <div>
                <h2>My permission requests</h2>
                <p className="muted small-text">
                  {permissionStats.approved} approved, {permissionStats.pending} pending,{' '}
                  {permissionStats.rejected} rejected.
                </p>
              </div>
              <div className="filters">
                <button type="button" className="link-btn" onClick={() => onNavigate('permission')}>
                  View all <ArrowRight size={13} />
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Duration</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Reviewed by</th>
                  </tr>
                </thead>
                <tbody>
                  {data.permissions.map((permission) => (
                    <tr key={permission.id}>
                      <td>{formatDate(permission.date)}</td>
                      <td>{formatTime(permission.startTime)}</td>
                      <td>{formatTime(permission.endTime)}</td>
                      <td>{permission.durationLabel}</td>
                      <td className="reason-cell" title={permission.reason}>
                        {permission.reason}
                      </td>
                      <td>
                        <Status status={permission.status} />
                      </td>
                      <td>{permission.reviewer?.name || '—'}</td>
                    </tr>
                  ))}
                  {!data.permissions.length && (
                    <tr>
                      <td colSpan="7" className="empty">
                        You have not requested any permission yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
