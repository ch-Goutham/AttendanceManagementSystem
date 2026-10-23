import { hoursLabel } from './attendanceRules.js';

/** Inclusive day count for a YYYY-MM-DD range; 0 when the range is invalid. */
export function inclusiveDays(start, end) {
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(first) || Number.isNaN(last) || last < first) return 0;
  return Math.round((last - first) / 86400000) + 1;
}

/** Expand an inclusive YYYY-MM-DD range into each date, one day at a time (UTC, no drift). */
export function eachDate(start, end) {
  const out = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && out.length < 400) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function leaveShape(leave) {
  return {
    id: leave._id,
    startDate: leave.startDate,
    endDate: leave.endDate,
    days: inclusiveDays(leave.startDate, leave.endDate),
    reason: leave.reason,
    status: leave.status,
    reviewNote: leave.reviewNote,
    reviewedAt: leave.reviewedAt,
    reviewer:
      leave.reviewedBy && leave.reviewedBy.name
        ? { id: String(leave.reviewedBy._id), name: leave.reviewedBy.name }
        : null,
    createdAt: leave.createdAt,
    employee: leave.employee && leave.employee.name
      ? {
          id: leave.employee._id,
          name: leave.employee.name,
          email: leave.employee.email,
          employeeCode: leave.employee.employeeCode,
          department: leave.employee.department,
        }
      : null,
  };
}

export function permissionShape(permission) {
  return {
    id: permission._id,
    date: permission.date,
    startTime: permission.startTime,
    endTime: permission.endTime,
    durationMinutes: permission.durationMinutes,
    durationLabel: hoursLabel(permission.durationMinutes),
    reason: permission.reason,
    status: permission.status,
    reviewNote: permission.reviewNote,
    reviewedAt: permission.reviewedAt,
    reviewer:
      permission.reviewedBy && permission.reviewedBy.name
        ? { id: String(permission.reviewedBy._id), name: permission.reviewedBy.name }
        : null,
    createdAt: permission.createdAt,
    employee: permission.employee && permission.employee.name
      ? {
          id: permission.employee._id,
          name: permission.employee.name,
          email: permission.employee.email,
          employeeCode: permission.employee.employeeCode,
          department: permission.employee.department,
        }
      : null,
  };
}
