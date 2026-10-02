import mongoose from 'mongoose';

// Privacy contract: only counts and durations. Never key values, window titles, or screenshots.
const activitySchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    capturedAt: { type: Date, required: true },
    intervalSeconds: { type: Number, min: 1, required: true },
    activeSeconds: { type: Number, min: 0, required: true },
    idleSeconds: { type: Number, min: 0, required: true },
    mouseEvents: { type: Number, min: 0, default: 0 },
    keyboardEvents: { type: Number, min: 0, default: 0 },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activitySchema.index({ employee: 1, capturedAt: -1 });
// Retention: raw snapshots expire after 90 days; aggregated Performance records are kept.
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const Activity = mongoose.model('Activity', activitySchema);
