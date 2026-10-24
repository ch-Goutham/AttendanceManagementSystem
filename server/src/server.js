import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import employeeRoutes from './routes/employees.js';
import attendanceRoutes from './routes/attendance.js';
import leaveRoutes from './routes/leaves.js';
import permissionRoutes from './routes/permissions.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';

dotenv.config();

const app = express();

// JSON payloads (monthly attendance lists, reports) get much larger than the
// Mongoose documents because employee fields repeat on every row. gzip keeps
// those responses small over the network.
app.use(compression());

// API responses must not be cached. Without this, Express's ETag support lets
// browsers revalidate a request and receive an empty 304, which Axios treats as
// an error even though the backend is healthy.
app.set('etag', false);
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  exposedHeaders: ['Content-Disposition'],
  // Authorization is a non-simple header, so the browser preflights every
  // cross-origin API call. Cache the preflight for a day instead of paying an
  // extra Vercel -> Render round trip before each page load.
  maxAge: 86400
}));

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: err.message || 'Server error'
  });
});

const port = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI, {
  // Keep a small pool warm so page loads do not pay for a fresh Atlas
  // connection each time a Render instance handles a burst of requests.
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000
})
  .then(() => {
    console.log('MongoDB connected successfully');

    app.listen(port, () => {
      console.log(`API running on port ${port}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });