import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD, matches Attendance/Leave
    startTime: { type: String, required: true }, // HH:mm
    endTime: { type: String, required: true }, // HH:mm
    // Computed on the server from start/end so the stored total always matches.
    durationMinutes: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

permissionSchema.index({ employee: 1, date: -1 });
permissionSchema.index({ date: -1 });
permissionSchema.index({ status: 1, date: -1 });
export default mongoose.model('Permission', permissionSchema);
