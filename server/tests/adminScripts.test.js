import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

// The administrator password-reset script, the seed safeguards and the production demo-mode guard, run as real
// processes. Uses its own database next to TEST_MONGODB_URI's, which it empties.
const base = process.env.TEST_MONGODB_URI;
const uri = base && base.replace(/\/([^/?]+)(\?|$)/, '/$1_scripts$2');
const database = uri && new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.slice(1);
const serverDir = fileURLToPath(new URL('..', import.meta.url));
const skip = uri ? false : 'set TEST_MONGODB_URI to a throwaway database to run the script tests';
const secret = 'x'.repeat(40);
let mongoose;
let bcrypt;
let users;

/** Runs a server script with only the given environment (plus PATH), never the developer's real database. */
function run(script, args = [], { input = '', env = {} } = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: serverDir,
    input,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, MONGODB_URI: uri, JWT_SECRET: secret, NODE_ENV: 'development', ...env },
    timeout: 120_000
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

before(async () => {
  if (skip) return;
  ({ default: mongoose } = await import('mongoose'));
  bcrypt = (await import('bcryptjs')).default;
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  users = mongoose.connection.collection('users');
  const now = new Date();
  await users.insertMany([
    { name: 'Ada Admin', email: 'ada@test.dev', role: 'admin', isActive: true, tokenVersion: 0, passwordHash: await bcrypt.hash('OldAdmin2026', 4), createdAt: now, updatedAt: now },
    { name: 'Max Manager', email: 'max@test.dev', role: 'manager', isActive: true, tokenVersion: 0, passwordHash: await bcrypt.hash('Manager2026', 4), createdAt: now, updatedAt: now }
  ]);
});

after(async () => {
  if (skip) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('demo sign-in can never be switched on in production', () => {
  const read = "import('./src/config/env.js').then(({ env }) => console.log('DEMO_MODE=' + env.DEMO_MODE))";
  const env = { PATH: process.env.PATH, MONGODB_URI: 'mongodb://127.0.0.1/unused', JWT_SECRET: secret, DEMO_MODE: 'true' };
  const production = spawnSync(process.execPath, ['-e', read], { cwd: serverDir, encoding: 'utf8', env: { ...env, NODE_ENV: 'production' } });
  assert.match(production.stdout, /DEMO_MODE=false/);
  assert.match(production.stderr, /ignored because NODE_ENV=production/);
  const development = spawnSync(process.execPath, ['-e', read], { cwd: serverDir, encoding: 'utf8', env: { ...env, NODE_ENV: 'development' } });
  assert.match(development.stdout, /DEMO_MODE=true/);
});

test('reset-password changes only an administrator, securely', { skip }, async () => {
  const script = 'src/scripts/resetAdminPassword.js';
  const before = await users.findOne({ email: 'ada@test.dev' });
  const manager = await users.findOne({ email: 'max@test.dev' });

  assert.equal(run(script).status, 1, 'an email is required');
  const unknown = run(script, ['nobody@test.dev'], { input: 'NewAdmin2026\n' });
  assert.equal(unknown.status, 1);
  assert.match(unknown.output, /No account uses nobody@test.dev/);

  const notAdmin = run(script, ['max@test.dev'], { input: 'NewAdmin2026\n' });
  assert.equal(notAdmin.status, 1);
  assert.match(notAdmin.output, /manager account, not an administrator/);
  assert.deepEqual(await users.findOne({ _id: manager._id }), manager, 'the manager is untouched');

  const weak = run(script, ['ada@test.dev'], { input: 'short\n' });
  assert.equal(weak.status, 1);
  assert.match(weak.output, /at least 8 characters/);
  assert.deepEqual(await users.findOne({ _id: before._id }), before, 'a refused reset changes nothing');

  const reset = run(script, ['ADA@test.dev'], { input: 'NewAdmin2026\n' });
  assert.equal(reset.status, 0, reset.output);
  assert.match(reset.output, /Password changed for administrator ada@test.dev/);
  const after = await users.findOne({ _id: before._id });
  assert.ok(!reset.output.includes('NewAdmin2026'), 'the password is never printed');
  assert.ok(!reset.output.includes(after.passwordHash) && !reset.output.includes('$2'), 'nor its hash');
  assert.match(after.passwordHash, /^\$2[aby]\$12\$/);
  assert.equal(await bcrypt.compare('NewAdmin2026', after.passwordHash), true);
  assert.equal(await bcrypt.compare('OldAdmin2026', after.passwordHash), false);
  assert.equal(after.tokenVersion, 1, 'existing sign-ins end');
  assert.equal(after.name, before.name);
  assert.deepEqual(await users.findOne({ _id: manager._id }), manager);
});

test('the seed refuses production and asks before wiping existing data', { skip }, async () => {
  const script = 'src/scripts/seed.js';
  const count = () => users.countDocuments();
  const accounts = await count();

  const production = run(script, [], { env: { NODE_ENV: 'production' } });
  assert.equal(production.status, 1);
  assert.match(production.output, /Refusing to seed: NODE_ENV=production/);

  const unconfirmed = run(script);
  assert.equal(unconfirmed.status, 1);
  assert.match(unconfirmed.output, new RegExp(`Set SEED_CONFIRM=${database}`));
  assert.ok(!unconfirmed.output.includes(secret));

  const wrongName = run(script, [], { env: { SEED_CONFIRM: 'some-other-database' } });
  assert.equal(wrongName.status, 1);
  assert.equal(await count(), accounts, 'existing data is intact after every refusal');
  assert.ok(await users.findOne({ email: 'ada@test.dev' }));

  const confirmed = run(script, [], { env: { SEED_CONFIRM: database } });
  assert.equal(confirmed.status, 0, confirmed.output);
  assert.equal(await users.findOne({ email: 'ada@test.dev' }), null, 'a confirmed seed replaces the data, as asked');
  assert.ok(await users.findOne({ email: 'admin@workplus.dev' }));
});
