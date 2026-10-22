import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { isValidDate, publicAttendanceConfig } from '../config/attendance.js';
import {
  attendancePercentage,
  computeAttendanceMetrics,
  monthKey,
  nowTime,
  serializeAttendance,
  todayKey,
  validateTimes,
  workingDaysInMonth,
} from '../utils/attendanceRules.js';

const router = Router();
const EMPLOYEE_FIELDS = 'name email employeeCode department';
const DAY_TYPES = ['Full day', 'Half day', ''];
const STATUSES = ['Present', 'Absent', 'Leave'];

const monthRange = (month) => ({ $gte: `${month}-01`, $lte: `${month}-31` });

const normalizeMonth = (value) => (/^\d{4}-\d{2}$/.test(value || '') ? value : monthKey());

function normalizeDayType(value) {
  if (value === undefined || value === null) return '';
  return DAY_TYPES.includes(value) ? value : undefined;
}

router.use(protect);

// Shift rules for the UI (late threshold labels, working days).
router.get('/config', (_req, res) => {
  res.json({ config: publicAttendanceConfig() });
});

// The signed-in employee's own record for today, used by the check-in card.
router.get('/today', async (req, res, next) => {
  try {
    const date = todayKey();
    const record = await Attendance.findOne({ employee: req.user._id, date }).populate(
      'employee',
      EMPLOYEE_FIELDS
    );
    res.json({
      date,
      record: record ? serializeAttendance(record) : null,
      config: publicAttendanceConfig(),
    });
  } catch (e) {
    next(e);
  }
});

