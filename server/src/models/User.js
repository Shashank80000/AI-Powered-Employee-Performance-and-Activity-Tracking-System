import mongoose from 'mongoose';
import { TIME_ZONE } from '../utils/dateUtils.js';

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
    // Part of every sign-in token. Raising it (password change or reset, deactivation) ends all existing sessions.
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    mustChangePassword: Boolean(this.mustChangePassword),
    // The organisation's time zone, so the website's "today" is the same day the server means.
    timeZone: TIME_ZONE
  };
};

/** Ends every session signed with an earlier version. Call before save(). */
userSchema.methods.endSessions = function endSessions() {
  this.tokenVersion = (this.tokenVersion ?? 0) + 1;
};

export const User = mongoose.model('User', userSchema);
