import { useEffect, useMemo, useState } from 'react';
import { Check, X, RefreshCw, History } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import Spinner from '../../components/Spinner';
import { Status } from '../../components/Ui';
import { formatDate, formatTime } from '../../lib/dates';
import { errMsg, initials } from '../../lib/format';

const STATUS_TABS = [
  { key: '', label: 'All requests' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Rejected', label: 'Rejected' },
];

export default function LeaveManagement() {
  const notify = useToast();
  const [view, setView] = useState('leaves');
  const [leaves, setLeaves] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const isLeaves = view === 'leaves';
  const rows = isLeaves ? leaves : permissions;

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

  async function load() {
    setLoading(true);
    try {
      const [leavesResponse, permissionsResponse, employeesResponse] = await Promise.all([
        api.get('/leaves'),
        api.get('/permissions'),
        api.get('/employees'),
      ]);
      setLeaves(leavesResponse.data.leaves || []);
      setPermissions(permissionsResponse.data.permissions || []);
      setEmployees(
        (employeesResponse.data.employees || []).filter((employee) => employee.role === 'employee')
      );
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function review(type, id, action) {
    try {
      await api.patch(`/${type}/${id}/review`, { action });
      notify(
        'success',
        `${type === 'leaves' ? 'Leave' : 'Permission'} ${
          action === 'approve' ? 'approved' : 'rejected'
        }.`
      );
      await load();
    } catch (error) {
      notify('error', errMsg(error));
    }
  }

  const counts = useMemo(
    () => ({
      Pending: rows.filter((row) => row.status === 'Pending').length,
      Approved: rows.filter((row) => row.status === 'Approved').length,
      Rejected: rows.filter((row) => row.status === 'Rejected').length,
      total: rows.length,
    }),
    [rows]
  );

  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!statusTab || row.status === statusTab) &&
          (!employeeId || String(row.employee?.id) === String(employeeId))
      ),
    [rows, statusTab, employeeId]
  );

  const selectedEmployee = employees.find((employee) => employee.id === employeeId);
  const leavePending = leaves.filter((leave) => leave.status === 'Pending').length;
  const permissionPending = permissions.filter((permission) => permission.status === 'Pending').length;

  function changeView(next) {
    setView(next);
    setStatusTab('');
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>Leave Management</h1>
          <p className="muted">
            Review leave and permission requests, approve or reject them, and check each
            employee&apos;s history.
          </p>
        </div>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${isLeaves ? 'active' : ''}`}
          onClick={() => changeView('leaves')}
        >
          Leave requests
          <span className={`tab-count ${leavePending ? 'badge-warn' : ''}`}>{leaves.length}</span>
        </button>
        <button
          type="button"
          className={`tab ${!isLeaves ? 'active' : ''}`}
          onClick={() => changeView('permissions')}
        >
          Permission requests
          <span className={`tab-count ${permissionPending ? 'badge-warn' : ''}`}>
            {permissions.length}
          </span>
        </button>
      </div>

      <div className="tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key || 'all'}
            type="button"
            className={`tab ${statusTab === tab.key ? 'active' : ''}`}
            onClick={() => setStatusTab(tab.key)}
          >
            {tab.label}
            <span className={`tab-count ${tab.key === 'Pending' && counts.Pending ? 'badge-warn' : ''}`}>
              {tab.key ? counts[tab.key] : counts.total}
            </span>
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="panel-heading responsive-heading">
          <div>
            <h2>
              {selectedEmployee
                ? `${selectedEmployee.name} — ${isLeaves ? 'leave' : 'permission'} history`
                : isLeaves
                  ? 'Leave requests'
                  : 'Permission requests'}
            </h2>
            <p className="muted small-text">
              {selectedEmployee
                ? 'All requests from this employee, newest first.'
                : isLeaves
                  ? 'Approving a leave request records the range as Leave in attendance.'
                  : 'Each permission request shows its date, time window, duration and reason.'}
            </p>
          </div>
          <div className="filters">
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
            {employeeId && (
              <button type="button" className="link-btn" onClick={() => setEmployeeId('')}>
                Clear employee
              </button>
            )}
            <button className="icon-btn" onClick={load} title="Refresh" type="button">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="table-wrap">
          {loading ? (
            <Spinner label={isLeaves ? 'Loading leave requests...' : 'Loading permission requests...'} />
          ) : isLeaves ? (
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Reviewed by</th>
                  <th className="col-action">History</th>
                  <th className="col-action">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((leave) => (
                  <tr key={leave.id}>
                    <td>
                      <div className="employee-cell">
                        <div className="avatar tiny">{initials(leave.employee?.name)}</div>
                        <div>
                          <b>{leave.employee?.name || 'Employee'}</b>
                          <small>{leave.employee?.department || leave.employee?.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>{formatDate(leave.startDate)}</td>
                    <td>{formatDate(leave.endDate)}</td>
                    <td>{leave.days}</td>
                    <td className="reason-cell" title={leave.reason}>
                      {leave.reason}
                    </td>
                    <td>
                      <Status status={leave.status} />
                    </td>
                    <td>
                      {leave.reviewer?.name || '—'}
                      {leave.reviewNote && <small className="cell-note">{leave.reviewNote}</small>}
                    </td>
                    <td className="col-action">
                      <button
                        className="link-btn"
                        title="View this employee's leave history"
                        onClick={() => setEmployeeId(leave.employee?.id || '')}
                      >
                        <History size={13} /> History
                      </button>
                    </td>
                    <td className="col-action">
                      {leave.status === 'Pending' ? (
                        <div className="row-actions">
                          <button
                            className="approve-btn"
                            onClick={() => review('leaves', leave.id, 'approve')}
                          >
                            <Check size={14} /> Approve
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() =>
                              setConfirm({
                                title: 'Reject leave request?',
                                message: `${leave.employee?.name || 'This employee'} requested leave from ${formatDate(
                                  leave.startDate
                                )} to ${formatDate(leave.endDate)}.`,
                                confirmLabel: 'Reject',
                                danger: true,
                                onConfirm: () => review('leaves', leave.id, 'reject'),
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
                {!visible.length && (
                  <tr>
                    <td colSpan="9" className="empty">
                      No leave requests match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Duration</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Reviewed by</th>
                  <th className="col-action">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((permission) => (
                  <tr key={permission.id}>
                    <td>
                      <div className="employee-cell">
                        <div className="avatar tiny">{initials(permission.employee?.name)}</div>
                        <div>
                          <b>{permission.employee?.name || 'Employee'}</b>
                          <small>{permission.employee?.department || permission.employee?.email}</small>
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
                    <td>
                      <Status status={permission.status} />
                    </td>
                    <td>
                      {permission.reviewer?.name || '—'}
                      {permission.reviewNote && (
                        <small className="cell-note">{permission.reviewNote}</small>
                      )}
                    </td>
                    <td className="col-action">
                      {permission.status === 'Pending' ? (
                        <div className="row-actions">
                          <button
                            className="approve-btn"
                            onClick={() => review('permissions', permission.id, 'approve')}
                          >
                            <Check size={14} /> Approve
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() =>
                              setConfirm({
                                title: 'Reject permission request?',
                                message: `${permission.employee?.name || 'This employee'} requested permission on ${formatDate(
                                  permission.date
                                )}, ${formatTime(permission.startTime)}–${formatTime(permission.endTime)}.`,
                                confirmLabel: 'Reject',
                                danger: true,
                                onConfirm: () => review('permissions', permission.id, 'reject'),
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
                {!visible.length && (
                  <tr>
                    <td colSpan="9" className="empty">
                      No permission requests match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

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
