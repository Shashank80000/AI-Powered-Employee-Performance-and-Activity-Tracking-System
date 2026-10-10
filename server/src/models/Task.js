import mongoose from 'mongoose';

export const TASK_STATUSES = ['todo', 'in-progress', 'review', 'done'];
export const TASK_PRIORITIES = ['low', 'medium', 'high'];
// What a history entry records: a plain comment, or a step in the review flow.
export const TASK_EVENT_KINDS = ['comment', 'submitted', 'approved', 'changes-requested'];

const taskEventSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Copied at write time, so the history still reads correctly after a rename or deactivation.
    authorName: { type: String, required: true },
    authorRole: { type: String, required: true },
    kind: { type: String, enum: TASK_EVENT_KINDS, default: 'comment' },
    text: { type: String, trim: true, maxlength: 2000 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

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
    completedAt: Date,
    // Comments, submissions and review decisions, oldest first.
    history: { type: [taskEventSchema], default: [] }
  },
  { timestamps: true }
);

taskSchema.pre('save', function setCompletedAt(next) {
  if (this.isModified('status')) this.completedAt = this.status === 'done' ? new Date() : undefined;
  next();
});

export const Task = mongoose.model('Task', taskSchema);
