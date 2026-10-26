import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import ResetToken from '../models/ResetToken.js';
import { sendResetEmail } from '../utils/mailer.js';
import { PASSWORD_MIN_LENGTH, passwordError } from '../utils/password.js';
import { protect } from '../middleware/auth.js';
const router = Router();

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const googleClient = new OAuth2Client();

function makeToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
}
function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, phone: user.phone || '',
    role: user.role, employeeCode: user.employeeCode, department: user.department,
    position: user.position || '', location: user.location || 'Office',
    isActive: user.isActive !== false, createdAt: user.createdAt };
}
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function loginPortal(value) {
  return value === 'admin' || value === 'employee' ? value : '';
}
function portalMismatchMessage(role) {
  return role === 'admin'
    ? 'This is an admin account. Please use the admin login page.'
    : 'This is an employee account. Please use the employee login page.';
}
// Verifies a Google Identity Services ID token and returns its payload.
async function verifyGoogleCredential(credential) {
  if (!process.env.GOOGLE_CLIENT_ID)
    throw httpError(501, 'Google sign-in is not configured on the server.');
  if (!credential) throw httpError(400, 'A Google credential is required');
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    payload = ticket.getPayload();
  } catch {
    throw httpError(401, 'Google sign-in failed. Please try again.');
  }
  if (!payload?.email || !payload.email_verified)
    throw httpError(401, 'Your Google email address is not verified');
  return payload;
}

// Admin self-registration. The route is intentionally unlisted in the client,
// but open to anyone who knows it. Keep this page private and consider an
// invite code or disabling it after setup.
router.post('/register-admin', async (req, res, next) => {
  try {
    const { name, email, password, acceptTerms } = req.body;
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ message: 'Name, email and password are required' });
    if (acceptTerms !== true) return res.status(400).json({ message: 'You must agree to the Terms & Conditions' });
    const passwordIssue = passwordError(password);
    if (passwordIssue) return res.status(400).json({ message: passwordIssue });
    if (await User.exists({ email: email.toLowerCase().trim() })) return res.status(409).json({ message: 'Email already registered' });
    const user = await User.create({
      name: name.trim(),
      email,
      password: await bcrypt.hash(password, 12),
      role: 'admin'
    });
    res.status(201).json({ token: makeToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const portal = loginPortal(req.body?.portal);
    if (!portal) return res.status(400).json({ message: 'Choose the admin or employee login page.' });
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || password.length < PASSWORD_MIN_LENGTH)
      return res.status(401).json({ message: 'Invalid email or password' });
    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.isActive || !user.password || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ message: 'Invalid email or password' });
    if (user.role !== portal)
      return res.status(403).json({ message: portalMismatchMessage(user.role) });
    res.json({ token: makeToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

// Google sign-in for an existing account. Unknown emails are rejected so that
// a Google account alone can never grant access to the admin console.
router.post('/google/login', async (req, res, next) => {
  try {
    const portal = loginPortal(req.body?.portal);
    if (!portal) return res.status(400).json({ message: 'Choose the admin or employee login page.' });
    const payload = await verifyGoogleCredential(req.body?.credential);
    const user = await User.findOne({ email: payload.email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'No account found for this Google email.' });
    if (!user.isActive) return res.status(403).json({ message: 'This account has been deactivated' });
    if (user.role !== portal)
      return res.status(403).json({ message: portalMismatchMessage(user.role) });
    res.json({ token: makeToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

// Google sign-up creates an admin account once the Terms are accepted.
router.post('/google/register-admin', async (req, res, next) => {
  try {
    const { acceptTerms } = req.body;
    if (acceptTerms !== true) return res.status(400).json({ message: 'You must agree to the Terms & Conditions' });
    const payload = await verifyGoogleCredential(req.body?.credential);
    if (!payload.sub) throw httpError(401, 'Google sign-in failed. Please try again.');
    const email = payload.email.toLowerCase().trim();
    if (await User.exists({ email })) return res.status(409).json({ message: 'Email already registered. Log in instead.' });
    const user = await User.create({
      name: payload.name?.trim() || email.split('@')[0],
      email,
      googleId: payload.sub,
      role: 'admin'
    });
    res.status(201).json({ token: makeToken(user), user: publicUser(user) });
  } catch (e) { next(e); }
});

router.get('/me', protect, (req, res) => res.json({ user: publicUser(req.user) }));

// Self-service forgot password — available to employees AND admins (both
// sign in with a password they may lose, or a Google account that later needs
// a local password). Always returns a generic message so account existence is
// never revealed.
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
    const passwordIssue = passwordError(password);
    if (passwordIssue) return res.status(400).json({ message: passwordIssue });
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
