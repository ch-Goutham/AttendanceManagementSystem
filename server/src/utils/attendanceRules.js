import {
  getAttendanceConfig,
  getCompanyTimeZone,
  isValidTime,
  TIME_PATTERN,
} from '../config/attendance.js';

/** "09:30" -> 570. Returns null for empty or malformed values. */
export function toMinutes(value) {
  if (!isValidTime(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToHours(minutes) {
  return minutes == null ? null : Math.round((minutes / 60) * 100) / 100;
}

export function hoursLabel(minutes) {
  if (minutes == null) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
}

// Intl formatters are expensive to build, so cache one per timezone.
const formatterCache = new Map();
function zonedFormatter(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Calendar/clock parts of an instant in the company timezone. */
export function companyParts(date = new Date(), timeZone = getCompanyTimeZone()) {
  const parts = {};
  for (const part of zonedFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  // Some engines report midnight as "24" when hour12 is false.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

const pad = (value) => String(value).padStart(2, '0');

/** YYYY-MM-DD in the company timezone. */
export const todayKey = (date = new Date()) => {
  const { year, month, day } = companyParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
};

export const monthKey = (date = new Date()) => {
  const { year, month } = companyParts(date);
  return `${year}-${pad(month)}`;
};

/** HH:mm in the company timezone. */
export const nowTime = (date = new Date()) => {
  const { hour, minute } = companyParts(date);
  return `${pad(hour)}:${pad(minute)}`;
};

/** Company-local minutes (with seconds) from an exact captured timestamp. */
function minutesOfDay(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const { hour, minute, second } = companyParts(date);
  return hour * 60 + minute + second / 60;
}

/**
 * Derived attendance facts. Nothing here is persisted except the final
 * `dayType`, so changing the shift in .env never leaves stale flags behind.
 * Exact check-in/out timestamps are preferred when present, so a same-minute
 * checkout and second-level lateness are still measured correctly.
 */
export function computeAttendanceMetrics(record, config = getAttendanceConfig()) {
  const status = record.status;
  const checkIn = record.checkIn || '';
  const checkOut = record.checkOut || '';
  const exactIn = minutesOfDay(record.checkInAt);
  const exactOut = minutesOfDay(record.checkOutAt);
  const inMinutes = exactIn ?? toMinutes(checkIn);
  const outMinutes = exactOut ?? toMinutes(checkOut);
  const isPresent = status === 'Present';

  // Exact instants are compared as full timestamps, so a night shift that ends
  // after midnight still produces the correct worked hours.
  const inInstant = record.checkInAt ? new Date(record.checkInAt) : null;
  const outInstant = record.checkOutAt ? new Date(record.checkOutAt) : null;
  const hasExactSpan =
    inInstant &&
    outInstant &&
    !Number.isNaN(inInstant.getTime()) &&
    !Number.isNaN(outInstant.getTime()) &&
    outInstant >= inInstant;

  const workedMinutes = hasExactSpan
    ? Math.round((outInstant - inInstant) / 60000)
    : inMinutes != null && outMinutes != null && outMinutes >= inMinutes
      ? Math.round(outMinutes - inMinutes)
      : null;

  // A span that crosses the company date cannot be judged against a single-day
  // shift window, so the late/early flags are left clear for those rows.
  const spansDates =
    inInstant &&
    outInstant &&
    !Number.isNaN(inInstant.getTime()) &&
    !Number.isNaN(outInstant.getTime()) &&
    todayKey(inInstant) !== todayKey(outInstant);

  const shiftStart = toMinutes(config.shiftStart);
  const shiftEnd = toMinutes(config.shiftEnd);

  const late =
    isPresent && !spansDates && inMinutes != null && inMinutes > shiftStart + config.graceMinutes;
  const earlyCheckout = isPresent && !spansDates && outMinutes != null && outMinutes < shiftEnd;
  const missingCheckOut = isPresent && inMinutes != null && outMinutes == null;
  const missingCheckIn = isPresent && inMinutes == null && outMinutes != null;

  const autoDayType =
    workedMinutes != null && workedMinutes < config.halfDayMinutes ? 'Half day' : 'Full day';
  const dayType = isPresent ? record.dayType || autoDayType : 'Full day';
  const dayWeight = isPresent ? (dayType === 'Half day' ? 0.5 : 1) : 0;

  return {
    checkIn,
    checkOut,
    dayType,
    workedMinutes,
    hours: minutesToHours(workedMinutes),
    hoursLabel: hoursLabel(workedMinutes),
    late,
    earlyCheckout,
    missingCheckOut,
    missingCheckIn,
    dayWeight,
  };
}

/** JSON shape used by every attendance response, including reports. */
export function serializeAttendance(record, config = getAttendanceConfig()) {
  const plain = record?.toObject ? record.toObject() : { ...record };
  const metrics = computeAttendanceMetrics(plain, config);
  return {
    ...plain,
    ...metrics,
    id: plain._id ? String(plain._id) : undefined,
  };
}

export function isWorkingDay(dateString, config = getAttendanceConfig()) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return config.workingDays.includes(date.getUTCDay());
}

export function workingDaysInMonth(month, config = getAttendanceConfig()) {
  if (!/^\d{4}-\d{2}$/.test(month)) return 0;
  const [year, monthNumber] = month.split('-').map(Number);
  const total = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    const date = new Date(Date.UTC(year, monthNumber - 1, day));
    if (config.workingDays.includes(date.getUTCDay())) count += 1;
  }
  return count;
}

export function attendancePercentage(weightedPresent, absent) {
  const denominator = weightedPresent + absent;
  if (!denominator) return 0;
  return Math.round((weightedPresent / denominator) * 10000) / 100;
}

export function validateTimes(checkIn, checkOut) {
  if (checkIn && !isValidTime(checkIn)) return 'Check-in time must be HH:mm (24-hour)';
  if (checkOut && !isValidTime(checkOut)) return 'Check-out time must be HH:mm (24-hour)';
  if (checkIn && checkOut) {
    const inMinutes = toMinutes(checkIn);
    const outMinutes = toMinutes(checkOut);
    if (outMinutes < inMinutes) return 'Check-out must be later than check-in';
  }
  return null;
}

export { TIME_PATTERN };
