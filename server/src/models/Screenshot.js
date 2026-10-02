import mongoose from 'mongoose';

export const SCREENSHOT_CATEGORIES = [
  'coding',
  'documents',
  'design',
  'communication',
  'meeting',
  'research',
  'admin',
  'entertainment',
  'social_media',
  'idle_or_locked',
  'other',
  'unclassified'
];

// Taken only with the person's consent (version 2+: their manager and admins may view it).
// The whole screenshot, image and record, is deleted SCREENSHOT_RETENTION_DAYS after capture.
const screenshotSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    capturedAt: { type: Date, required: true },
    bytes: { type: Number, min: 0, required: true },
    // Consent version in force when it was taken. Only version 2+ allows managers to view it;
    // screenshots taken under version 1 ("managers never see screenshots") stay private.
    consentVersion: { type: Number, default: 1 },
    filePath: { type: String, select: false },
    status: { type: String, enum: ['pending', 'analyzed', 'failed'], default: 'pending', index: true },
    analysis: {
      category: { type: String, enum: SCREENSHOT_CATEGORIES },
      activity: { type: String, maxlength: 80 },
      productive: Boolean,
      confidence: { type: Number, min: 0, max: 1 }
    },
    analyzedAt: Date,
    imageDeletedAt: Date,
    // Every time someone other than the person opens the image. Shown to the person.
    views: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, at: { type: Date, default: Date.now }, _id: false }]
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

screenshotSchema.index({ employee: 1, capturedAt: -1 });
// No TTL index: purgeExpiredScreenshots() deletes the file and the record together, so a
// record can never vanish while its image file is left behind on disk.

export const Screenshot = mongoose.model('Screenshot', screenshotSchema);
