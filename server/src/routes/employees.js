import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { protect, adminOnly } from '../middleware/auth.js';
const router = Router();
const shape = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, employeeCode: u.employeeCode, department: u.department, isActive: u.isActive });

router.use(protect, adminOnly);
router.post('/', async (req, res, next) => {
  try {
    const { name, email, password, employeeCode = '', department = '' } = req.body;
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ message: 'Name, email and temporary password are required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    if (await User.exists({ email: email.toLowerCase().trim() })) return res.status(409).json({ message: 'Email already registered' });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role: 'employee', employeeCode, department });
    res.status(201).json({ employee: shape(user) });
  } catch (e) { next(e); }
});
router.get('/', async (_req, res, next) => {
  try { res.json({ employees: (await User.find({ role: 'employee' }).sort({ name: 1 })).map(shape) }); }
  catch (e) { next(e); }
});
router.patch('/:id/status', async (req, res, next) => {
  try {
    const user = await User.findOneAndUpdate({ _id: req.params.id, role: 'employee' }, { isActive: Boolean(req.body.isActive) }, { new: true });
    if (!user) return res.status(404).json({ message: 'Employee not found' });
    res.json({ employee: shape(user) });
  } catch (e) { next(e); }
});
export default router;
