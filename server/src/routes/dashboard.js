import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import Leave from '../models/Leave.js';
import Permission from '../models/Permission.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { getAttendanceConfig, getCompanyTimeZone } from '../config/attendance.js';
import { serializeAttendance, todayKey } from '../utils/attendanceRules.js';
import { inclusiveDays, leaveShape, permissionShape } from '../utils/requestShapes.js';

const router = Router();
router.use(protect);

// Today's headline numbers plus every pending permission and leave request for
// the admin dashboard. Both approval panels intentionally have no preview limit
// so the admin can act on anything waiting.
router.get('/', adminOnly, async (_req, res, next) => {
  try {
    const date = todayKey();

    // Run every independent query at once. Attendance is filtered against the
    // active employee IDs in memory instead of making the dashboard wait for a
    // second database round trip.
    const [activeEmployees, allRecords, approvedPermissions, pendingPermissions, pendingLeaves] =
      await Promise.all([
        User.find({ role: 'employee', isActive: { $ne: false } })
          .select('name email department')
          .lean(),
        Attendance.find({ date }).lean(),
        Permission.find({ date, status: 'Approved' }).select('employee').lean(),
        Permission.find({ status: 'Pending' })
          .populate('employee', 'name email employeeCode department')
          .sort({ date: 1, startTime: 1, createdAt: 1 })
          .lean(),
        Leave.find({ status: 'Pending' })
          .populate('employee', 'name email employeeCode department')
          .sort({ createdAt: 1 })
          .lean()
      ]);

    const activeById = new Map(
      activeEmployees.map((employee) => [String(employee._id), employee])
    );
    const activeIds = new Set(activeById.keys());
    const records = allRecords.filter((record) => activeIds.has(String(record.employee)));

    const config = getAttendanceConfig();
    const shaped = records.map((record) => serializeAttendance(record, config));
    const present = shaped.filter((record) => record.status === 'Present');
    const onLeave = shaped.filter((record) => record.status === 'Leave').length;
    const lateArrivals = present.filter((record) => record.late).length;

    // Per-employee check-in/out detail for today, used by the dashboard panel.
    const todayActivity = present
      .map((record) => {
        const employee = activeById.get(String(record.employee));
        if (!employee) return null;
        return {
          employee: {
            id: String(employee._id),
            name: employee.name,
            email: employee.email,
            department: employee.department || ''
          },
          location: record.location,
          hoursLabel: record.hoursLabel,
          sessionCount: record.sessionCount,
          checkOutCount: record.checkOutCount,
          openSessionCount: record.openSessionCount,
          checkIn: record.checkIn,
          checkInAt: record.checkInAt,
          checkOut: record.checkOut,
          checkOutAt: record.checkOutAt,
          sessions: record.sessions,
          late: record.late
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));

    // One employee counts once even when they have several approved permission
    // windows today.
    const permissionToday = new Set(
      approvedPermissions
        .map((permission) => String(permission.employee))
        .filter((employeeId) => activeIds.has(employeeId))
    ).size;

    res.json({
      totalEmployees: activeIds.size,
      presentToday: present.length,
      permissionToday,
      onLeaveToday: onLeave,
      lateArrivals,
      timeZone: getCompanyTimeZone(),
      todayActivity,
      pendingPermissionCount: pendingPermissions.length,
      pendingPermissions: pendingPermissions.map(permissionShape),
      pendingLeaveCount: pendingLeaves.length,
      pendingLeaves: pendingLeaves.map(leaveShape)
    });
  } catch (e) {
    next(e);
  }
});

// Employee dashboard: leave and permission totals, statuses and newest requests.
router.get('/me', async (req, res, next) => {
  try {
    if (req.user.role !== 'employee')
      return res.status(403).json({ message: 'This dashboard is for employees' });

    const [leaves, permissions] = await Promise.all([
      Leave.find({ employee: req.user._id }).sort({ createdAt: -1 }).lean(),
      Permission.find({ employee: req.user._id })
        .sort({ date: -1, startTime: -1, createdAt: -1 })
        .lean()
    ]);

    const countStatus = (rows, status) => rows.filter((row) => row.status === status).length;
    const sumDays = (rows) =>
      rows.reduce((sum, row) => sum + inclusiveDays(row.startDate, row.endDate), 0);

    const approvedLeaves = leaves.filter((leave) => leave.status === 'Approved');
    const approvedPermissions = permissions.filter((permission) => permission.status === 'Approved');

    res.json({
      leaveStats: {
        total: leaves.length,
        pending: countStatus(leaves, 'Pending'),
        approved: approvedLeaves.length,
        rejected: countStatus(leaves, 'Rejected'),
        totalDays: sumDays(leaves),
        approvedDays: sumDays(approvedLeaves)
      },
      permissionStats: {
        total: permissions.length,
        pending: countStatus(permissions, 'Pending'),
        approved: approvedPermissions.length,
        rejected: countStatus(permissions, 'Rejected'),
        totalMinutes: permissions.reduce((sum, row) => sum + row.durationMinutes, 0),
        approvedMinutes: approvedPermissions.reduce((sum, row) => sum + row.durationMinutes, 0)
      },
      leaves: leaves.slice(0, 6).map(leaveShape),
      permissions: permissions.slice(0, 6).map(permissionShape)
    });
  } catch (e) {
    next(e);
  }
});

export default router;
