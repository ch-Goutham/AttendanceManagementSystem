import { useEffect, useMemo, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import Spinner from '../../components/Spinner';
import { Status } from '../../components/Ui';
import { durationLabel, formatDate, formatTime, timeToMinutes, todayKey } from '../../lib/dates';
import { errMsg } from '../../lib/format';

const EMPTY_FORM = { date: todayKey(), startTime: '', endTime: '', reason: '' };

export default function ApplyPermission() {
  const notify = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadPermissions() {
    setLoading(true);
    try {
      const { data } = await api.get('/permissions');
      setPermissions(data.permissions || []);
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPermissions();
  }, []);

  const durationMinutes = useMemo(() => {
    const start = timeToMinutes(form.startTime);
    const end = timeToMinutes(form.endTime);
    if (start == null || end == null || end <= start) return 0;
    return end - start;
  }, [form.startTime, form.endTime]);

  async function submit(event) {
    event.preventDefault();
    if (!durationMinutes) {
      notify('error', 'End time must be later than start time.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/permissions', form);
      notify('success', 'Permission request submitted.');
      setForm({ ...EMPTY_FORM, date: form.date });
      await loadPermissions();
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = permissions.filter((permission) => permission.status === 'Pending').length;

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EMPLOYEE WORKSPACE</p>
          <h1>Permission</h1>
          <p className="muted">
            Ask for permission to be away for part of a day. Your admin reviews every request.
            {pendingCount ? ` ${pendingCount} request(s) pending.` : ''}
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>New permission request</h2>
            <p className="muted small-text">
              Choose the date and time window, give a reason, and the total duration is calculated for you.
            </p>
          </div>
        </div>
        <form className="mark-grid permission-form" onSubmit={submit}>
          <label>
            Date
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </label>
          <label>
            Start time
            <input
              type="time"
              required
              value={form.startTime}
              onChange={(event) => setForm({ ...form, startTime: event.target.value })}
            />
          </label>
          <label>
            End time
            <input
              type="time"
              required
              value={form.endTime}
              onChange={(event) => setForm({ ...form, endTime: event.target.value })}
            />
          </label>
          <div className="duration-preview">
            <span>Total duration</span>
            <b>{durationMinutes ? durationLabel(durationMinutes) : '—'}</b>
          </div>
          <label className="permission-reason">
            Reason
            <input
              required
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
              placeholder="Why do you need permission?"
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
            <h2>My permission requests</h2>
            <p className="muted small-text">
              Every request you have made, newest first, with its approval status.
            </p>
          </div>
          <button className="icon-btn" onClick={loadPermissions} title="Refresh" type="button">
            <RefreshCw size={16} />
          </button>
        </div>
        <div className="table-wrap">
          {loading ? (
            <Spinner label="Loading your permission requests..." />
          ) : (
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
                {permissions.map((permission) => (
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
                    <td>
                      {permission.reviewer?.name || '—'}
                      {permission.reviewNote && (
                        <small className="cell-note">{permission.reviewNote}</small>
                      )}
                    </td>
                  </tr>
                ))}
                {!permissions.length && (
                  <tr>
                    <td colSpan="7" className="empty">
                      You have not requested any permission yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="muted small-text leave-hint">
        <Clock size={14} /> Permission requests do not change your attendance status; they record the
        approved time away from work.
      </div>
    </div>
  );
}
