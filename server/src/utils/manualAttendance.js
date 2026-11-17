import { getAttendanceConfig, isValidLocation } from '../config/attendance.js';
import { computeAttendanceMetrics, validateTimes } from './attendanceRules.js';

export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Leave'];
export const ATTENDANCE_DAY_TYPES = ['Full day', 'Half day', ''];

/**
 * Normalize admin-entered attendance fields for a new record or a correction.
 * Returns { error } for invalid input, or { fields } ready to persist.
 *
 * Times are optional: an admin can mark a Present day without them, record only
 * a check-in (open session) or only a check-out. All the same rules as the
 * existing attendance correction form apply.
 */
export function buildManualAttendance(input = {}) {
  const status = input.status ?? 'Present';
  if (!ATTENDANCE_STATUSES.includes(status)) {
    return { error: 'status must be Present, Absent or Leave' };
  }

  const providedDayType =
    input.dayType === undefined || input.dayType === null ? '' : input.dayType;
  if (!ATTENDANCE_DAY_TYPES.includes(providedDayType)) {
    return { error: 'Invalid dayType' };
  }

  const location = String(input.location ?? '').trim();
  if (location && !isValidLocation(location)) {
    return { error: 'location must be Office, Work from home or College' };
  }

  const note = String(input.note ?? '').trim();

  if (status !== 'Present') {
    return {
      fields: {
        status,
        checkIn: '',
        checkOut: '',
        checkInAt: null,
        checkOutAt: null,
        sessions: [],
        openSession: false,
        dayType: '',
        location,
        lateReason: '',
        note,
        source: 'admin',
        approval: 'confirmed'
      }
    };
  }

  const checkIn = String(input.checkIn ?? '').trim();
  const checkOut = String(input.checkOut ?? '').trim();
  const timeError = validateTimes(checkIn, checkOut);
  if (timeError) return { error: timeError };

  const metrics = computeAttendanceMetrics(
    { status, checkIn, checkOut, dayType: providedDayType },
    getAttendanceConfig()
  );
  const hasTimes = Boolean(checkIn || checkOut);

  return {
    fields: {
      status,
      checkIn,
      checkOut,
      checkInAt: null,
      checkOutAt: null,
      sessions: hasTimes
        ? [{ checkIn, checkOut, checkInAt: null, checkOutAt: null }]
        : [],
      openSession: Boolean(checkIn && !checkOut),
      dayType: providedDayType || metrics.dayType,
      location,
      lateReason: '',
      note,
      source: 'admin',
      approval: 'confirmed'
    }
  };
}
