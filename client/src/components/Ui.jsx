export function StatCard({ label, value, icon, foot, onClick }) {
  const content = (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{foot}</div>
    </div>
  );

  if (!onClick) return content;
  return (
    <button type="button" className="stat-button" onClick={onClick}>
      {content}
    </button>
  );
}

export function Status({ status }) {
  const value = status || 'Unmarked';
  const cls = String(value).toLowerCase().replace(/\s+/g, '-');
  return <span className={`status status-${cls}`}>{value}</span>;
}

export function DayFlag({ late, earlyCheckout, missingCheckOut, missingCheckIn }) {
  const flags = [];
  if (late) flags.push(['Late', 'late']);
  if (earlyCheckout) flags.push(['Early out', 'early']);
  if (missingCheckOut) flags.push(['No check-out', 'missing']);
  if (missingCheckIn) flags.push(['No check-in', 'missing']);
  if (!flags.length) return <span className="muted small-text">—</span>;
  return (
    <span className="flag-row">
      {flags.map(([label, kind]) => (
        <span key={label} className={`flag flag-${kind}`}>
          {label}
        </span>
      ))}
    </span>
  );
}
