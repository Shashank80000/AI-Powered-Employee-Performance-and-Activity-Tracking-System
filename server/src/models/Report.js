import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    score: { type: Number, min: 0, max: 100 },
    trend: { type: String, enum: ['up', 'down', 'flat'] },
    summary: { type: String, required: true },
    highlights: [String],
    recommendations: [String],
    anomalies: [{ date: String, metric: String, value: Number, zScore: Number, _id: false }],
    // Every generated recommendation is labelled with where it came from.
    source: { type: String, enum: ['ai-service', 'fallback'], required: true },
    disclaimer: String
  },
  { timestamps: true }
);

export const Report = mongoose.model('Report', reportSchema);
