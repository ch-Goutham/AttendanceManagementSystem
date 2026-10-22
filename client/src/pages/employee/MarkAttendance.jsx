import { useState } from 'react';
import { ClipboardCheck, Clock, LogIn } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import { todayKey } from '../../lib/dates';
import { errMsg } from '../../lib/format';

export default function MarkAttendance() {
  const notify = useToast();
  const [mark, setMark] = useState({ date: todayKey(), status: 'Present' });
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post('/attendance', mark);
      notify('success', 'Submitted for admin approval.');
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EMPLOYEE WORKSPACE</p>
          <h1>Mark attendance</h1>
          <p className="muted">
            Record a day yourself as Present or Absent. Your admin confirms it before it counts.
          </p>
        </div>
      </div>

      <div className="alert info">
        <LogIn size={15} /> For today, use the <b>Check in / Check out</b> buttons on My attendance so
        your times are captured automatically.
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Self-mark a day</h2>
            <p className="muted small-text">
              Use this for a day you missed. A confirmed day cannot be changed here.
            </p>
          </div>
        </div>
        <form className="mark-grid" onSubmit={submit}>
          <label>
            Date
            <input
              type="date"
              required
              max={todayKey()}
              value={mark.date}
              onChange={(event) => setMark({ ...mark, date: event.target.value })}
            />
          </label>
          <label>
            Status
            <select
              value={mark.status}
              onChange={(event) => setMark({ ...mark, status: event.target.value })}
            >
              <option>Present</option>
              <option>Absent</option>
            </select>
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Submitting...' : 'Submit for approval'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>How approval works</h2>
          </div>
        </div>
        <div className="rules-list">
          <div>
            <span>
              <Clock size={14} /> Pending
            </span>
            <b>Waiting for your admin</b>
          </div>
          <div>
            <span>
              <ClipboardCheck size={14} /> Confirmed
            </span>
            <b>Counts toward attendance</b>
          </div>
          <div>
            <span>Rejected</span>
            <b>Does not count</b>
          </div>
        </div>
      </section>
    </div>
  );
}
