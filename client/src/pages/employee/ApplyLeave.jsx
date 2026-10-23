import { useEffect, useState } from 'react';
import { UserRound, RefreshCw } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Spinner from '../../components/Spinner';
import { Status } from '../../components/Ui';
import { daysBetween, formatDate } from '../../lib/dates';
import { errMsg } from '../../lib/format';

const EMPTY_FORM = { startDate: '', endDate: '', reason: '' };

export default function ApplyLeave() {
  const notify = useToast();
  const [leaveForm, setLeaveForm] = useState(EMPTY_FORM);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadLeaves() {
    setLoading(true);
    try {
      const { data } = await api.get('/leaves');
      setLeaves(data.leaves || []);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaves();
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post('/leaves', leaveForm);
      notify('success', 'Leave request submitted.');
      setLeaveForm(EMPTY_FORM);
      await loadLeaves();
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = leaves.filter((leave) => leave.status === 'Pending').length;
  const totalDays = daysBetween(leaveForm.startDate, leaveForm.endDate);

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EMPLOYEE WORKSPACE</p>
          <h1>Apply leave</h1>
          <p className="muted">
            Submit a leave request and track its status. Approved dates appear as Leave in your attendance.
            {pendingCount ? ` ${pendingCount} request(s) pending.` : ''}
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>New leave request</h2>
            <p className="muted small-text">Choose the dates and give a reason. Your admin will review it.</p>
          </div>
        </div>
        <form className="mark-grid" onSubmit={submit}>
          <label>
            From
            <input
              type="date"
              required
              value={leaveForm.startDate}
              onChange={(event) => setLeaveForm({ ...leaveForm, startDate: event.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              required
              min={leaveForm.startDate || undefined}
              value={leaveForm.endDate}
              onChange={(event) => setLeaveForm({ ...leaveForm, endDate: event.target.value })}
            />
          </label>
          <div className="duration-preview">
            <span>Total leave days</span>
            <b>{totalDays ? `${totalDays} day${totalDays === 1 ? '' : 's'}` : '—'}</b>
          </div>
          <label>
            Reason
            <input
              required
              value={leaveForm.reason}
              onChange={(event) => setLeaveForm({ ...leaveForm, reason: event.target.value })}
              placeholder="Why are you taking leave?"
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Submitting...' : 'Submit request'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading responsive-heading">
          <div>
            <h2>My leave requests</h2>
            <p className="muted small-text">Every application you have made, newest first.</p>
          </div>
          <button className="icon-btn" onClick={loadLeaves} title="Refresh" type="button">
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="table-wrap">
          {loading ? (
            <Spinner label="Loading your leave requests..." />
          ) : (
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
                {leaves.map((leave) => (
                  <tr key={leave.id}>
                    <td>{formatDate(leave.startDate)}</td>
                    <td>{formatDate(leave.endDate)}</td>
                    <td>{leave.days ?? daysBetween(leave.startDate, leave.endDate)}</td>
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
                  </tr>
                ))}
                {!leaves.length && (
                  <tr>
                    <td colSpan="6" className="empty">
                      You have not applied for any leave yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="muted small-text leave-hint">
        <UserRound size={14} /> Leave days are excluded from your attendance percentage.
      </div>
    </div>
  );
}
