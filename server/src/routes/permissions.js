import { Router } from 'express';
import Permission from '../models/Permission.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { isValidDate, isValidTime } from '../config/attendance.js';
import { toMinutes } from '../utils/attendanceRules.js';
import { permissionShape } from '../utils/requestShapes.js';

const router = Router();
const EMPLOYEE_FIELDS = 'name email employeeCode department';

const monthRange = (month) => ({ $gte: `${month}-01`, $lte: `${month}-31` });

router.use(protect);

// Employee requests a permission window for one day.
router.post('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'employee')
      return res.status(403).json({ message: 'Only employees can request permission' });

    const { date, startTime, endTime, reason } = req.body;
    if (!isValidDate(date))
      return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    if (!isValidTime(startTime) || !isValidTime(endTime))
      return res.status(400).json({ message: 'startTime and endTime must be HH:mm (24-hour)' });
    if (!reason?.trim())
      return res.status(400).json({ message: 'A reason is required' });

    const durationMinutes = toMinutes(endTime) - toMinutes(startTime);
    if (durationMinutes <= 0)
      return res.status(400).json({ message: 'End time must be later than start time' });

    // String comparison works because both values are zero-padded HH:mm.
    const clash = await Permission.findOne({
      employee: req.user._id,
      date,
      status: { $in: ['Pending', 'Approved'] },
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    });
    if (clash)
      return res.status(409).json({
        message: 'You already have a permission request covering that time.',
      });

    const permission = await Permission.create({
      employee: req.user._id,
      date,
      startTime,
      endTime,
      durationMinutes,
      reason: reason.trim(),
    });

    res.status(201).json({ permission: permissionShape(permission) });
  } catch (e) {
    next(e);
  }
});

// Employees see their own requests; admins see everyone, with optional filters.
router.get('/', async (req, res, next) => {
  try {
    const { employeeId, status, month, date } = req.query;
    const query = {};

    if (req.user.role === 'employee') query.employee = req.user._id;
    else if (employeeId) query.employee = employeeId;

    if (status) {
      if (!['Pending', 'Approved', 'Rejected'].includes(status))
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

    const permissions = await Permission.find(query)
      .populate('employee', EMPLOYEE_FIELDS)
      .populate('reviewedBy', 'name')
      .sort({ date: -1, startTime: -1, createdAt: -1 });

    res.json({ permissions: permissions.map(permissionShape) });
  } catch (e) {
    next(e);
  }
});

// Admin approves or rejects a request.
router.patch('/:id/review', adminOnly, async (req, res, next) => {
  try {
    const { action, note = '' } = req.body;
    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ message: "action must be 'approve' or 'reject'" });

    const permission = await Permission.findById(req.params.id).populate(
      'employee',
      EMPLOYEE_FIELDS
    );
    if (!permission) return res.status(404).json({ message: 'Permission request not found' });

    permission.status = action === 'approve' ? 'Approved' : 'Rejected';
    permission.reviewedBy = req.user._id;
    permission.reviewedAt = new Date();
    permission.reviewNote = note?.trim() || '';
    await permission.save();
    await permission.populate('reviewedBy', 'name');

    res.json({ permission: permissionShape(permission) });
  } catch (e) {
    next(e);
  }
});

export default router;
