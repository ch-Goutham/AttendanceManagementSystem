import mongoose from 'mongoose';
const attendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // YYYY-MM-DD, avoids timezone date drift
  status: { type: String, enum: ['Present', 'Absent', 'Leave'], required: true },
  source: { type: String, enum: ['admin', 'self'], default: 'admin' },
  approval: { type: String, enum: ['confirmed', 'pending', 'rejected'], default: 'confirmed' },
  note: { type: String, trim: true, default: '' },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
export default mongoose.model('Attendance', attendanceSchema);
