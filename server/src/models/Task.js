import mongoose from 'mongoose';

export const TASK_STATUSES = ['todo', 'in-progress', 'review', 'done'];
export const TASK_PRIORITIES = ['low', 'medium', 'high'];

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
    expectedMinutes: { type: Number, min: 0, default: 60 },
    actualMinutes: { type: Number, min: 0, default: 0 },
    dueDate: Date,
    completedAt: Date
  },
  { timestamps: true }
);

taskSchema.pre('save', function setCompletedAt(next) {
  if (this.isModified('status')) this.completedAt = this.status === 'done' ? new Date() : undefined;
  next();
});

export const Task = mongoose.model('Task', taskSchema);
