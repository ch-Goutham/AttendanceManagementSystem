import dotenv from 'dotenv';

// This module can be imported before server.js calls dotenv.config() (ESM
// imports are evaluated first), so load the environment here too.
dotenv.config();

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FALLBACK_WORKING_DAYS = [1, 2, 3, 4, 5, 6];

export const isValidTime = (value) => typeof value === 'string' && TIME_PATTERN.test(value);
export const isValidDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/**
 * Company wall-clock timezone. Attendance dates and HH:mm values must follow
 * the office clock, not the server's clock: a host such as Render runs in UTC,
 * which would record 10:00 IST as 04:30 and roll the date over at 05:30 IST.
 */
export function getCompanyTimeZone() {
  const configured = String(process.env.COMPANY_TIMEZONE || '').trim();
  const fallback = 'Asia/Kolkata';
  const candidate = configured || fallback;
  try {
    // Throws for an unknown IANA zone, in which case UTC is the safe default.
    new Intl.DateTimeFormat('en-GB', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'UTC';
  }
}

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function workingDaysFromEnv(raw) {
  if (!raw) return FALLBACK_WORKING_DAYS;
  const days = String(raw)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return days.length ? [...new Set(days)].sort((a, b) => a - b) : FALLBACK_WORKING_DAYS;
}

/**
 * Read shift rules on every call so .env changes only need a server restart,
 * not a module reload, and every request sees the same values.
 */
export function getAttendanceConfig() {
  return {
    shiftStart: isValidTime(process.env.SHIFT_START) ? process.env.SHIFT_START : '09:30',
    shiftEnd: isValidTime(process.env.SHIFT_END) ? process.env.SHIFT_END : '18:00',
    graceMinutes: Math.max(0, numberFromEnv('GRACE_MINUTES', 10)),
    halfDayMinutes: Math.max(0, numberFromEnv('HALF_DAY_MINUTES', 240)),
    workingDays: workingDaysFromEnv(process.env.WORKING_DAYS),
  };
}

/** Safe to send to a signed-in client: no secrets, only scheduling rules. */
export function publicAttendanceConfig() {
  const config = getAttendanceConfig();
  return {
    ...config,
    timeZone: getCompanyTimeZone(),
    workingDayNames: config.workingDays.map((day) => DAY_NAMES[day]),
  };
}
