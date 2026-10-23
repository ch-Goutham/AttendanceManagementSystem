import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { isValidDate, publicAttendanceConfig } from '../config/attendance.js';
import {
  computeAttendanceMetrics,
  nowTime,
  serializeAttendance,
  todayKey,
  validateTimes,
} from '../utils/attendanceRules.js';

const router = Router();
const EMPLOYEE_FIELDS = 'name email employeeCode department';
const DAY_TYPES = ['Full day', 'Half day', ''];
const STATUSES = ['Present', 'Absent', 'Leave'];

const monthRange = (month) => ({ $gte: `${month}-01`, $lte: `${month}-31` });

// How far back an unfinished check-in is still considered "open". This covers a
// night shift that checks out after midnight and an employee who forgot to
// check out before the date rolled over, without reviving weeks-old rows.
const OPEN_CHECKOUT_WINDOW_MS = 20 * 60 * 60 * 1000;

function findOpenRecord(employeeId, now = new Date()) {
  const since = new Date(now.getTime() - OPEN_CHECKOUT_WINDOW_MS);
  return Attendance.findOne({
    employee: employeeId,
    date: { $lt: todayKey(now), $gte: todayKey(since) },
    status: 'Present',
    checkIn: { $nin: ['', null] },
    checkOut: { $in: ['', null] },
  }).sort({ date: -1 });
}

function normalizeDayType(value) {
  if (value === undefined || value === null) return '';
  return DAY_TYPES.includes(value) ? value : undefined;
}

router.use(protect);

// The signed-in employee's own record for today, used by Mark Attendance.
router.get('/today', async (req, res, next) => {
  try {
    const date = todayKey();
    const record = await Attendance.findOne({ employee: req.user._id, date }).populate(
      'employee',
      EMPLOYEE_FIELDS
    );

    // A check-in from yesterday (night shift or a forgotten check-out) is shown
    // so the employee can close it instead of silently leaving a half day open.
    let openRecord = null;
    if (!record?.checkIn) {
      const carried = await findOpenRecord(req.user._id);
      if (carried) openRecord = serializeAttendance(carried);
    }

    res.json({
      date,
      record: record ? serializeAttendance(record) : null,
      openRecord,
      config: publicAttendanceConfig(),
    });
  } catch (e) {
    next(e);
  }
});

