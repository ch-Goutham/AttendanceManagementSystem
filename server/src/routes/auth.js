import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ResetToken from '../models/ResetToken.js';
import { sendResetEmail } from '../utils/mailer.js';
import { protect } from '../middleware/auth.js';
const router = Router();

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

function makeToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
}
function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role,
    employeeCode: user.employeeCode, department: user.department };
}
// Whether the very first (bootstrap) admin still needs to be created.
// Public: it only reveals a boolean, never any account detail.
router.get('/registration-status', async (_req, res, next) => {
  try {
    res.json({ adminExists: Boolean(await User.exists({ role: 'admin' })) });
  } catch (e) { next(e); }
});

// Admin registration is open ONLY until the first admin exists (bootstrap).
// After that it is closed forever — additional admins are created by an
// existing admin via POST /api/employees (role: 'admin'). This is what stops
// an employee (or anyone) from signing up as an admin.
router.post('/register-admin', async (req, res, next) => {
  try {
    if (await User.exists({ role: 'admin' }))
      return res.status(403).json({ message: 'Registration is closed. Ask an administrator to create your account.' });
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ message: 'Name, email and password are required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    if (await User.exists({ email: email.toLowerCase().trim() })) return res.status(409).json({ message: 'Email already registered' });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role: 'admin' });
    res.status(201).json({ token: makeToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() }).select('+password');
    if (!user || !user.isActive || !(await bcrypt.compare(password || '', user.password)))
      return res.status(401).json({ message: 'Invalid email or password' });
    res.json({ token: makeToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});
router.get('/me', protect, (req, res) => res.json({ user: publicUser(req.user) }));

// Self-service forgot password — available to employees AND admins (both
// sign in with a password they may lose). Always returns a generic message
// so account existence is never revealed.
router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = req.body?.email?.toLowerCase().trim();
    const user = email
      ? await User.findOne({ email, isActive: true })
      : null;
    if (user) {
      await ResetToken.deleteMany({ user: user._id });
      const raw = crypto.randomBytes(32).toString('hex');
      await ResetToken.create({
        user: user._id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + RESET_TTL_MS)
      });
      const base = process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:5173';
      const resetUrl = `${base.replace(/\/$/, '')}/reset-password?token=${raw}&email=${encodeURIComponent(user.email)}`;
      await sendResetEmail({ to: user.email, name: user.name, resetUrl });
    }
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (e) { next(e); }
});

// Complete a self-service reset using the emailed token.
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const email = req.body?.email?.toLowerCase().trim();
    if (!password) return res.status(400).json({ message: 'A new password is required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    const user = email ? await User.findOne({ email, isActive: true }) : null;
    const record = user && token
      ? await ResetToken.findOne({ user: user._id, tokenHash: hashToken(token), expiresAt: { $gt: new Date() } })
      : null;
    if (!user || !record) return res.status(400).json({ message: 'Invalid or expired reset token' });
    user.password = await bcrypt.hash(password, 12);
    await user.save();
    await ResetToken.deleteMany({ user: user._id });
    res.json({ message: 'Password updated. You can now sign in.' });
  } catch (e) { next(e); }
});

export default router;
