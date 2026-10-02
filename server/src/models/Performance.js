import mongoose from 'mongoose';

// One aggregated record per employee per day, computed from Activity, ApplicationUsage and Task.
const performanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true },
    activeSeconds: { type: Number, min: 0, default: 0 },
    idleSeconds: { type: Number, min: 0, default: 0 },
    productiveAppSeconds: { type: Number, min: 0, default: 0 },
    tasksAssigned: { type: Number, min: 0, default: 0 },
    tasksCompleted: { type: Number, min: 0, default: 0 },
    onTimeTasks: { type: Number, min: 0, default: 0 },
    productivityScore: { type: Number, min: 0, max: 100, default: 0 }
  },
  { timestamps: true }
);

performanceSchema.index({ employee: 1, date: -1 }, { unique: true });

export const Performance = mongoose.model('Performance', performanceSchema);
