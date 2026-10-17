import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import ResetToken from '../models/ResetToken.js';
import { protect, adminOnly } from '../middleware/auth.js';
const router = Router();
const shape = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, employeeCode: u.employeeCode, department: u.department, isActive: u.isActive });
const ROLES = ['employee', 'admin'];

router.use(protect, adminOnly);

// Admins may create employees OR additional admins (role defaults to employee).
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, employeeCode = '', department = '' } = req.body;
    const role = req.body.role || 'employee';
    if (!ROLES.includes(role)) return res.status(400).json({ message: "role must be 'employee' or 'admin'" });
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ message: 'Name, email and temporary password are required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    if (await User.exists({ email: email.toLowerCase().trim() })) return res.status(409).json({ message: 'Email already registered' });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role, employeeCode, department });
    res.status(201).json({ employee: shape(user) });
  } catch (e) { next(e); }
});

// Directory: employees and admins together, so created admins are visible.
router.get('/', async (_req, res, next) => {
  try { res.json({ employees: (await User.find({ role: { $in: ROLES } }).sort({ name: 1 })).map(shape) }); }
  catch (e) { next(e); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const isActive = Boolean(req.body.isActive);
    const user = await User.findOne({ _id: req.params.id, role: { $in: ROLES } });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    // Never let the signed-in admin lock themselves out of the workspace.
    if (String(user._id) === String(req.user._id) && !isActive)
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    user.isActive = isActive;
    await user.save();
    res.json({ employee: shape(user) });
  } catch (e) { next(e); }
});

// Admin resets any account's password (employee or fellow admin) to a new
// temporary one.
router.patch('/:id/password', async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'A new password is required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    const user = await User.findOne({ _id: req.params.id, role: { $in: ROLES } });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    user.password = await bcrypt.hash(password, 12);
    await user.save();
    res.json({ employee: shape(user), message: 'Password reset successfully' });
  } catch (e) { next(e); }
});
// Admin permanently deletes an employee account. This is a hard delete: the
// account and everything that references it (attendance, leave requests and
// password-reset tokens) are removed. Deactivate someone instead when their
// history should be kept.
router.delete('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Account not found' });
    // Never let the signed-in admin delete their own account.
    if (String(user._id) === String(req.user._id))
      return res.status(400).json({ message: 'You cannot delete your own account' });
    if (user.role !== 'employee')
      return res.status(400).json({ message: 'Only employee accounts can be deleted' });
    await Promise.all([
      Attendance.deleteMany({ employee: user._id }),
      Leave.deleteMany({ employee: user._id }),
      ResetToken.deleteMany({ user: user._id })
    ]);
    await user.deleteOne();
    res.json({ message: 'Employee account deleted' });
  } catch (e) { next(e); }
});

export default router;
