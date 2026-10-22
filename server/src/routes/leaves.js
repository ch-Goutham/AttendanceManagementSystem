import { Router } from 'express';
import Leave from '../models/Leave.js';
import Attendance from '../models/Attendance.js';
import { protect, adminOnly } from '../middleware/auth.js';
const router = Router();

const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

const shape = l => ({
  id: l._id,
  startDate: l.startDate,
  endDate: l.endDate,
  reason: l.reason,
  status: l.status,
  reviewNote: l.reviewNote,
  reviewedAt: l.reviewedAt,
  reviewer: l.reviewedBy && l.reviewedBy.name
    ? { id: String(l.reviewedBy._id), name: l.reviewedBy.name }
    : null,
  createdAt: l.createdAt,
  employee: l.employee
    ? { id: l.employee._id, name: l.employee.name, email: l.employee.email, employeeCode: l.employee.employeeCode, department: l.employee.department }
    : null
});

// Expand an inclusive YYYY-MM-DD range into each date, one day at a time (UTC, no drift).
function eachDate(start, end) {
  const out = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last && out.length < 400) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

router.use(protect);

// Employee applies for leave for themselves.
router.post('/', async (req, res, next) => {
  try {
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
      reason: reason.trim()
    });
    res.status(201).json({ leave: shape(leave) });
  } catch (e) { next(e); }
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
    res.json({ leaves: leaves.map(shape) });
  } catch (e) { next(e); }
});

// Employee withdraws their own pending request.
router.delete('/:id', async (req, res, next) => {
  try {
    const query = { _id: req.params.id };
    if (req.user.role === 'employee') {
      query.employee = req.user._id;
      query.status = 'Pending';
    }
    const leave = await Leave.findOneAndDelete(query);
    if (!leave) return res.status(404).json({ message: 'Leave request not found' });
    res.json({ message: 'Leave request withdrawn' });
  } catch (e) { next(e); }
});

// Admin approves or rejects. Approving writes Leave into attendance for every date in range.
router.patch('/:id/review', adminOnly, async (req, res, next) => {
  try {
    const { action, note = '' } = req.body;
    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
    const leave = await Leave.findById(req.params.id).populate('employee', 'name email employeeCode department');
    if (!leave) return res.status(404).json({ message: 'Leave request not found' });
    leave.status = action === 'approve' ? 'Approved' : 'Rejected';
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    leave.reviewNote = note?.trim() || '';
    if (leave.status === 'Approved' && leave.employee) {
      for (const date of eachDate(leave.startDate, leave.endDate)) {
        await Attendance.findOneAndUpdate(
          { employee: leave.employee._id, date },
          { $set: { status: 'Leave', note: `Leave: ${leave.reason}`, checkIn: '', checkOut: '', dayType: '', source: 'admin', approval: 'confirmed', markedBy: req.user._id } },
          { new: true, upsert: true, runValidators: true }
        );
      }
    }
    await leave.save();
    await leave.populate('reviewedBy', 'name');
    res.json({ leave: shape(leave) });
  } catch (e) { next(e); }
});

export default router;
