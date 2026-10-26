import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import ProfileDetails from '../../components/ProfileDetails';
import { errMsg } from '../../lib/format';

export default function EmployeeProfile({ user, onUserUpdate }) {
  const notify = useToast();
  const [person, setPerson] = useState(user);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const { data } = await api.get('/auth/me');
      if (data?.user) {
        setPerson(data.user);
        onUserUpdate?.(data.user);
      }
    } catch (error) {
      notify('error', errMsg(error));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EMPLOYEE WORKSPACE</p>
          <h1>My profile</h1>
          <p className="muted">
            Your account details, including everything your administrator has entered for you.
          </p>
        </div>
        <button type="button" className="secondary" onClick={load} disabled={refreshing}>
          <RefreshCw size={16} /> {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Profile details</h2>
            <p className="muted small-text">
              Read-only. Ask an administrator to update your name, email, ID, department, position
              or working location.
            </p>
          </div>
        </div>
        <ProfileDetails person={person} roleLabel="Employee" />
      </section>
    </div>
  );
}
