import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import { protect, adminOnly } from '../middleware/auth.js';
import {
  getAttendanceConfig,
  getCompanyTimeZone,
  isValidDate,
  isValidLocation,
  publicAttendanceConfig
} from '../config/attendance.js';
import {
  attendanceSessions,
  computeAttendanceMetrics,
  nowTime,
  serializeAttendance,
  todayKey,
  validateTimes
} from '../utils/attendanceRules.js';

const router = Router();
const EMPLOYEE_FIELDS = 'name email employeeCode department location';
const DAY_TYPES = ['Full day', 'Half day', ''];
const STATUSES = ['Present', 'Absent', 'Leave'];
const MAX_SESSIONS_PER_DAY = 20;

const monthRange = (month) => ({ $gte: `${month}-01`, $lte: `${month}-31` });

// How far back an unfinished check-in is still considered "open". This covers a
// night shift that checks out after midnight and an employee who forgot to
// check out before the date rolled over, without reviving weeks-old rows.
const OPEN_CHECKOUT_WINDOW_MS = 20 * 60 * 60 * 1000;

function sessionIsOpen(session) {
  return Boolean(session) && !session.checkOut && !session.checkOutAt;
}

function lastSession(record) {
  const sessions = attendanceSessions(record);
  return sessions[sessions.length - 1] || null;
}

function recordIsOpen(record) {
  if (!record) return false;
  if (record.openSession === true) return true;
  return sessionIsOpen(lastSession(record));
}

function findOpenRecord(employeeId, now = new Date()) {
  const since = new Date(now.getTime() - OPEN_CHECKOUT_WINDOW_MS);
  return Attendance.findOne({
    employee: employeeId,
    date: { $lt: todayKey(now), $gte: todayKey(since) },
    status: 'Present',
    $or: [
      { openSession: true },
      // Legacy rows have no sessions array and only the top-level pair.
      {
        sessions: { $exists: false },
        checkIn: { $nin: ['', null] },
        checkOut: { $in: ['', null] }
      },
      {
        sessions: { $size: 0 },
        checkIn: { $nin: ['', null] },
        checkOut: { $in: ['', null] }
      }
    ]
  }).sort({ date: -1 });
}

function normalizeDayType(value) {
  if (value === undefined || value === null) return '';
  return DAY_TYPES.includes(value) ? value : undefined;
}

/** The employee's explicit choice wins; otherwise use their profile default. */
function resolveLocation(requested, fallback) {
  const value = String(requested || '').trim();
  if (isValidLocation(value)) return value;
  const profile = String(fallback || '').trim();
  return isValidLocation(profile) ? profile : 'Office';
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
    if (!record || !attendanceSessions(record).length) {
      const carried = await findOpenRecord(req.user._id);
      if (carried) openRecord = serializeAttendance(carried);
    }

    res.json({
      date,
      record: record ? serializeAttendance(record) : null,
      openRecord,
      config: publicAttendanceConfig()
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

    // lean() avoids hydrating one Mongoose document per attendance row; these
    // responses are read-only and can be large on a team month view.
    const records = await Attendance.find(query)
      .populate('employee', EMPLOYEE_FIELDS)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const config = getAttendanceConfig();
    res.json({
      records: records.map((record) => serializeAttendance(record, config)),
      timeZone: getCompanyTimeZone()
    });
  } catch (e) {
    next(e);
  }
});

