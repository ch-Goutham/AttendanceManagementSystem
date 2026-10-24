import mongoose from 'mongoose';
const leaveSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  startDate: { type: String, required: true }, // YYYY-MM-DD, matches Attendance date format
  endDate: { type: String, required: true },   // YYYY-MM-DD
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, default: '' }
}, { timestamps: true });
leaveSchema.index({ employee: 1, startDate: -1 });
leaveSchema.index({ status: 1, createdAt: -1 });
export default mongoose.model('Leave', leaveSchema);
