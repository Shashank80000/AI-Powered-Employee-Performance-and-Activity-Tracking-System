import mongoose from 'mongoose';

// Audit log of every AI agent request: who asked what, the exact facts it was given, what it answered, what the
// evidence check removed, and the asker's rating. Kept so results can be reproduced and evaluated.
const agentRunSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true },
    scope: { type: String, enum: ['employee', 'team'], required: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    period: { type: String, required: true },
    periodStart: Date,
    periodEnd: Date,
    question: String,
    source: { type: String, enum: ['claude', 'rules'], required: true },
    model: String,
    // Why the model wasn't used or its answer was discarded, when source is 'rules'.
    fallbackReason: String,
    facts: { type: mongoose.Schema.Types.Mixed, default: [] },
    result: { type: mongoose.Schema.Types.Mixed, default: {} },
    validation: { type: mongoose.Schema.Types.Mixed, default: {} },
    latencyMs: Number,
    usage: { inputTokens: Number, outputTokens: Number },
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, trim: true, maxlength: 1000 },
      at: Date
    }
  },
  { timestamps: true }
);

export const AgentRun = mongoose.model('AgentRun', agentRunSchema);
