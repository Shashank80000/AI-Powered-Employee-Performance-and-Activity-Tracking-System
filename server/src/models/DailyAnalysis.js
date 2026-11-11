import mongoose from 'mongoose';

// Whole-day analysis written by analysis-agent: screenshot categories, camera labels + activity metrics.
const dailyAnalysisSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true },
    screenshotCount: { type: Number, min: 0, default: 0 },
    analyzedCount: { type: Number, min: 0, default: 0 },
    categoryMinutes: { type: Map, of: Number, default: {} },
    productiveMinutes: { type: Number, min: 0, default: 0 },
    // Working / entertainment / not working minutes (utils/workStatus.js). No defaults on purpose:
    // analyses stored before this existed have none, and get an estimate when read.
    statusMinutes: {
      working: { type: Number, min: 0 },
      entertainment: { type: Number, min: 0 },
      not_working: { type: Number, min: 0 }
    },
    timeline: [{ capturedAt: Date, category: String, activity: String, productive: Boolean, status: String, _id: false }],
    // From camera-agent's labels (never images). Empty when the person hasn't enabled camera checks.
    camera: {
      observationCount: { type: Number, min: 0, default: 0 },
      stateMinutes: { type: Map, of: Number, default: {} },
      atDeskMinutes: { type: Number, min: 0, default: 0 },
      awayMinutes: { type: Number, min: 0, default: 0 }
    },
    summary: { type: String, required: true },
    highlights: [String],
    suggestions: [String],
    model: String,
    generatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

dailyAnalysisSchema.index({ employee: 1, date: -1 }, { unique: true });

export const DailyAnalysis = mongoose.model('DailyAnalysis', dailyAnalysisSchema);
