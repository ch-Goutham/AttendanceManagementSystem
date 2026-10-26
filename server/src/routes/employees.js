import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Leave from '../models/Leave.js';
import Permission from '../models/Permission.js';
import ResetToken from '../models/ResetToken.js';
import { passwordError } from '../utils/password.js';
import { isValidLocation } from '../config/attendance.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = Router();

const shape = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone || '',
  role: u.role,
  employeeCode: u.employeeCode,
  department: u.department,
  position: u.position || '',
  location: u.location || 'Office',
  isActive: u.isActive,
  createdAt: u.createdAt
});

function requestedLocation(value, fallback = 'Office') {
  const location = String(value || '').trim();
  if (!location) return fallback;
  return isValidLocation(location) ? location : null;
}

router.use(protect, adminOnly);

// Admins create employee accounts only.
router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      phone = '',
      employeeCode = '',
      department = '',
      position = '',
      location = 'Office'
    } = req.body;
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ message: 'Name, email and temporary password are required' });
    const passwordIssue = passwordError(password);
    if (passwordIssue) return res.status(400).json({ message: passwordIssue });
    const resolvedLocation = requestedLocation(location);
    if (!resolvedLocation)
      return res.status(400).json({ message: 'location must be Office, Work from home or College' });
    if (await User.exists({ email: email.toLowerCase().trim() }))
      return res.status(409).json({ message: 'Email already registered' });

    const user = await User.create({
      name,
      email,
      phone,
      password: await bcrypt.hash(password, 12),
      role: 'employee',
      employeeCode,
      department,
      position,
      location: resolvedLocation
    });
    res.status(201).json({ employee: shape(user) });
  } catch (e) {
    next(e);
  }
});

// Employee directory used by attendance, leave and report filters.
router.get('/', async (_req, res, next) => {
  try {
    const employees = await User.find({ role: 'employee' })
      .select('name email phone role employeeCode department position location isActive createdAt')
      .sort({ name: 1 })
      .lean();
    res.json({ employees: employees.map(shape) });
  } catch (e) {
    next(e);
  }
});

// Inline location edit from the Employees table.
router.patch('/:id/location', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid employee id' });
    const location = requestedLocation(req.body.location, '');
    if (!location)
      return res.status(400).json({ message: 'location must be Office, Work from home or College' });

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'employee' },
      { $set: { location } },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ message: 'Employee account not found' });
    res.json({ employee: shape(user) });
  } catch (e) {
    next(e);
  }
});

// Admin edits an employee's profile details. Password and access status keep
// their own dedicated routes below.
router.patch('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid employee id' });

    const user = await User.findOne({ _id: req.params.id, role: 'employee' });
    if (!user) return res.status(404).json({ message: 'Employee account not found' });

    const name = req.body.name !== undefined ? String(req.body.name).trim() : user.name;
    const email =
      req.body.email !== undefined ? String(req.body.email).toLowerCase().trim() : user.email;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    if (!email) return res.status(400).json({ message: 'Email is required' });

    if (email !== user.email) {
      const emailTaken = await User.exists({ email, _id: { $ne: user._id } });
      if (emailTaken) return res.status(409).json({ message: 'Email already registered' });
    }

    const location =
      req.body.location !== undefined
        ? requestedLocation(req.body.location, '')
        : user.location || 'Office';
    if (!location)
      return res.status(400).json({ message: 'location must be Office, Work from home or College' });

    user.name = name;
    user.email = email;
    if (req.body.phone !== undefined) user.phone = String(req.body.phone || '').trim();
    if (req.body.employeeCode !== undefined)
      user.employeeCode = String(req.body.employeeCode || '').trim();
    if (req.body.department !== undefined)
      user.department = String(req.body.department || '').trim();
    if (req.body.position !== undefined)
      user.position = String(req.body.position || '').trim();
    user.location = location;
    await user.save();

    res.json({ employee: shape(user) });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: 'Email already registered' });
    next(e);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid employee id' });
    const isActive = Boolean(req.body.isActive);
    const user = await User.findOne({ _id: req.params.id, role: 'employee' });
    if (!user) return res.status(404).json({ message: 'Employee account not found' });
    user.isActive = isActive;
    await user.save();
    res.json({ employee: shape(user) });
  } catch (e) {
    next(e);
  }
});

// Admin resets an employee's password to a new temporary one.
router.patch('/:id/password', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid employee id' });
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'A new password is required' });
    const passwordIssue = passwordError(password);
    if (passwordIssue) return res.status(400).json({ message: passwordIssue });
    const user = await User.findOne({ _id: req.params.id, role: 'employee' });
    if (!user) return res.status(404).json({ message: 'Employee account not found' });
    user.password = await bcrypt.hash(password, 12);
    await user.save();
    res.json({ employee: shape(user), message: 'Password reset successfully' });
  } catch (e) {
    next(e);
  }
});

// Permanently delete an employee account and everything that references it.
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: 'Invalid employee id' });
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
  } catch (e) {
    next(e);
  }
});

export default router;
