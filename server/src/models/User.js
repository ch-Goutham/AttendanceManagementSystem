import mongoose from 'mongoose';
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  // Locally created accounts have a password. Accounts created through Google
  // have no local password, so the field is only required without a googleId.
  password: {
    type: String,
    required() {
      return !this.googleId;
    },
    minlength: 8,
    select: false
  },
  googleId: { type: String, unique: true, sparse: true },
  phone: { type: String, trim: true, default: '' },
  role: { type: String, enum: ['admin', 'employee'], required: true },
  employeeCode: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  position: { type: String, trim: true, default: '' },
  // Default working location. The employee can override it for a single day
  // when checking in (Attendance.location).
  location: {
    type: String,
    enum: ['Office', 'Work from home', 'College'],
    default: 'Office'
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
userSchema.index({ role: 1 });
export default mongoose.model('User', userSchema);
