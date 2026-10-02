import mongoose from 'mongoose';

export const APP_CATEGORIES = ['productive', 'neutral', 'unproductive'];

// Stores the application name only (e.g. "Code"), never window titles or URLs.
const applicationUsageSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    application: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: APP_CATEGORIES, default: 'neutral' },
    durationSeconds: { type: Number, min: 0, required: true },
    capturedAt: { type: Date, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

applicationUsageSchema.index({ employee: 1, capturedAt: -1 });
applicationUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const ApplicationUsage = mongoose.model('ApplicationUsage', applicationUsageSchema);
