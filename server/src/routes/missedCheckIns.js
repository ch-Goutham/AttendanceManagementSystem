import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import MissedCheckIn from '../models/MissedCheckIn.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { isValidDate, isValidLocation } from '../config/attendance.js';
import { attendanceSessions, todayKey, validateTimes } from '../utils/attendanceRules.js';
import { buildManualAttendance } from '../utils/manualAttendance.js';
import { missedCheckInShape } from '../utils/requestShapes.js';

const router = Router();
const EMPLOYEE_FIELDS = 'name email employeeCode department location';
const REQUEST_STATUSES = ['Pending', 'Approved', 'Rejected'];

const monthRange = (month) => ({ $gte: `${month}-01`, $lte: `${month}-31` });

router.use(protect);

// Employee reports a day they forgot to check in. The report is only a message
// to the admin; it never changes attendance by itself.
router.post('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'employee')
      return res.status(403).json({ message: 'Only employees can report a missed check-in' });

    const date = String(req.body?.date || '').trim();
    const reason = String(req.body?.reason || '').trim();
    if (!isValidDate(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    if (date > todayKey())
      return res.status(400).json({ message: 'You cannot report a missed check-in for a future date' });
    if (!reason) return res.status(400).json({ message: 'A reason is required' });

    const requestedCheckIn = String(req.body?.requestedCheckIn || '').trim();
    const requestedCheckOut = String(req.body?.requestedCheckOut || '').trim();
    if (Boolean(requestedCheckIn) !== Boolean(requestedCheckOut))
      return res.status(400).json({
        message: 'Enter both expected check-in and check-out times, or leave both blank'
      });
    const timeError = validateTimes(requestedCheckIn, requestedCheckOut);
    if (timeError) return res.status(400).json({ message: timeError });

    const location = String(req.body?.location || '').trim();
    if (location && !isValidLocation(location))
      return res.status(400).json({ message: 'location must be Office, Work from home or College' });

    const [duplicate, attendance] = await Promise.all([
      MissedCheckIn.findOne({
        employee: req.user._id,
        date,
        status: { $in: ['Pending', 'Approved'] }
      }).lean(),
      Attendance.findOne({ employee: req.user._id, date }).lean()
    ]);

    if (duplicate)
      return res.status(409).json({ message: 'You already reported a missed check-in for this date.' });

    if (attendance) {
      if (attendance.status === 'Leave')
        return res.status(409).json({
          message: 'This date is marked as leave. Ask your admin to correct it instead.'
        });
      const recordedSessions = attendanceSessions(attendance);
      if (
        attendance.status === 'Present' &&
        (recordedSessions.length || attendance.checkIn || attendance.checkOut)
      )
        return res.status(409).json({
          message: 'Attendance is already recorded for this date.'
        });
    }

    const report = await MissedCheckIn.create({
      employee: req.user._id,
      date,
      reason,
      requestedCheckIn,
      requestedCheckOut,
      location
    });
    await report.populate('employee', EMPLOYEE_FIELDS);

    res.status(201).json({ report: missedCheckInShape(report) });
  } catch (e) {
    next(e);
  }
});

// Employees see only their own reports; admins see all with optional filters.
router.get('/', async (req, res, next) => {
  try {
    const { employeeId, status, month, date } = req.query;
    const query = {};

    if (req.user.role === 'employee') query.employee = req.user._id;
    else if (employeeId) query.employee = employeeId;

    if (status) {
      if (!REQUEST_STATUSES.includes(status))
        return res.status(400).json({ message: 'Invalid status filter' });
      query.status = status;
    }

    if (date) {
      if (!isValidDate(date)) return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
      query.date = date;
    } else if (month) {
      if (!/^\d{4}-\d{2}$/.test(month))
        return res.status(400).json({ message: 'month must be YYYY-MM' });
      query.date = monthRange(month);
    }

    const reports = await MissedCheckIn.find(query)
      .populate('employee', EMPLOYEE_FIELDS)
      .populate('reviewedBy', 'name')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    res.json({ reports: reports.map(missedCheckInShape) });
  } catch (e) {
    next(e);
  }
});

// Admin approves or rejects a report. Approval writes the attendance record for
// the reported date and links it back to the request.
router.patch('/:id/review', adminOnly, async (req, res, next) => {
  try {
    const { action, note = '' } = req.body || {};
    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ message: "action must be 'approve' or 'reject'" });

    const report = await MissedCheckIn.findById(req.params.id).populate(
      'employee',
      EMPLOYEE_FIELDS
    );
    if (!report) return res.status(404).json({ message: 'Missed check-in report not found' });
    if (report.status !== 'Pending')
      return res.status(409).json({ message: 'This report has already been reviewed.' });

    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();
    report.reviewNote = String(note || '').trim();

    if (action === 'reject') {
      report.status = 'Rejected';
      await report.save();
      await report.populate('reviewedBy', 'name');
      return res.json({ report: missedCheckInShape(report) });
    }

    const employee = report.employee;
    if (!employee) return res.status(404).json({ message: 'Employee account not found' });

    const fallbackLocation =
      report.location || employee.location || 'Office';
    const providedLocation =
      req.body.location === undefined || req.body.location === null
        ? fallbackLocation
        : String(req.body.location).trim();
    const built = buildManualAttendance({
      status: 'Present',
      checkIn: req.body.checkIn,
      checkOut: req.body.checkOut,
      dayType: req.body.dayType,
      location: providedLocation,
      note:
        req.body.note !== undefined
          ? req.body.note
          : `Missed check-in: ${report.reason}`
    });
    if (built.error) return res.status(400).json({ message: built.error });

    const fields = built.fields;

    // A past day needs a complete pair so it does not stay flagged as an open
    // session that the employee can no longer close.
    if (report.date < todayKey() && (!fields.checkIn || !fields.checkOut))
      return res.status(400).json({
        message: 'For a past date, enter both check-in and check-out times'
      });

    let attendance = await Attendance.findOne({ employee: employee._id, date: report.date });

    if (attendance) {
      const recordedSessions = attendanceSessions(attendance);
      const hasRecordedTimes = Boolean(
        recordedSessions.length || attendance.checkIn || attendance.checkOut
      );

      if (attendance.status === 'Leave')
        return res.status(409).json({
          message: 'This date is marked as leave. Correct the attendance record instead.'
        });

      if (attendance.status === 'Present' && hasRecordedTimes) {
        // A retry after a partial failure may find the record it just wrote.
        // Reuse it only when it is the same admin and the same times.
        const sameAttempt =
          String(attendance.markedBy) === String(req.user._id) &&
          (attendance.checkIn || '') === fields.checkIn &&
          (attendance.checkOut || '') === fields.checkOut;
        if (!sameAttempt)
          return res.status(409).json({
            message: 'Attendance is already recorded for this date. Correct it from the Attendance table instead.'
          });
      } else {
        Object.assign(attendance, fields);
        attendance.markedBy = req.user._id;
        attendance.editedBy = req.user._id;
        attendance.editedAt = new Date();
        await attendance.save();
      }
    } else {
      attendance = await Attendance.create({
        employee: employee._id,
        date: report.date,
        ...fields,
        markedBy: req.user._id
      });
    }

    report.status = 'Approved';
    report.attendance = attendance._id;
    await report.save();
    await report.populate('reviewedBy', 'name');

    res.json({ report: missedCheckInShape(report) });
  } catch (e) {
    next(e);
  }
});

export default router;
