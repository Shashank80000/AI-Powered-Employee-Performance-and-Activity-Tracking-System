// Sets a new password for an administrator who can no longer sign in. Run it on the server, never over HTTP.
// Usage: npm run admin:reset-password --workspace @tracker/server -- admin@company.com
// The password is typed twice without being shown. Without a terminal it is read from stdin instead (first line),
// e.g. printf '%s\n' "$NEW_PASSWORD" | npm run admin:reset-password ...  It is never accepted as an argument,
// so it can't end up in the shell history, and neither the password nor its hash is ever printed.
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { emailField, passwordField } from '../utils/accountRules.js';
import { ask, readStdin, safeUri } from './prompt.js';

class ResetRefused extends Error {}

async function readNewPassword() {
  let password;
  if (process.stdin.isTTY) {
    password = await ask('New password: ', { hidden: true });
    const again = await ask('Repeat the new password: ', { hidden: true });
    if (password !== again) throw new ResetRefused('The two passwords do not match. Nothing was changed.');
  } else {
    password = (await readStdin()).split(/\r?\n/)[0] ?? '';
  }
  const checked = passwordField.safeParse(password);
  if (!checked.success) throw new ResetRefused(`${checked.error.issues[0].message}. Nothing was changed.`);
  return checked.data;
}

async function resetAdminPassword() {
  const given = process.argv[2];
  if (!given) throw new ResetRefused('Usage: npm run admin:reset-password -- <administrator email>');
  const email = emailField.safeParse(given);
  if (!email.success) throw new ResetRefused(email.error.issues[0].message);

  await connectDatabase();
  console.log(`Database: ${mongoose.connection.name} (${safeUri(env.MONGODB_URI)})`);
  const user = await User.findOne({ email: email.data }).select('role isActive');
  if (!user) throw new ResetRefused(`No account uses ${email.data}. Nothing was changed.`);
  if (user.role !== 'admin') {
    throw new ResetRefused(`${email.data} is a ${user.role} account, not an administrator. An administrator can reset it from the website.`);
  }

  const password = await readNewPassword();
  // Filtered on role as well as id, so only this administrator can ever be changed.
  const result = await User.updateOne(
    { _id: user._id, role: 'admin' },
    { $set: { passwordHash: await bcrypt.hash(password, 12), mustChangePassword: false }, $inc: { tokenVersion: 1 } }
  );
  if (result.modifiedCount !== 1) throw new ResetRefused('The account changed while resetting. Nothing was changed; try again.');

  console.log(`Password changed for administrator ${email.data}. Every existing sign-in for this account has ended.`);
  if (!user.isActive) console.warn('Note: this account is deactivated, so it still cannot sign in.');
}

try {
  await resetAdminPassword();
} catch (error) {
  console.error(error instanceof ResetRefused ? error.message : error);
  process.exitCode = 1;
} finally {
  if (mongoose.connection.readyState) await disconnectDatabase();
}
