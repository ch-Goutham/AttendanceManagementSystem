import mongoose from 'mongoose';
const resetTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });
// Auto-delete tokens once they expire.
resetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('ResetToken', resetTokenSchema);
