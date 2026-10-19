import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// First-run administrator setup through the real API. Uses its own database next to TEST_MONGODB_URI's, which it empties.
const base = process.env.TEST_MONGODB_URI;
const uri = base && base.replace(/\/([^/?]+)(\?|$)/, '/$1_setup$2');
process.env.MONGODB_URI = uri ?? 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'x'.repeat(40);
// Demo sign-in off, whatever server/.env says, so the test checks the default.
process.env.DEMO_MODE = 'false';

const skip = uri ? false : 'set TEST_MONGODB_URI to a throwaway database to run the setup test';
let server;
let api;
let mongoose;

before(async () => {
  if (skip) return;
  ({ default: mongoose } = await import('mongoose'));
  const { createApp } = await import('../src/app.js');
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${server.address().port}/api`;
  api = async (method, path, body, token) => {
    const response = await fetch(root + path, {
      method,
      headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body)
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data, message: data?.error?.details?.[0]?.message ?? data?.error?.message };
  };
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('the first visitor creates the administrator, once', { skip }, async () => {
  assert.deepEqual((await api('GET', '/auth/setup')).data, { needed: true });

  const weak = await api('POST', '/auth/setup', { name: 'Owner', email: 'owner@test.dev', password: 'short' });
  assert.equal(weak.status, 400);
  assert.equal(weak.message, 'Use at least 8 characters for the password');

  // Two people submitting at the same moment: exactly one becomes administrator.
  const [first, second] = await Promise.all([
    api('POST', '/auth/setup', { name: 'Owner One', email: 'one@test.dev', password: 'Owner2026a' }),
    api('POST', '/auth/setup', { name: 'Owner Two', email: 'two@test.dev', password: 'Owner2026b' })
  ]);
  assert.deepEqual([first.status, second.status].sort(), [201, 409]);
  const winner = first.status === 201 ? first : second;
  assert.equal(winner.data.user.role, 'admin');
  assert.equal(winner.data.user.mustChangePassword, false);
  assert.equal(await mongoose.connection.collection('users').countDocuments({ role: 'admin' }), 1);

  assert.deepEqual((await api('GET', '/auth/setup')).data, { needed: false });
  const late = await api('POST', '/auth/setup', { name: 'Intruder', email: 'intruder@test.dev', password: 'Intrude2026' });
  assert.equal(late.status, 409);
  assert.equal(late.message, 'Setup is already complete. Sign in instead.');

  // The new administrator is a normal admin: the token works and the rest of the app follows.
  assert.equal((await api('GET', '/users/managers', undefined, winner.data.token)).status, 200);
  const signIn = await api('POST', '/auth/login', { email: winner.data.user.email, password: first.status === 201 ? 'Owner2026a' : 'Owner2026b' });
  assert.equal(signIn.status, 200);
});

test('setup validates input, stores only a hash, and never touches the existing administrator', { skip }, async () => {
  const users = mongoose.connection.collection('users');
  // Setup is closed now; validation still runs first, so bad input gets a useful message rather than 409.
  const badEmail = await api('POST', '/auth/setup', { name: 'Owner', email: 'not-an-email', password: 'Owner2026a' });
  assert.equal(badEmail.status, 400);
  assert.match(badEmail.message, /valid email/);
  assert.equal((await api('POST', '/auth/setup', { email: 'x@test.dev', password: 'Owner2026a' })).status, 400, 'name is required');
  assert.equal((await api('POST', '/auth/setup', { name: 'Owner', email: 'x@test.dev', password: 'lettersonly' })).status, 400);

  const admin = await users.findOne({ role: 'admin' });
  assert.match(admin.passwordHash, /^\$2[aby]\$12\$/, 'bcrypt hash with cost 12');
  assert.ok(!['Owner2026a', 'Owner2026b'].includes(admin.passwordHash));

  // A late setup attempt, even with the administrator's own email and an extra role field, changes nothing.
  const late = await api('POST', '/auth/setup', { name: 'Taken Over', email: admin.email, password: 'Takeover2026', role: 'admin' });
  assert.equal(late.status, 409);
  assert.deepEqual(await users.findOne({ _id: admin._id }), admin);
  assert.equal(await users.countDocuments({ role: 'admin' }), 1);
});

test('sign-in, sign-out and role checks after setup', { skip }, async () => {
  const admin = await mongoose.connection.collection('users').findOne({ role: 'admin' });
  const password = admin.email === 'one@test.dev' ? 'Owner2026a' : 'Owner2026b';

  const wrong = await api('POST', '/auth/login', { email: admin.email, password: 'Wrong2026x' });
  const unknown = await api('POST', '/auth/login', { email: 'nobody@test.dev', password: 'Wrong2026x' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.message, unknown.message, 'the same message, so accounts cannot be discovered');
  assert.equal((await api('POST', '/auth/login', { email: admin.email })).status, 400, 'missing password');

  const { token } = (await api('POST', '/auth/login', { email: admin.email, password })).data;
  assert.equal((await api('GET', '/auth/me', undefined, token)).data.user.role, 'admin');
  assert.equal('passwordHash' in (await api('GET', '/auth/me', undefined, token)).data.user, false);

  // Managers and employees still sign in, and can't use administrator APIs.
  const manager = await api('POST', '/users/managers', { name: 'Mia Manager', email: 'mia@test.dev', password: 'Welcome123' }, token);
  assert.equal(manager.status, 201);
  const employee = await api('POST', '/employees', { name: 'Eli Employee', email: 'eli@test.dev', password: 'Welcome123', employeeCode: 'E-9', manager: manager.data.manager.id }, token);
  assert.equal(employee.status, 201);
  for (const email of ['mia@test.dev', 'eli@test.dev']) {
    const first = await api('POST', '/auth/login', { email, password: 'Welcome123' });
    assert.equal(first.status, 200, `${email} signs in`);
    const changed = await api('POST', '/auth/password', { currentPassword: 'Welcome123', newPassword: 'Chosen2026' }, first.data.token);
    assert.equal(changed.status, 200);
    assert.equal((await api('GET', '/users/managers', undefined, changed.data.token)).status, 403, `${email} is not an administrator`);
    assert.equal((await api('POST', '/users/managers', { name: 'Sneaky', email: 'sneaky@test.dev', password: 'Sneaky2026' }, changed.data.token)).status, 403);
    assert.equal((await api('POST', '/auth/login', { email, password: 'Chosen2026' })).status, 200);
  }
  assert.equal((await api('GET', '/users/managers')).status, 401, 'no token');
  assert.equal((await api('GET', '/users/managers', undefined, 'forged.token.value')).status, 401);

  // Signing out records the end of this sign-in.
  assert.equal((await api('POST', '/auth/logout', undefined, token)).status, 204);
  const sid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sid;
  assert.ok((await mongoose.connection.collection('worksessions').findOne({ _id: new mongoose.Types.ObjectId(sid) })).logoutAt);

  // Demo sign-in is off unless explicitly enabled, and there is no public way to create another administrator.
  assert.deepEqual((await api('GET', '/auth/demo')).data, { enabled: false, roles: [] });
  assert.equal((await api('POST', '/auth/demo', { role: 'admin' })).status, 404);
  assert.equal(await mongoose.connection.collection('users').countDocuments({ role: 'admin' }), 1);
});
