import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import Leave from '../models/Leave.js';
import Permission from '../models/Permission.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { serializeAttendance, todayKey } from '../utils/attendanceRules.js';
import { inclusiveDays, leaveShape, permissionShape } from '../utils/requestShapes.js';

const router = Router();
router.use(protect);

// Today's five headline numbers for the admin dashboard.
router.get('/', adminOnly, async (_req, res, next) => {
  try {
    const date = todayKey();

    const employees = await User.find({ role: 'employee' }).select('_id isActive');
    const activeIds = employees.filter((employee) => employee.isActive !== false).map((e) => e._id);

    const records = activeIds.length
      ? await Attendance.find({ employee: { $in: activeIds }, date })
      : [];

    const shaped = records.map((record) => serializeAttendance(record));
    const present = shaped.filter((record) => record.status === 'Present');
    const absent = shaped.filter((record) => record.status === 'Absent').length;
    const onLeave = shaped.filter((record) => record.status === 'Leave').length;
    const lateArrivals = present.filter((record) => record.late).length;

    res.json({
      totalEmployees: activeIds.length,
      presentToday: present.length,
      absentToday: absent,
      onLeaveToday: onLeave,
      lateArrivals,
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
      Leave.find({ employee: req.user._id }).sort({ createdAt: -1 }),
      Permission.find({ employee: req.user._id }).sort({ date: -1, startTime: -1, createdAt: -1 }),
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
        approvedDays: sumDays(approvedLeaves),
      },
      permissionStats: {
        total: permissions.length,
        pending: countStatus(permissions, 'Pending'),
        approved: approvedPermissions.length,
        rejected: countStatus(permissions, 'Rejected'),
        totalMinutes: permissions.reduce((sum, row) => sum + row.durationMinutes, 0),
        approvedMinutes: approvedPermissions.reduce((sum, row) => sum + row.durationMinutes, 0),
      },
      leaves: leaves.slice(0, 6).map(leaveShape),
      permissions: permissions.slice(0, 6).map(permissionShape),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
