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

function normalizeSession(session) {
  return {
    id: session._id ? String(session._id) : undefined,
    checkIn: session.checkIn || '',
    checkOut: session.checkOut || '',
    checkInAt: session.checkInAt || null,
    checkOutAt: session.checkOutAt || null
  };
}

/**
 * Every check-in/check-out pair for a record. Rows written before sessions
 * existed fall back to their single top-level pair, so no migration is needed.
 */
export function attendanceSessions(record) {
  const list = Array.isArray(record?.sessions) ? record.sessions.filter(Boolean) : [];
  if (list.length) return list.map(normalizeSession);
  if (record?.checkIn || record?.checkInAt || record?.checkOut || record?.checkOutAt) {
    return [
      normalizeSession({
        checkIn: record.checkIn,
        checkOut: record.checkOut,
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt
      })
    ];
  }
  return [];
}

/** Worked minutes for one pair; exact timestamps win over HH:mm values. */
function sessionMinutes(session) {
  const inInstant = session.checkInAt ? new Date(session.checkInAt) : null;
  const outInstant = session.checkOutAt ? new Date(session.checkOutAt) : null;
  if (
    inInstant &&
    outInstant &&
    !Number.isNaN(inInstant.getTime()) &&
    !Number.isNaN(outInstant.getTime()) &&
    outInstant >= inInstant
  ) {
    return Math.round((outInstant - inInstant) / 60000);
  }
  const inMinutes = toMinutes(session.checkIn);
  const outMinutes = toMinutes(session.checkOut);
  if (inMinutes != null && outMinutes != null && outMinutes >= inMinutes) {
    return outMinutes - inMinutes;
  }
  return null;
}

/**
 * Derived attendance facts. Nothing here is persisted except the final
 * `dayType`, so changing the shift in .env never leaves stale flags behind.
 * Exact check-in/out timestamps are preferred when present, so a same-minute
 * checkout and second-level lateness are still measured correctly.
 */
export function computeAttendanceMetrics(record, config = getAttendanceConfig()) {
  const status = record.status;
  const sessions = attendanceSessions(record);
  const first = sessions[0] || null;
  const last = sessions[sessions.length - 1] || null;
  const openSession = Boolean(last && !last.checkOut && !last.checkOutAt);
  const lastCompleted = [...sessions].reverse().find((session) => session.checkOut || session.checkOutAt) || null;

  const isPresent = status === 'Present';
  const firstIn = first ? (minutesOfDay(first.checkInAt) ?? toMinutes(first.checkIn)) : null;
  const lastOut = lastCompleted
    ? (minutesOfDay(lastCompleted.checkOutAt) ?? toMinutes(lastCompleted.checkOut))
    : null;

  // An open session has no checkout yet, so it contributes nothing until the
  // employee closes it. Completed sessions are summed.
  const workedSpans = sessions.map(sessionMinutes).filter((value) => value != null);
  const workedMinutes = workedSpans.length ? workedSpans.reduce((sum, value) => sum + value, 0) : null;
  const sessionCount = sessions.length;
  const checkOutCount = sessions.filter(
    (session) => session.checkOut || session.checkOutAt
  ).length;

  const firstInInstant = first?.checkInAt ? new Date(first.checkInAt) : null;
  const lastOutInstant = lastCompleted?.checkOutAt ? new Date(lastCompleted.checkOutAt) : null;
  // A span that crosses the company date cannot be judged against a single-day
  // shift window, so the late/early flags are left clear for those rows.
  const spansDates =
    firstInInstant &&
    lastOutInstant &&
    !Number.isNaN(firstInInstant.getTime()) &&
    !Number.isNaN(lastOutInstant.getTime()) &&
    todayKey(firstInInstant) !== todayKey(lastOutInstant);

  const shiftStart = toMinutes(config.shiftStart);
  const shiftEnd = toMinutes(config.shiftEnd);

  const late =
    isPresent && !spansDates && firstIn != null && firstIn > shiftStart + config.graceMinutes;
  const earlyCheckout =
    isPresent && !openSession && !spansDates && lastOut != null && lastOut < shiftEnd;
  const missingCheckOut = isPresent && openSession;
  const missingCheckIn = isPresent && !openSession && firstIn == null && lastOut != null;

  const autoDayType =
    workedMinutes != null && workedMinutes < config.halfDayMinutes ? 'Half day' : 'Full day';
  const dayType = isPresent ? record.dayType || autoDayType : 'Full day';
  const dayWeight = isPresent ? (dayType === 'Half day' ? 0.5 : 1) : 0;

  return {
    checkIn: first?.checkIn || '',
    checkOut: lastCompleted?.checkOut || '',
    checkInAt: first?.checkInAt || null,
    checkOutAt: lastCompleted?.checkOutAt || null,
    dayType,
    workedMinutes,
    hours: minutesToHours(workedMinutes),
    hoursLabel: hoursLabel(workedMinutes),
    late,
    earlyCheckout,
    missingCheckOut,
    missingCheckIn,
    dayWeight,
    sessions: sessions.map((session) => {
      const minutes = sessionMinutes(session);
      return {
        ...session,
        open: !session.checkOut && !session.checkOutAt,
        minutes,
        hoursLabel: hoursLabel(minutes)
      };
    }),
    sessionCount,
    checkOutCount,
    openSessionCount: sessionCount - checkOutCount,
    isCheckedIn: openSession
  };
}

/** JSON shape used by every attendance response, including reports. */
export function serializeAttendance(record, config = getAttendanceConfig()) {
  const plain = record?.toObject ? record.toObject() : { ...record };
  const metrics = computeAttendanceMetrics(plain, config);
  const cooldownMinutes = Number(config.recheckInCooldownMinutes) || 0;
  const lastCheckOutAt = metrics.checkOutAt ? new Date(metrics.checkOutAt) : null;
  const nextCheckInAt =
    !metrics.isCheckedIn && lastCheckOutAt && cooldownMinutes > 0
      ? new Date(lastCheckOutAt.getTime() + cooldownMinutes * 60000).toISOString()
      : null;
  const retryAfterSeconds = nextCheckInAt
    ? Math.max(0, Math.ceil((new Date(nextCheckInAt).getTime() - Date.now()) / 1000))
    : 0;

  return {
    ...plain,
    ...metrics,
    nextCheckInAt,
    retryAfterSeconds,
    id: plain._id ? String(plain._id) : undefined
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
