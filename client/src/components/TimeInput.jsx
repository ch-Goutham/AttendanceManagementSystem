// 12-hour time picker with an explicit AM/PM selector.
// The parent keeps the canonical "HH:MM" (24-hour) value so the API contract
// is unchanged; this component only handles how the value is presented/edited.
const pad = (value) => String(value).padStart(2, '0');

const parseValue = (value) => {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return { hours, minutes };
};

const to24Hour = (hour12, meridiem) => {
  if (meridiem === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
};

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

export default function TimeInput({
  value = '',
  onChange,
  disabled = false,
  required = false,
  id,
  name,
  className = '',
}) {
  const parsed = parseValue(value);
  const hour12 = parsed ? (parsed.hours % 12 === 0 ? 12 : parsed.hours % 12) : '';
  const minute = parsed ? parsed.minutes : '';
  const meridiem = parsed ? (parsed.hours >= 12 ? 'PM' : 'AM') : 'AM';

  const emit = (nextHour12, nextMinute, nextMeridiem) => {
    const hours24 = to24Hour(nextHour12, nextMeridiem);
    onChange?.({ target: { value: `${pad(hours24)}:${pad(nextMinute)}` } });
  };

  const handleHour = (event) => {
    const next = event.target.value;
    if (!next) {
      onChange?.({ target: { value: '' } });
      return;
    }
    emit(Number(next), parsed ? parsed.minutes : 0, meridiem);
  };

  const handleMinute = (event) => {
    const next = event.target.value;
    if (next === '') return;
    // Picking a minute before an hour defaults the hour to 12.
    emit(parsed ? hour12 : 12, Number(next), parsed ? meridiem : 'AM');
  };

  const handleMeridiem = (event) => {
    // Picking AM/PM before an hour defaults the time to 12:00.
    emit(parsed ? hour12 : 12, parsed ? parsed.minutes : 0, event.target.value);
  };

  return (
    <div className={`time-input ${className}`.trim()}>
      <select
        id={id}
        name={name}
        className="time-hour"
        aria-label="Hour"
        value={hour12}
        onChange={handleHour}
        disabled={disabled}
        required={required}
      >
        <option value="">HH</option>
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {pad(hour)}
          </option>
        ))}
      </select>
      <span className="time-colon" aria-hidden="true">
        :
      </span>
      <select
        className="time-minute"
        aria-label="Minute"
        value={minute}
        onChange={handleMinute}
        disabled={disabled}
      >
        <option value="">MM</option>
        {MINUTES.map((minuteOption) => (
          <option key={minuteOption} value={minuteOption}>
            {pad(minuteOption)}
          </option>
        ))}
      </select>
      <select
        className="time-meridiem"
        aria-label="AM or PM"
        value={meridiem}
        onChange={handleMeridiem}
        disabled={disabled}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
