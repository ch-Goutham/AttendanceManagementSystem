export const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const dateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const todayKey = () => dateKey(new Date());

export const currentMonth = () => monthKey(new Date());

export const monthLabel = (month) => {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return month || '';
  const date = new Date(`${month}-01T12:00:00`);
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

export const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatTime = (value) => {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return '—';
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

// Exact server-captured instant (ISO string), including seconds. The optional
// timezone keeps the displayed time on the office clock even when the API host
// runs in UTC.
export const formatExactTime = (value, timeZone) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const options = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
  if (timeZone) options.timeZone = timeZone;
  return date.toLocaleTimeString(undefined, options);
};

export const durationLabel = (minutes) => {
  if (minutes == null) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${hours}h`;
};

export const hoursLabel = (minutes) => {
  if (minutes == null) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
};

export const daysBetween = (start, end) => {
  if (!start || !end) return 0;
  const first = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime()) || last < first) return 0;
  return Math.round((last - first) / 86400000) + 1;
};

export const timeToMinutes = (value) => {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};