// Admin sees everyone (optionally filtered). Employees are always scoped to
// their own records no matter what they send in the query string.
router.get('/', async (req, res, next) => {
  try {
    const { month, employeeId, approval, status, date, from, to, late } = req.query;
    const query = {};

    if (date) {
      if (!isValidDate(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
      query.date = date;
    } else if (from || to) {
      if ((from && !isValidDate(from)) || (to && !isValidDate(to)))
        return res.status(400).json({ message: 'from and to must be YYYY-MM-DD' });
      query.date = { $gte: from || '0000-01-01', $lte: to || '9999-12-31' };
    } else if (month) {
      if (!/^\d{4}-\d{2}$/.test(month))
        return res.status(400).json({ message: 'month must be YYYY-MM' });
      query.date = monthRange(month);
    }

    if (approval) query.approval = approval;
    if (status) {
      if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status filter' });
      query.status = status;
    }

    if (req.user.role === 'employee') query.employee = req.user._id;
    else if (employeeId) query.employee = employeeId;

    let records = await Attendance.find(query)
      .populate('employee', EMPLOYEE_FIELDS)
      .sort({ date: -1, createdAt: -1 });

    let shaped = records.map((record) => serializeAttendance(record));
    if (late === 'true' || late === '1') shaped = shaped.filter((record) => record.late);

    res.json({ records: shaped });
  } catch (e) {
    next(e);
  }
});

// Monthly counters. Half days count as half a present day in the percentage.
router.get('/summary', async (req, res, next) => {
  try {
    const month = normalizeMonth(req.query.month);
    const query = { date: monthRange(month) };
    if (req.user.role === 'employee') query.employee = req.user._id;
    else if (req.query.employeeId) query.employee = req.query.employeeId;

    const records = (await Attendance.find(query)).map((record) => serializeAttendance(record));
    const confirmed = records.filter((record) => record.approval === 'confirmed');
    const presentRecords = confirmed.filter((record) => record.status === 'Present');
    const absent = confirmed.filter((record) => record.status === 'Absent').length;
    const leave = confirmed.filter((record) => record.status === 'Leave').length;
    const halfDays = presentRecords.filter((record) => record.dayType === 'Half day').length;
    const weightedPresent = presentRecords.reduce((sum, record) => sum + record.dayWeight, 0);
    const pending = records.filter((record) => record.approval === 'pending').length;
    const rejected = records.filter((record) => record.approval === 'rejected').length;

    res.json({
      month,
      present: presentRecords.length,
      presentDays: Math.round(weightedPresent * 100) / 100,
      halfDays,
      absent,
      leave,
      late: presentRecords.filter((record) => record.late).length,
      earlyCheckout: presentRecords.filter((record) => record.earlyCheckout).length,
      pending,
      rejected,
      totalMarked: records.length,
      workingDays: workingDaysInMonth(month),
      attendancePercentage: attendancePercentage(weightedPresent, absent),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/calendar', async (req, res, next) => {
  try {
    const month = normalizeMonth(req.query.month);
    const query = { date: monthRange(month) };
    if (req.user.role === 'employee') query.employee = req.user._id;
    else if (req.query.employeeId) query.employee = req.query.employeeId;

    const records = await Attendance.find(query).select(
      'date status note approval checkIn checkOut dayType'
    );
    res.json({
      month,
      records: records.map((record) => {
        const shaped = serializeAttendance(record);
        return {
          date: shaped.date,
          status: shaped.status,
          note: shaped.note,
          approval: shaped.approval,
          checkIn: shaped.checkIn,
          checkOut: shaped.checkOut,
          dayType: shaped.dayType,
          hoursLabel: shaped.hoursLabel,
          late: shaped.late,
          earlyCheckout: shaped.earlyCheckout,
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

// Admin-only queue of self-marks awaiting confirmation.
router.get('/pending', adminOnly, async (req, res, next) => {
  try {
    const query = { approval: 'pending' };
    if (req.query.month) query.date = monthRange(normalizeMonth(req.query.month));
    const records = await Attendance.find(query)
      .populate('employee', EMPLOYEE_FIELDS)
      .sort({ date: -1, updatedAt: -1 });
    res.json({ records: records.map((record) => serializeAttendance(record)) });
  } catch (e) {
    next(e);
  }
});

// Admin marks or corrects anyone, including Leave, and the record is confirmed.
router.post('/', async (req, res, next) => {
  try {
    const { employeeId, date, status, note = '', checkIn = '', checkOut = '' } = req.body;
    const isAdmin = req.user.role === 'admin';

    if (!isValidDate(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    if (!STATUSES.includes(status))
      return res.status(400).json({ message: 'status must be Present, Absent or Leave' });

    if (isAdmin) {
      if (!employeeId) return res.status(400).json({ message: 'employeeId is required' });
      const employee = await User.findOne({ _id: employeeId, role: 'employee', isActive: true });
      if (!employee) return res.status(404).json({ message: 'Active employee not found' });

      const dayType = normalizeDayType(req.body.dayType);
      if (dayType === undefined) return res.status(400).json({ message: 'Invalid dayType' });

      let times = { checkIn: '', checkOut: '', dayType: '' };
      if (status === 'Present') {
        const timeError = validateTimes(checkIn, checkOut);
        if (timeError) return res.status(400).json({ message: timeError });
        const metrics = computeAttendanceMetrics({ status, checkIn, checkOut, dayType });
        times = { checkIn, checkOut, dayType: dayType || metrics.dayType };
      }

      const record = await Attendance.findOneAndUpdate(
        { employee: employeeId, date },
        {
          $set: {
            status,
            note,
            ...times,
            source: 'admin',
            approval: 'confirmed',
            markedBy: req.user._id,
            editedBy: req.user._id,
            editedAt: new Date(),
          },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      ).populate('employee', EMPLOYEE_FIELDS);

      return res.json({ record: serializeAttendance(record) });
    }

    // Employee self-mark: own record only, Present/Absent only, pending until
    // an admin confirms it. Times, when present, are preserved.
    const targetId = String(req.user._id);
    if (employeeId && String(employeeId) !== targetId)
      return res.status(403).json({ message: 'You can only mark your own attendance' });
    if (!['Present', 'Absent'].includes(status))
      return res.status(400).json({ message: 'You can only mark Present or Absent' });
    if (date > todayKey())
      return res.status(400).json({ message: 'You cannot mark a future date' });

    const existing = await Attendance.findOne({ employee: req.user._id, date });
    if (existing && existing.approval === 'confirmed')
      return res.status(409).json({ message: 'This day is already confirmed. Ask your admin to change it.' });

    const keepTimes =
      status === 'Present'
        ? {
            checkIn: existing?.checkIn || '',
            checkOut: existing?.checkOut || '',
            dayType: existing?.dayType || '',
          }
        : { checkIn: '', checkOut: '', dayType: '' };

    const record = await Attendance.findOneAndUpdate(
      { employee: req.user._id, date },
      {
        $set: {
          status,
          note,
          ...keepTimes,
          source: 'self',
          approval: 'pending',
          markedBy: req.user._id,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).populate('employee', EMPLOYEE_FIELDS);

    res.json({ record: serializeAttendance(record) });
  } catch (e) {
    next(e);
  }
});

// Employee check-in for today. Creates a pending Present record.
router.post('/check-in', async (req, res, next) => {
  try {
    const date = todayKey();
    const existing = await Attendance.findOne({ employee: req.user._id, date });

    if (existing?.approval === 'confirmed')
      return res.status(409).json({ message: 'Today is already confirmed. Ask your admin to correct it.' });
    if (existing?.checkIn && existing.approval !== 'rejected')
      return res.status(409).json({ message: 'You have already checked in today.' });

    const checkIn = nowTime();
    const record = await Attendance.findOneAndUpdate(
      { employee: req.user._id, date },
      {
        $set: {
          status: 'Present',
          checkIn,
          checkOut: '',
          dayType: '',
          source: 'self',
          approval: 'pending',
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

// Employee check-out for today. Requires an open check-in.
router.post('/check-out', async (req, res, next) => {
  try {
    const date = todayKey();
    const existing = await Attendance.findOne({ employee: req.user._id, date });

    if (!existing) return res.status(400).json({ message: 'Check in first before checking out.' });
    if (existing.approval === 'confirmed')
      return res.status(409).json({ message: 'Today is already confirmed. Ask your admin to correct it.' });
    if (!existing.checkIn) return res.status(400).json({ message: 'Check in first before checking out.' });

    const checkOut = nowTime();
    const timeError = validateTimes(existing.checkIn, checkOut);
    if (timeError) return res.status(400).json({ message: timeError });

    const metrics = computeAttendanceMetrics({ status: 'Present', checkIn: existing.checkIn, checkOut, dayType: '' });

    const record = await Attendance.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          status: 'Present',
          checkOut,
          dayType: metrics.dayType,
          source: 'self',
          approval: 'pending',
        },
      },
      { new: true, runValidators: true }
    ).populate('employee', EMPLOYEE_FIELDS);

    res.json({ record: serializeAttendance(record), config: publicAttendanceConfig() });
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

// Admin confirms or rejects a self-marked attendance record.
router.patch('/:id/review', adminOnly, async (req, res, next) => {
  try {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ message: "action must be 'approve' or 'reject'" });

    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });

    record.approval = action === 'approve' ? 'confirmed' : 'rejected';
    record.editedBy = req.user._id;
    record.editedAt = new Date();
    await record.save();
    await record.populate('employee', EMPLOYEE_FIELDS);

    res.json({ record: serializeAttendance(record) });
  } catch (e) {
    next(e);
  }
});

function validDateOr400(value) {
  return isValidDate(value);
}

export default router;