// Employee check-in. A day can contain several sessions: after checking out,
// the employee may start another session once the configured cooldown passes.
router.post('/check-in', async (req, res, next) => {
  try {
    if (req.user.role !== 'employee')
      return res.status(403).json({ message: 'Only employees can check in' });

    const requestedLocation = req.body?.location;
    if (
      requestedLocation !== undefined &&
      String(requestedLocation).trim() &&
      !isValidLocation(requestedLocation)
    ) {
      return res.status(400).json({ message: 'location must be Office, Work from home or College' });
    }
    const location = resolveLocation(requestedLocation, req.user.location);

    const now = new Date();
    const date = todayKey(now);
    const config = getAttendanceConfig();
    const existing = await Attendance.findOne({ employee: req.user._id, date });

    if (existing?.status === 'Leave')
      return res.status(409).json({ message: 'You are marked on leave today. Ask your admin to correct it.' });
    if (existing?.status === 'Absent')
      return res.status(409).json({ message: 'You are marked absent today. Ask your admin to correct it.' });
    if (recordIsOpen(existing))
      return res.status(409).json({ message: 'You are already checked in. Check out before starting a new session.' });

    const openRecord = await findOpenRecord(req.user._id, now);
    if (openRecord)
      return res.status(409).json({
        message: `You still have an open check-in from ${openRecord.date}. Check out first before starting a new day.`
      });

    if (existing) {
      const sessions = attendanceSessions(existing);
      if (sessions.length >= MAX_SESSIONS_PER_DAY)
        return res.status(409).json({ message: 'Too many check-ins for today. Ask your admin to correct the record.' });

      const last = sessions[sessions.length - 1];
      const lastOutAt = last?.checkOutAt ? new Date(last.checkOutAt) : null;
      const cooldownMs = config.recheckInCooldownMinutes * 60000;
      if (lastOutAt && cooldownMs > 0) {
        const readyAt = new Date(lastOutAt.getTime() + cooldownMs);
        if (now < readyAt) {
          const retryAfterSeconds = Math.ceil((readyAt.getTime() - now.getTime()) / 1000);
          return res.status(409).json({
            message: `Please wait ${retryAfterSeconds}s before checking in again.`,
            retryAfterSeconds,
            nextCheckInAt: readyAt.toISOString()
          });
        }
      }
    }

    const checkIn = nowTime(now);
    const session = { checkIn, checkInAt: now, checkOut: '', checkOutAt: null };
    const lateReason = String(req.body?.lateReason || '').trim();

    let record;
    if (!existing) {
      try {
        record = await Attendance.create({
          employee: req.user._id,
          date,
          status: 'Present',
          checkIn,
          checkInAt: now,
          checkOut: '',
          checkOutAt: null,
          sessions: [session],
          openSession: true,
          location,
          lateReason,
          dayType: '',
          source: 'self',
          approval: 'confirmed',
          markedBy: req.user._id
        });
      } catch (error) {
        if (error?.code === 11000)
          return res.status(409).json({ message: 'You have already checked in today.' });
        throw error;
      }
    } else {
      // The $expr guard makes the push conditional on the sessions array being
      // unchanged since it was read, so two simultaneous check-ins cannot both
      // create a session.
      const expectedSessions = Array.isArray(existing.sessions) ? existing.sessions.length : 0;
      const update = {
        $push: { sessions: session },
        $set: {
          status: 'Present',
          employee: req.user._id,
          date,
          checkIn: existing.checkIn || checkIn,
          checkInAt: existing.checkInAt || now,
          checkOut: '',
          checkOutAt: null,
          openSession: true,
          location,
          dayType: '',
          source: 'self',
          approval: 'confirmed',
          markedBy: req.user._id
        }
      };
      if (lateReason) update.$set.lateReason = lateReason;

      record = await Attendance.findOneAndUpdate(
        {
          _id: existing._id,
          openSession: { $ne: true },
          $expr: { $eq: [{ $size: { $ifNull: ['$sessions', []] } }, expectedSessions] }
        },
        update,
        { new: true, runValidators: true }
      );
      if (!record)
        return res.status(409).json({ message: 'You are already checked in. Refresh and try again.' });
    }

    await record.populate('employee', EMPLOYEE_FIELDS);
    res.json({ record: serializeAttendance(record), config: publicAttendanceConfig() });
  } catch (e) {
    next(e);
  }
});

