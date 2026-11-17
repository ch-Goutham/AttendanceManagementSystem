import mongoose from 'mongoose';

// An employee's report that they forgot to check in on a day they worked.
// The admin reviews it and, on approval, marks attendance for that date.
const missedCheckInSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD, matches Attendance/Leave
    reason: { type: String, required: true, trim: true },
    // Times the employee remembers, used to pre-fill the admin's form.
    requestedCheckIn: { type: String, default: '' }, // HH:mm
    requestedCheckOut: { type: String, default: '' },
    location: {
      type: String,
      enum: ['Office', 'Work from home', 'College', ''],
      default: ''
    },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    // Set when the admin approves and the attendance record is written.
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, default: '' }
  },
  { timestamps: true }
);

missedCheckInSchema.index({ employee: 1, date: -1 });
missedCheckInSchema.index({ status: 1, date: -1 });
missedCheckInSchema.index({ date: -1 });

export default mongoose.model('MissedCheckIn', missedCheckInSchema);
