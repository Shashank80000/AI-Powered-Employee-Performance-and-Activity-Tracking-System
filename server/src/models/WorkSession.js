import mongoose from 'mongoose';

export const SESSION_CLIENTS = ['web', 'agent'];

// One sign-in: created by POST /api/auth/login, closed by POST /api/auth/logout. A session that is never closed
// (browser closed, token expired) keeps logoutAt empty, and the AI agent reports it as a missing sign-out.
const workSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Set for employees only, so their sessions can be analysed alongside their tasks.
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    client: { type: String, enum: SESSION_CLIENTS, default: 'web' },
    loginAt: { type: Date, required: true },
    logoutAt: Date
  },
  { timestamps: true }
);

workSessionSchema.index({ employee: 1, loginAt: -1 });
workSessionSchema.index({ user: 1, loginAt: -1 });

export const WorkSession = mongoose.model('WorkSession', workSessionSchema);
