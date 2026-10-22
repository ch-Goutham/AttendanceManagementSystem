import mongoose from 'mongoose';
const attendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD, avoids timezone date drift
  status: { type: String, enum: ['Present', 'Absent', 'Leave'], required: true },
  // Wall-clock company time, stored as HH:mm, matching the YYYY-MM-DD date
  // convention above. Derived facts (late/early/hours) are never stored.
  checkIn: { type: String, default: '' },
  checkOut: { type: String, default: '' },
  // Empty means "not decided yet"; the server derives Full day / Half day from
  // worked hours whenever times are written. An admin edit can set it directly.
  dayType: { type: String, enum: ['Full day', 'Half day', ''], default: '' },
  source: { type: String, enum: ['admin', 'self'], default: 'admin' },
  approval: { type: String, enum: ['confirmed', 'pending', 'rejected'], default: 'confirmed' },
  note: { type: String, trim: true, default: '' },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  editedAt: { type: Date, default: null }
}, { timestamps: true });
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
export default mongoose.model('Attendance', attendanceSchema);
