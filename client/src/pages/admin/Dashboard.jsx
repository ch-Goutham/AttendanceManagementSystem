import { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, CalendarOff, Clock } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../components/Toast';
import { StatCard } from '../../components/Ui';
import Spinner from '../../components/Spinner';
import { formatDate, todayKey } from '../../lib/dates';
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
          <p className="muted">{formatDate(todayKey())}</p>
        </div>
      </div>

      {loading || !data ? (
        <Spinner label="Loading today's numbers..." />
      ) : (
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
      )}
    </div>
  );
}
