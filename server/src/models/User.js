import mongoose from 'mongoose';

export const ROLES = ['admin', 'manager', 'employee'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'employee' },
    isActive: { type: Boolean, default: true },
    // Set when an admin chooses the password (new account or reset); the website asks for a new one at sign-in.
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: Date
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), name: this.name, email: this.email, role: this.role, mustChangePassword: Boolean(this.mustChangePassword) };
};

export const User = mongoose.model('User', userSchema);