// Admin sees every employee's records, optionally filtered by month, exact
// date or employee. Employees are always scoped to their own records.
router.get('/', async (req, res, next) => {
  try {
    const { month, employeeId, date } = req.query;
    const query = {};

    if (date) {
      if (!isValidDate(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
      query.date = date;
    } else if (month) {
      if (!/^\d{4}-\d{2}$/.test(month))
        return res.status(400).json({ message: 'month must be YYYY-MM' });
      query.date = monthRange(month);
    }

    if (req.user.role === 'employee') query.employee = req.user._id;
    else if (employeeId) query.employee = employeeId;

    const records = await Attendance.find(query)
      .populate('employee', EMPLOYEE_FIELDS)
      .sort({ date: -1, createdAt: -1 });

    res.json({ records: records.map((record) => serializeAttendance(record)) });
  } catch (e) {
    next(e);
  }
});

// Employee check-in for today. Stores the exact server instant alongside the
// HH:mm display value. Check-in and check-out are final records immediately.
router.post('/check-in', async (req, res, next) => {
  try {
    if (req.user.role !== 'employee')
      return res.status(403).json({ message: 'Only employees can check in' });

    const now = new Date();
    const date = todayKey(now);
    const existing = await Attendance.findOne({ employee: req.user._id, date });

    if (existing?.checkIn)
      return res.status(409).json({ message: 'You have already checked in today.' });
    if (existing?.status === 'Leave')
      return res.status(409).json({ message: 'You are marked on leave today. Ask your admin to correct it.' });
    if (existing?.status === 'Absent')
      return res.status(409).json({ message: 'You are marked absent today. Ask your admin to correct it.' });

    const openRecord = await findOpenRecord(req.user._id, now);
    if (openRecord)
      return res.status(409).json({
        message: `You still have an open check-in from ${openRecord.date}. Check out first before starting a new day.`,
      });

    const checkIn = nowTime(now);
    const record = await Attendance.findOneAndUpdate(
      { employee: req.user._id, date },
      {
        $set: {
          status: 'Present',
          checkIn,
          checkInAt: now,
          checkOut: '',
          checkOutAt: null,
          lateReason: String(req.body?.lateReason || '').trim(),
          dayType: '',
          source: 'self',
          approval: 'confirmed',
          markedBy: req.user._id,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).populate('employee', EMPLOYEE_FIELDS);

    res.json({ record: serializeAttendance(record), config: publicAttendanceConfig() });
  } catch (e) {
    next(e);
  }
});

// Employee check-out for today. Requires an open check-in and can run once.
router.post('/check-out', async (req, res, next) => {
  try {
    if (req.user.role !== 'employee')
      return res.status(403).json({ message: 'Only employees can check out' });

    const now = new Date();
    const date = todayKey(now);
    let existing = await Attendance.findOne({ employee: req.user._id, date });
    let carriedOver = false;

    // Fall back to an unfinished record from the previous day so a check-out
    // after midnight (or a forgotten check-out) still closes the right row.
    if (!existing?.checkIn) {
      existing = await findOpenRecord(req.user._id, now);
      carriedOver = Boolean(existing?.checkIn);
    }

    if (!existing?.checkIn) return res.status(400).json({ message: 'Check in first before checking out.' });
    if (existing.checkOut)
      return res.status(409).json({ message: 'You have already checked out today.' });

    const checkOut = nowTime(now);
    // Comparing HH:mm only makes sense within one calendar day; a carried-over
    // night shift is measured from the exact timestamps instead.
    if (!carriedOver) {
      const timeError = validateTimes(existing.checkIn, checkOut);
      if (timeError) return res.status(400).json({ message: timeError });
    }

    const metrics = computeAttendanceMetrics({
      status: 'Present',
      checkIn: existing.checkIn,
      checkOut,
      checkInAt: existing.checkInAt,
      checkOutAt: now,
      dayType: '',
    });

    const record = await Attendance.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          status: 'Present',
          checkOut,
          checkOutAt: now,
          dayType: metrics.dayType,
          source: 'self',
          approval: 'confirmed',
        },
      },
      { new: true, runValidators: true }
    ).populate('employee', EMPLOYEE_FIELDS);

    res.json({
      record: serializeAttendance(record),
      config: publicAttendanceConfig(),
      carriedOver,
    });
  } catch (e) {
    next(e);
  }
});

// Employee adds or updates the reason for a late check-in. The recorded time
// itself is never touched by this endpoint.
router.patch('/today/late-reason', async (req, res, next) => {
  try {
    if (req.user.role !== 'employee')
      return res.status(403).json({ message: 'Only employees can add a late reason' });

    const lateReason = String(req.body?.lateReason || '').trim();
    if (!lateReason) return res.status(400).json({ message: 'Enter a reason for the late arrival' });

    const date = todayKey();
    const record = await Attendance.findOne({ employee: req.user._id, date });
    if (!record) return res.status(404).json({ message: 'No attendance record for today' });
    if (record.status !== 'Present' || !record.checkIn)
      return res.status(400).json({ message: 'Check in first before adding a late reason' });

    const metrics = computeAttendanceMetrics(record);
    if (!metrics.late)
      return res.status(400).json({ message: 'Your check-in was within the grace period, so it is not late' });

    record.lateReason = lateReason;
    await record.save();
    await record.populate('employee', EMPLOYEE_FIELDS);

    res.json({ record: serializeAttendance(record) });
  } catch (e) {
    next(e);
  }
});

// Admin correction of any record. Times may be cleared; day type can be
// overridden (empty string means derive it from the times).
router.patch('/:id', adminOnly, async (req, res, next) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });

    const status = req.body.status ?? record.status;
    if (!STATUSES.includes(status))
      return res.status(400).json({ message: 'status must be Present, Absent or Leave' });

    const providedDayType = normalizeDayType(req.body.dayType);
    if (providedDayType === undefined) return res.status(400).json({ message: 'Invalid dayType' });

    let checkIn = req.body.checkIn !== undefined ? req.body.checkIn || '' : record.checkIn || '';
    let checkOut = req.body.checkOut !== undefined ? req.body.checkOut || '' : record.checkOut || '';
    let dayType = providedDayType;

    if (status !== 'Present') {
      checkIn = '';
      checkOut = '';
      dayType = '';
    } else {
      const timeError = validateTimes(checkIn, checkOut);
      if (timeError) return res.status(400).json({ message: timeError });
      const metrics = computeAttendanceMetrics({ status, checkIn, checkOut, dayType });
      dayType = dayType || metrics.dayType;
    }

    record.status = status;
    record.checkIn = checkIn;
    record.checkOut = checkOut;
    record.dayType = dayType;
    if (req.body.note !== undefined) record.note = req.body.note;

    // A manual correction is a new, admin-authored value: any exact check-in or
    // check-out instant captured by the employee no longer describes this row.
    if (req.body.checkIn !== undefined || req.body.checkOut !== undefined || status !== 'Present') {
      record.checkInAt = null;
      record.checkOutAt = null;
    }
    if (req.body.lateReason !== undefined) record.lateReason = String(req.body.lateReason || '').trim();
    if (status !== 'Present') record.lateReason = '';

    record.source = 'admin';
    record.approval = 'confirmed';
    record.editedBy = req.user._id;
    record.editedAt = new Date();

    await record.save();
    await record.populate('employee', EMPLOYEE_FIELDS);

    res.json({ record: serializeAttendance(record) });
  } catch (e) {
    next(e);
  }
});

export default router;