// Employee check-out. Closes the newest open session and recalculates the total
// worked time across every session in the day.
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
    if (!recordIsOpen(existing)) {
      const carried = await findOpenRecord(req.user._id, now);
      if (carried && String(carried._id) !== String(existing?._id || '')) {
        existing = carried;
        carriedOver = true;
      }
    }

    if (!existing || !recordIsOpen(existing))
      return res.status(400).json({ message: 'Check in first before checking out.' });

    const sessions = attendanceSessions(existing);
    const last = sessions[sessions.length - 1];
    const checkOut = nowTime(now);
    // Comparing HH:mm only makes sense within one calendar day; a carried-over
    // night shift is measured from the exact timestamps instead.
    if (!carriedOver) {
      const timeError = validateTimes(last?.checkIn, checkOut);
      if (timeError) return res.status(400).json({ message: timeError });
    }

    if (Array.isArray(existing.sessions) && existing.sessions.length) {
      const session = existing.sessions[existing.sessions.length - 1];
      session.checkOut = checkOut;
      session.checkOutAt = now;
    } else {
      existing.sessions = [
        {
          checkIn: existing.checkIn,
          checkInAt: existing.checkInAt,
          checkOut,
          checkOutAt: now
        }
      ];
    }

    existing.status = 'Present';
    existing.checkOut = checkOut;
    existing.checkOutAt = now;
    existing.openSession = false;
    existing.source = 'self';
    existing.approval = 'confirmed';

    const metrics = computeAttendanceMetrics(existing.toObject(), getAttendanceConfig());
    existing.dayType = metrics.dayType;

    await existing.save();
    await existing.populate('employee', EMPLOYEE_FIELDS);

    res.json({
      record: serializeAttendance(existing),
      config: publicAttendanceConfig(),
      carriedOver
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

    const metrics = computeAttendanceMetrics(record.toObject());
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

// Admin correction of any record. Supplying check-in/check-out collapses the
// day to a single session pair; leaving the times alone preserves the existing
// session history (for example when only the note or location is corrected).
router.patch('/:id', adminOnly, async (req, res, next) => {
  try {
    const record = await Attendance.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });

    const status = req.body.status ?? record.status;
    if (!STATUSES.includes(status))
      return res.status(400).json({ message: 'status must be Present, Absent or Leave' });

    const providedDayType = normalizeDayType(req.body.dayType);
    if (providedDayType === undefined) return res.status(400).json({ message: 'Invalid dayType' });

    let location = record.location || '';
    if (req.body.location !== undefined) {
      const requested = String(req.body.location || '').trim();
      if (requested && !isValidLocation(requested))
        return res.status(400).json({ message: 'location must be Office, Work from home or College' });
      location = requested;
    }

    // Only an actual time correction collapses the session history. The admin
    // form also sends the unchanged values, so comparing with the record keeps
    // a note or location edit from deleting today's earlier sessions.
    const timesTouched =
      (req.body.checkIn !== undefined && (req.body.checkIn || '') !== (record.checkIn || '')) ||
      (req.body.checkOut !== undefined && (req.body.checkOut || '') !== (record.checkOut || ''));
    let checkIn =
      req.body.checkIn !== undefined ? req.body.checkIn || '' : record.checkIn || '';
    let checkOut =
      req.body.checkOut !== undefined ? req.body.checkOut || '' : record.checkOut || '';
    let dayType = providedDayType;

    if (status !== 'Present') {
      checkIn = '';
      checkOut = '';
      dayType = '';
      record.sessions = [];
      record.openSession = false;
      record.checkInAt = null;
      record.checkOutAt = null;
    } else if (timesTouched) {
      const timeError = validateTimes(checkIn, checkOut);
      if (timeError) return res.status(400).json({ message: timeError });

      const metrics = computeAttendanceMetrics({ status, checkIn, checkOut, dayType });
      dayType = dayType || metrics.dayType;
      record.sessions =
        checkIn || checkOut
          ? [{ checkIn, checkOut, checkInAt: null, checkOutAt: null }]
          : [];
      record.openSession = Boolean(checkIn && !checkOut);
      record.checkInAt = null;
      record.checkOutAt = null;
      // The first value wins when the admin supplies only one of the two times.
      const first = attendanceSessions({ sessions: record.sessions })[0];
      const last = attendanceSessions({ sessions: record.sessions }).slice(-1)[0];
      checkIn = first?.checkIn || '';
      checkOut = last?.checkOut || '';
    } else {
      const metrics = computeAttendanceMetrics(record.toObject());
      dayType = dayType || record.dayType || metrics.dayType;
    }

    record.status = status;
    record.checkIn = checkIn;
    record.checkOut = checkOut;
    record.dayType = dayType;
    record.location = location;
    if (req.body.note !== undefined) record.note = req.body.note;
    if (req.body.lateReason !== undefined)
      record.lateReason = String(req.body.lateReason || '').trim();
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
