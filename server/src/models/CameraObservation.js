import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { CAMERA_STATES } from '../utils/cameraStates.js';

export { CAMERA_STATES };

// One webcam check by camera-agent, taken only with the person's separate camera consent.
// The frame itself never reaches the server: this record is the whole observation.
const cameraObservationSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    observedAt: { type: Date, required: true },
    state: { type: String, enum: CAMERA_STATES, required: true },
    activity: { type: String, maxlength: 80 },
    confidence: { type: Number, min: 0, max: 1 },
    // 'local': on-device face detection only. 'vision': classified by Claude.
    source: { type: String, enum: ['local', 'vision'], required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

cameraObservationSchema.index({ employee: 1, observedAt: -1 });
// Labels only (no files), so a TTL index is enough to enforce retention.
cameraObservationSchema.index({ observedAt: 1 }, { expireAfterSeconds: env.CAMERA_RETENTION_DAYS * 24 * 3600 });

export const CameraObservation = mongoose.model('CameraObservation', cameraObservationSchema);
