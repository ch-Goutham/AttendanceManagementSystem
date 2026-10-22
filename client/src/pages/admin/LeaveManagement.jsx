import { useEffect, useMemo, useState } from 'react';
import { Check, X, RefreshCw, History, CalendarDays } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import Spinner from '../../components/Spinner';
import { Status } from '../../components/Ui';
import { daysBetween, formatDate } from '../../lib/dates';
import { errMsg, initials } from '../../lib/format';

const TABS = [
  { key: '', label: 'All requests' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Rejected', label: 'Rejected' },
];

export default function LeaveManagement({ onNavigate }) {
  const notify = useToast();
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const askConfirm = (options) => setConfirm(options);
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
      const [leavesResponse, employeesResponse] = await Promise.all([
        api.get('/leaves'),
        api.get('/employees'),
      ]);
      setLeaves(leavesResponse.data.leaves || []);
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

  async function review(id, action) {
    try {
      await api.patch(`/leaves/${id}/review`, { action });
      notify('success', `Leave ${action === 'approve' ? 'approved' : 'rejected'}.`);
      await load();
    } catch (error) {
      notify('error', errMsg(error));
    }
  }

  const counts = useMemo(
    () => ({
      Pending: leaves.filter((leave) => leave.status === 'Pending').length,
      Approved: leaves.filter((leave) => leave.status === 'Approved').length,
      Rejected: leaves.filter((leave) => leave.status === 'Rejected').length,
      total: leaves.length,
    }),
    [leaves]
  );

  const visible = useMemo(
    () =>
      leaves.filter(
        (leave) =>
          (!statusTab || leave.status === statusTab) &&
          (!employeeId || String(leave.employee?.id) === String(employeeId))
      ),
    [leaves, statusTab, employeeId]
  );

  const selectedEmployee = employees.find((employee) => employee.id === employeeId);

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMIN CONSOLE</p>
          <h1>Leave Management</h1>
          <p className="muted">
            Review requests, approve or reject leave, and check each employee's history.
            {counts.Pending ? ` ${counts.Pending} request(s) need a decision.` : ' Nothing pending.'}
          </p>
        </div>
        <button className="secondary" onClick={() => onNavigate('reports')}>
          <CalendarDays size={16} /> Leave in reports
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span>All requests</span>
            <span className="stat-icon"><CalendarDays size={19} /></span>
          </div>
          <div className="stat-value">{counts.total}</div>
          <div className="stat-foot">Every leave application</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>Pending</span>
            <span className="stat-icon warn"><Check size={19} /></span>
          </div>
          <div className="stat-value">{counts.Pending}</div>
          <div className="stat-foot">Waiting for review</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>Approved</span>
            <span className="stat-icon"><Check size={19} /></span>
          </div>
          <div className="stat-value">{counts.Approved}</div>
          <div className="stat-foot">Recorded as Leave in attendance</div>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>Rejected</span>
            <span className="stat-icon danger"><X size={19} /></span>
          </div>
          <div className="stat-value">{counts.Rejected}</div>
          <div className="stat-foot">Declined requests</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((tab) => (
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
            <h2>{selectedEmployee ? `${selectedEmployee.name} — leave history` : 'Leave requests'}</h2>
            <p className="muted small-text">
              {selectedEmployee
                ? 'All requests from this employee, newest first.'
                : 'Approving a request records the range as Leave in attendance.'}
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
            <Spinner label="Loading leave requests..." />
          ) : (
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
                    <td>{daysBetween(leave.startDate, leave.endDate)}</td>
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
                            onClick={() => review(leave.id, 'approve')}
                          >
                            <Check size={14} /> Approve
                          </button>
                          <button
                            className="reject-btn"
                            onClick={() =>
                              askConfirm({
                                title: 'Reject leave request?',
                                message: `${leave.employee?.name || 'This employee'} requested leave from ${formatDate(
                                  leave.startDate
                                )} to ${formatDate(leave.endDate)}.`,
                                confirmLabel: 'Reject',
                                danger: true,
                                onConfirm: () => review(leave.id, 'reject'),
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
