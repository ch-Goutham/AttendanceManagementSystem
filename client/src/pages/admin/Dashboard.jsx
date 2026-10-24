import { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, CalendarOff, Clock, Check, X, RefreshCw, ShieldCheck } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import { StatCard } from '../../components/Ui';
import Spinner from '../../components/Spinner';
import { formatDate, formatTime, todayKey } from '../../lib/dates';
import { errMsg, initials } from '../../lib/format';
import { clearPageCache, readPageCache, writePageCache } from '../../lib/pageCache';

const CACHE_KEY = 'admin:dashboard';

export default function Dashboard({ user, onNavigate }) {
  const notify = useToast();
  const [data, setData] = useState(() => readPageCache(CACHE_KEY));
  const [reviewingKey, setReviewingKey] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function load() {
    try {
      const { data: payload } = await api.get('/dashboard');
      setData(payload);
      writePageCache(CACHE_KEY, payload);
    } catch (error) {
      notify('error', errMsg(error));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function review(type, request, action) {
    setReviewingKey(`${type}:${request.id}`);
    try {
      await api.patch(`/${type}/${request.id}/review`, { action });
      notify(
        'success',
        `${type === 'permissions' ? 'Permission' : 'Leave'} ${
          action === 'approve' ? 'approved' : 'rejected'
        }.`
      );
      clearPageCache();
      await load();
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setReviewingKey('');
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

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const pending = data?.pendingPermissions || [];
  const pendingLeaves = data?.pendingLeaves || [];

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>
            {greeting}, {user.name.split(' ')[0]}
          </h1>
          <p className="muted">{formatDate(todayKey())}</p>
        </div>
        <button className="icon-btn" onClick={() => load()} title="Refresh" type="button">
          <RefreshCw size={16} />
        </button>
      </div>

      {!data ? (
        <Spinner label="Loading today's numbers..." />
      ) : (
        <>
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
              foot: 'Checked in today',
              onClick: () => onNavigate('attendance'),
            })}
            {StatCard({
              label: 'Absent Today',
              value: data.absentToday,
              icon: <UserX size={19} />,
              foot: 'Marked absent',
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

          <section className="panel">
            <div className="panel-heading responsive-heading">
              <div>
                <h2>Pending permission requests</h2>
                <p className="muted small-text">
                  Every employee request waiting for review.{' '}
                  {pending.length
                    ? `${pending.length} pending.`
                    : 'Nothing is waiting for approval.'}
                </p>
              </div>
              <div className="filters">
                <span className="tab-count badge-warn">
                  <ShieldCheck size={13} /> {pending.length}
                </span>
                <button className="icon-btn" onClick={() => load()} title="Refresh" type="button">
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Duration</th>
                    <th>Reason</th>
                    <th className="col-action">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((permission) => (
                    <tr key={permission.id}>
                      <td>
                        <div className="employee-cell">
                          <div className="avatar tiny">{initials(permission.employee?.name)}</div>
                          <div>
                            <b>{permission.employee?.name || 'Employee'}</b>
                            <small>
                              {permission.employee?.department || permission.employee?.email || '—'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{formatDate(permission.date)}</td>
                      <td>{formatTime(permission.startTime)}</td>
                      <td>{formatTime(permission.endTime)}</td>
                      <td>{permission.durationLabel}</td>
                      <td className="reason-cell" title={permission.reason}>
                        {permission.reason}
                      </td>
                      <td className="col-action">
                        <div className="row-actions">
                          <button
                            className="approve-btn"
                            disabled={reviewingKey === `permissions:${permission.id}`}
                            onClick={() => review('permissions', permission, 'approve')}
                          >
                            <Check size={14} /> Approve
                          </button>
                          <button
                            className="reject-btn"
                            disabled={reviewingKey === `permissions:${permission.id}`}
                            onClick={() =>
                              setConfirm({
                                title: 'Reject permission request?',
                                message: `${
                                  permission.employee?.name || 'This employee'
                                } requested permission on ${formatDate(
                                  permission.date
                                )}, ${formatTime(permission.startTime)}–${formatTime(
                                  permission.endTime
                                )}.`,
                                confirmLabel: 'Reject',
                                danger: true,
                                onConfirm: () => review('permissions', permission, 'reject'),
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
                      <td colSpan="7" className="empty">
                        No pending permission requests.
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
                <h2>Pending leave requests</h2>
                <p className="muted small-text">
                  Every leave request waiting for review.{' '}
                  {pendingLeaves.length
                    ? `${pendingLeaves.length} pending.`
                    : 'Nothing is waiting for approval.'}
                </p>
              </div>
              <div className="filters">
                <span className="tab-count badge-warn">
                  <CalendarOff size={13} /> {pendingLeaves.length}
                </span>
                <button className="icon-btn" onClick={() => load()} title="Refresh" type="button">
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Days</th>
                    <th>Reason</th>
                    <th className="col-action">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLeaves.map((leave) => (
                    <tr key={leave.id}>
                      <td>
                        <div className="employee-cell">
                          <div className="avatar tiny">{initials(leave.employee?.name)}</div>
                          <div>
                            <b>{leave.employee?.name || 'Employee'}</b>
                            <small>
                              {leave.employee?.department || leave.employee?.email || '—'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{formatDate(leave.startDate)}</td>
                      <td>{formatDate(leave.endDate)}</td>
                      <td>{leave.days}</td>
                      <td className="reason-cell" title={leave.reason}>
                        {leave.reason}
                      </td>
                      <td className="col-action">
                        <div className="row-actions">
                          <button
                            className="approve-btn"
                            disabled={reviewingKey === `leaves:${leave.id}`}
                            onClick={() => review('leaves', leave, 'approve')}
                          >
                            <Check size={14} /> Approve
                          </button>
                          <button
                            className="reject-btn"
                            disabled={reviewingKey === `leaves:${leave.id}`}
                            onClick={() =>
                              setConfirm({
                                title: 'Reject leave request?',
                                message: `${
                                  leave.employee?.name || 'This employee'
                                } requested leave from ${formatDate(
                                  leave.startDate
                                )} to ${formatDate(leave.endDate)}.`,
                                confirmLabel: 'Reject',
                                danger: true,
                                onConfirm: () => review('leaves', leave, 'reject'),
                              })
                            }
                          >
                            <X size={14} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!pendingLeaves.length && (
                    <tr>
                      <td colSpan="6" className="empty">
                        No pending leave requests.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
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
