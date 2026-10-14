import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import User from '../models/User.js';
import { protect, adminOnly } from '../middleware/auth.js';
const router = Router();
router.use(protect);
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const monthFrom = s => /^\d{4}-\d{2}$/.test(s || '') ? s : new Date().toISOString().slice(0, 7);

router.get('/', async (req, res, next) => {
  try {
    const { month, employeeId } = req.query;
    const query = {};
    if (month) query.date = { $gte: `${monthFrom(month)}-01`, $lte: `${monthFrom(month)}-31` };
    if (req.user.role === 'employee') query.employee = req.user._id;
    else if (employeeId) query.employee = employeeId;
    const records = await Attendance.find(query).populate('employee', 'name email employeeCode department').sort({ date: -1 });
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
    const present = records.filter(r => r.status === 'Present').length;
    const absent = records.filter(r => r.status === 'Absent').length;
    const leave = records.filter(r => r.status === 'Leave').length;
    const denominator = present + absent;
    res.json({ month, present, absent, leave, totalMarked: records.length, attendancePercentage: denominator ? Math.round((present / denominator) * 10000) / 100 : 0 });
  } catch (e) { next(e); }
});

router.get('/calendar', async (req, res, next) => {
  try {
    const month = monthFrom(req.query.month);
    const query = { employee: req.user._id, date: { $gte: `${month}-01`, $lte: `${month}-31` } };
    if (req.user.role === 'admin' && req.query.employeeId) query.employee = req.query.employeeId;
    const records = await Attendance.find(query).select('date status note -_id');
    res.json({ month, records });
  } catch (e) { next(e); }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { employeeId, date, status, note = '' } = req.body;
    if (!employeeId || !validDate(date) || !['Present', 'Absent', 'Leave'].includes(status))
      return res.status(400).json({ message: 'Valid employeeId, date (YYYY-MM-DD), and status are required' });
    const employee = await User.findOne({ _id: employeeId, role: 'employee', isActive: true });
    if (!employee) return res.status(404).json({ message: 'Active employee not found' });
    const record = await Attendance.findOneAndUpdate(
      { employee: employeeId, date },
      { $set: { status, note, markedBy: req.user._id } },
      { new: true, upsert: true, runValidators: true }
    ).populate('employee', 'name email employeeCode department');
    res.json({ record });
  } catch (e) { next(e); }
});
export default router;
