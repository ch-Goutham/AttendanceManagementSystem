import { getAttendanceConfig, isValidTime, TIME_PATTERN } from '../config/attendance.js';

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

export const todayKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const monthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const nowTime = (date = new Date()) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * Derived attendance facts. Nothing here is persisted except the final
 * `dayType`, so changing the shift in .env never leaves stale flags behind.
 */
export function computeAttendanceMetrics(record, config = getAttendanceConfig()) {
  const status = record.status;
  const checkIn = record.checkIn || '';
  const checkOut = record.checkOut || '';
  const inMinutes = toMinutes(checkIn);
  const outMinutes = toMinutes(checkOut);
  const isPresent = status === 'Present';

  const workedMinutes =
    inMinutes != null && outMinutes != null && outMinutes > inMinutes ? outMinutes - inMinutes : null;

  const shiftStart = toMinutes(config.shiftStart);
  const shiftEnd = toMinutes(config.shiftEnd);

  const late = isPresent && inMinutes != null && inMinutes > shiftStart + config.graceMinutes;
  const earlyCheckout = isPresent && outMinutes != null && outMinutes < shiftEnd;
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
    if (outMinutes <= inMinutes) return 'Check-out must be later than check-in';
  }
  return null;
}

export { TIME_PATTERN };
