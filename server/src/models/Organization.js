import mongoose from 'mongoose';

// A separate workspace. Whoever registers on the website gets one and is its administrator; administrators only
// ever see their own organization. Accounts and employees without an organization belong to the original one,
// from before registration existed.
const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

export const Organization = mongoose.model('Organization', organizationSchema);
