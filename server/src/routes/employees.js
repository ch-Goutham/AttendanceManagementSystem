import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Permission from '../models/Permission.js';
import ResetToken from '../models/ResetToken.js';
import { passwordError } from '../utils/password.js';
import { protect, adminOnly } from '../middleware/auth.js';
const router = Router();
const shape = u => ({ id: u._id, name: u.name, email: u.email, phone: u.phone || '', role: u.role, employeeCode: u.employeeCode, department: u.department, isActive: u.isActive });

router.use(protect, adminOnly);

// Admins create employee accounts only.
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, phone = '', employeeCode = '', department = '' } = req.body;
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ message: 'Name, email and temporary password are required' });
    const passwordIssue = passwordError(password);
    if (passwordIssue) return res.status(400).json({ message: passwordIssue });
    if (await User.exists({ email: email.toLowerCase().trim() })) return res.status(409).json({ message: 'Email already registered' });
    const user = await User.create({ name, email, phone, password: await bcrypt.hash(password, 12), role: 'employee', employeeCode, department });
    res.status(201).json({ employee: shape(user) });
  } catch (e) { next(e); }
});

// Employee directory used by attendance, leave and report filters.
router.get('/', async (_req, res, next) => {
  try { res.json({ employees: (await User.find({ role: 'employee' }).sort({ name: 1 })).map(shape) }); }
  catch (e) { next(e); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const isActive = Boolean(req.body.isActive);
    const user = await User.findOne({ _id: req.params.id, role: 'employee' });
    if (!user) return res.status(404).json({ message: 'Employee account not found' });
    user.isActive = isActive;
    await user.save();
    res.json({ employee: shape(user) });
  } catch (e) { next(e); }
});

// Admin resets an employee's password to a new temporary one.
router.patch('/:id/password', async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'A new password is required' });
    const passwordIssue = passwordError(password);
    if (passwordIssue) return res.status(400).json({ message: passwordIssue });
    const user = await User.findOne({ _id: req.params.id, role: 'employee' });
    if (!user) return res.status(404).json({ message: 'Employee account not found' });
    user.password = await bcrypt.hash(password, 12);
    await user.save();
    res.json({ employee: shape(user), message: 'Password reset successfully' });
  } catch (e) { next(e); }
});

// Permanently delete an employee account and everything that references it.
router.delete('/:id', async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'employee' });
    if (!user) return res.status(404).json({ message: 'Employee account not found' });
    await Promise.all([
      Attendance.deleteMany({ employee: user._id }),
      Leave.deleteMany({ employee: user._id }),
      Permission.deleteMany({ employee: user._id }),
      ResetToken.deleteMany({ user: user._id })
    ]);
    await user.deleteOne();
    res.json({ message: 'Employee account deleted' });
  } catch (e) { next(e); }
});

export default router;
