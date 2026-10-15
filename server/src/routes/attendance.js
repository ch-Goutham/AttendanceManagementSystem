import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { protect, adminOnly } from '../middleware/auth.js';
const router = Router();
router.use(protect);
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const monthFrom = s => /^\d{4}-\d{2}$/.test(s || '') ? s : new Date().toISOString().slice(0, 7);
const EMPLOYEE_FIELDS = 'name email employeeCode department';

router.get('/', async (req, res, next) => {
  try {
    const { month, employeeId, approval } = req.query;
    const query = {};
    if (month) query.date = { $gte: `${monthFrom(month)}-01`, $lte: `${monthFrom(month)}-31` };
    if (approval) query.approval = approval;
    if (req.user.role === 'employee') query.employee = req.user._id;
    else if (employeeId) query.employee = employeeId;
    const records = await Attendance.find(query).populate('employee', EMPLOYEE_FIELDS).sort({ date: -1 });
    res.json({ records });
  } catch (e) { next(e); }
});

router.get('/summary', async (req, res, next) => {
  try {
    const month = monthFrom(req.query.month);
    const query = { date: { $gte: `${month}-01`, $lte: `${month}-31` } };
    if (req.user.role === 'employee') query.employee = req.user._id;
    else if (req.query.employeeId) query.employee = req.query.employeeId;
    const records = await Attendance.find(query);
    // Only admin-confirmed records count toward the official figures.
    const confirmed = records.filter(r => r.approval === 'confirmed');
    const present = confirmed.filter(r => r.status === 'Present').length;
    const absent = confirmed.filter(r => r.status === 'Absent').length;
    const leave = confirmed.filter(r => r.status === 'Leave').length;
    const pending = records.filter(r => r.approval === 'pending').length;
    const rejected = records.filter(r => r.approval === 'rejected').length;
    const denominator = present + absent;
    res.json({
      month, present, absent, leave, pending, rejected,
      totalMarked: records.length,
      attendancePercentage: denominator ? Math.round((present / denominator) * 10000) / 100 : 0
    });
  } catch (e) { next(e); }
});

router.get('/calendar', async (req, res, next) => {
  try {
    const month = monthFrom(req.query.month);
    const query = { employee: req.user._id, date: { $gte: `${month}-01`, $lte: `${month}-31` } };
    if (req.user.role === 'admin' && req.query.employeeId) query.employee = req.query.employeeId;
    const records = await Attendance.find(query).select('date status note approval -_id');
    res.json({ month, records });
  } catch (e) { next(e); }
});

// Admin-only queue of self-marks awaiting confirmation.
router.get('/pending', adminOnly, async (req, res, next) => {
  try {
    const query = { approval: 'pending' };
    if (req.query.month) query.date = { $gte: `${monthFrom(req.query.month)}-01`, $lte: `${monthFrom(req.query.month)}-31` };
    const records = await Attendance.find(query).populate('employee', EMPLOYEE_FIELDS).sort({ date: -1 });
    res.json({ records });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { employeeId, date, status, note = '' } = req.body;
    const isAdmin = req.user.role === 'admin';

    if (isAdmin) {
      // Admin marks anyone, including Leave, and it is confirmed immediately.
      if (!employeeId || !validDate(date) || !['Present', 'Absent', 'Leave'].includes(status))
        return res.status(400).json({ message: 'Valid employeeId, date (YYYY-MM-DD), and status are required' });
      const employee = await User.findOne({ _id: employeeId, role: 'employee', isActive: true });
      if (!employee) return res.status(404).json({ message: 'Active employee not found' });
      const record = await Attendance.findOneAndUpdate(
        { employee: employeeId, date },
        { $set: { status, note, source: 'admin', approval: 'confirmed', markedBy: req.user._id } },
        { new: true, upsert: true, runValidators: true }
      ).populate('employee', EMPLOYEE_FIELDS);
      return res.json({ record });
    }

    // Employee self-mark: only their own record, only Present/Absent, and it
    // starts as pending until an admin confirms it.
    const targetId = String(req.user._id);
    if (employeeId && String(employeeId) !== targetId)
      return res.status(403).json({ message: 'You can only mark your own attendance' });
    if (!validDate(date) || !['Present', 'Absent'].includes(status))
      return res.status(400).json({ message: 'Valid date (YYYY-MM-DD) and status Present or Absent are required' });

    const existing = await Attendance.findOne({ employee: req.user._id, date });
    if (existing && existing.approval === 'confirmed')
      return res.status(409).json({ message: 'This day is already confirmed. Ask your admin to change it.' });

    const record = await Attendance.findOneAndUpdate(
      { employee: req.user._id, date },
      { $set: { status, note, source: 'self', approval: 'pending', markedBy: req.user._id } },
      { new: true, upsert: true, runValidators: true }
    ).populate('employee', EMPLOYEE_FIELDS);
    res.json({ record });
  } catch (e) { next(e); }
});

// Admin confirms or rejects a self-marked attendance record.
router.patch('/:id/review', adminOnly, async (req, res, next) => {
  try {
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ message: "action must be 'approve' or 'reject'" });
    const record = await Attendance.findByIdAndUpdate(
      req.params.id,
      { $set: { approval: action === 'approve' ? 'confirmed' : 'rejected' } },
      { new: true }
    ).populate('employee', EMPLOYEE_FIELDS);
    if (!record) return res.status(404).json({ message: 'Attendance record not found' });
    res.json({ record });
  } catch (e) { next(e); }
});

export default router;
