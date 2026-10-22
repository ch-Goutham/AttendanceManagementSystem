import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { publicAttendanceConfig } from '../config/attendance.js';
import {
  isWorkingDay,
  serializeAttendance,
  todayKey,
} from '../utils/attendanceRules.js';

const router = Router();
router.use(protect, adminOnly);

/**
 * Today's headline numbers for the admin dashboard. Absent only counts
 * confirmed absences; people with no record are reported separately as
 * "unmarked" so a 9am glance does not label the whole team absent.
 */
router.get('/', async (_req, res, next) => {
  try {
    const date = todayKey();
    const config = publicAttendanceConfig();

    const employees = await User.find({ role: 'employee' }).select('_id isActive');
    const activeIds = employees.filter((employee) => employee.isActive !== false).map((e) => e._id);

    const records = activeIds.length
      ? await Attendance.find({ employee: { $in: activeIds }, date })
      : [];

    const shaped = records.map((record) => serializeAttendance(record, config));
    const counted = shaped.filter((record) => record.approval !== 'rejected');

    const present = counted.filter((record) => record.status === 'Present');
    const absent = counted.filter((record) => record.status === 'Absent').length;
    const onLeave = counted.filter((record) => record.status === 'Leave').length;
    const lateArrivals = present.filter((record) => record.late).length;
    const halfDays = present.filter((record) => record.dayType === 'Half day').length;
    const pendingApprovals = await Attendance.countDocuments({ approval: 'pending' });
    const unmarked = Math.max(0, activeIds.length - (present.length + absent + onLeave));

    res.json({
      date,
      isWorkingDay: isWorkingDay(date, config),
      totalEmployees: activeIds.length,
      presentToday: present.length,
      absentToday: absent,
      onLeaveToday: onLeave,
      lateArrivals,
      halfDaysToday: halfDays,
      pendingApprovals,
      unmarkedToday: unmarked,
      config,
    });
  } catch (e) {
    next(e);
  }
});

export default router;
