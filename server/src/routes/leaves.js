import { Router } from 'express';
import Leave from '../models/Leave.js';
import Attendance from '../models/Attendance.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { eachDate, leaveShape } from '../utils/requestShapes.js';

const router = Router();

const validDate = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

router.use(protect);

// Employee applies for leave for themselves.
router.post('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'employee')
      return res.status(403).json({ message: 'Only employees can apply for leave' });

    const { startDate, endDate, reason } = req.body;
    if (!validDate(startDate) || !validDate(endDate))
      return res.status(400).json({ message: 'Valid startDate and endDate (YYYY-MM-DD) are required' });
    if (endDate < startDate)
      return res.status(400).json({ message: 'endDate must be on or after startDate' });
    if (!reason?.trim())
      return res.status(400).json({ message: 'A reason is required' });
    const leave = await Leave.create({
      employee: req.user._id,
      startDate,
      endDate,
      reason: reason.trim(),
    });
    res.status(201).json({ leave: leaveShape(leave) });
  } catch (e) {
    next(e);
  }
});

// Employee sees only their own requests; admin sees all (optionally filtered).
router.get('/', async (req, res, next) => {
  try {
    const query = {};
    if (req.user.role === 'employee') query.employee = req.user._id;
    else if (req.query.employeeId) query.employee = req.query.employeeId;
    if (req.query.status) query.status = req.query.status;
    const leaves = await Leave.find(query)
      .populate('employee', 'name email employeeCode department')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ leaves: leaves.map(leaveShape) });
  } catch (e) {
    next(e);
  }
});

// Admin approves or rejects. Approving writes Leave into attendance for every date in range.
router.patch('/:id/review', adminOnly, async (req, res, next) => {
  try {
    const { action, note = '' } = req.body;
    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
    const leave = await Leave.findById(req.params.id).populate(
      'employee',
      'name email employeeCode department'
    );
    if (!leave) return res.status(404).json({ message: 'Leave request not found' });
    leave.status = action === 'approve' ? 'Approved' : 'Rejected';
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    leave.reviewNote = note?.trim() || '';
    if (leave.status === 'Approved' && leave.employee) {
      for (const date of eachDate(leave.startDate, leave.endDate)) {
        await Attendance.findOneAndUpdate(
          { employee: leave.employee._id, date },
          {
            $set: {
              status: 'Leave',
              note: `Leave: ${leave.reason}`,
              checkIn: '',
              checkOut: '',
              checkInAt: null,
              checkOutAt: null,
              lateReason: '',
              dayType: '',
              source: 'admin',
              approval: 'confirmed',
              markedBy: req.user._id,
            },
          },
          { new: true, upsert: true, runValidators: true }
        );
      }
    }
    await leave.save();
    await leave.populate('reviewedBy', 'name');
    res.json({ leave: leaveShape(leave) });
  } catch (e) {
    next(e);
  }
});

export default router;
