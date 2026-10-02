import mongoose from 'mongoose';

const consentSchema = new mongoose.Schema(
  {
    version: { type: Number, default: 1 },
    activity: { type: Boolean, default: false },
    keyboard: { type: Boolean, default: false },
    apps: { type: Boolean, default: false },
    screenshots: { type: Boolean, default: false },
    // Separate, explicit agreement that the manager and admins may view screenshots.
    managerViewScreenshots: { type: Boolean, default: false },
    acceptedAt: Date,
    withdrawnAt: Date
  },
  { _id: false }
);

const employeeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    employeeCode: { type: String, required: true, unique: true, trim: true },
    designation: { type: String, trim: true },
    department: { type: String, trim: true },
    // The manager's User id. Managers may only see employees assigned to them.
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    joinedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'on-leave', 'inactive'], default: 'active' },
    // Mirrors consent.acceptedAt, kept for quick filtering.
    trackingConsent: { type: Boolean, default: false },
    // What the person agreed to share in the desktop agent's onboarding.
    consent: {
      type: consentSchema,
      default: () => ({})
    },
    // Separate from `consent`: given in camera-agent, which the desktop agent's onboarding never touches.
    // Covers webcam checks reported as generic labels, which the manager and admins may see.
    cameraConsent: {
      given: { type: Boolean, default: false },
      mode: { type: String, enum: ['local', 'vision'] },
      acceptedAt: Date,
      withdrawnAt: Date
    },
    // Start/pause control shared by the website and the desktop agent.
    // 'stopped' until the employee signs in on the website; 'paused' by either side.
    tracking: {
      state: { type: String, enum: ['stopped', 'active', 'paused'], default: 'stopped' },
      changedAt: { type: Date, default: Date.now },
      changedBy: { type: String, enum: ['web', 'agent', 'system'], default: 'system' }
    },
    // Last time the desktop agent checked in, so the website can show whether it's running.
    agentLastSeenAt: Date
  },
  { timestamps: true }
);

export const Employee = mongoose.model('Employee', employeeSchema);
