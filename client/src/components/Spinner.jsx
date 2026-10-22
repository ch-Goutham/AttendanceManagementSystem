export default function Spinner({ label = 'Loading...' }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" />
      <span className="spinner-label">{label}</span>
    </div>
  );
}
