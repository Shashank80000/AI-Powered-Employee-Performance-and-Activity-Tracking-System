import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// Administrator registration and organization isolation through the real API.
// Uses its own database next to TEST_MONGODB_URI's, which it empties.
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
let users;
const legacy = {};

before(async () => {
  if (skip) return;
  ({ default: mongoose } = await import('mongoose'));
  const bcrypt = (await import('bcryptjs')).default;
  const { createApp } = await import('../src/app.js');
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  users = mongoose.connection.collection('users');
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
  legacy.passwordHash = await bcrypt.hash('Legacy2026a', 4);
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const register = (fields) => api('POST', '/auth/register', { organizationName: 'Acme', name: 'Owner', password: 'Owner2026a', ...fields });
const signIn = async (email, password) => (await api('POST', '/auth/login', { email, password })).data.token;

/** An admin's organization with one manager, one employee (past the first-sign-in password change) and one task. */
async function populate(adminToken, prefix) {
  const manager = (await api('POST', '/users/managers', { name: `${prefix} Manager`, email: `${prefix}.manager@test.dev`, password: 'Welcome123' }, adminToken)).data.manager;
  const employee = (
    await api('POST', '/employees', { name: `${prefix} Employee`, email: `${prefix}.employee@test.dev`, password: 'Welcome123', employeeCode: `${prefix}-1`, manager: manager.id }, adminToken)
  ).data.employee;
  const task = (await api('POST', '/tasks', { title: `${prefix} task`, assignedTo: employee.id }, adminToken)).data.task;
  return { manager, employee, task };
}

test('anyone can register an administrator with their own organization', { skip }, async () => {
  const missingOrganization = await api('POST', '/auth/register', { name: 'Owner', email: 'a@test.dev', password: 'Owner2026a' });
  assert.equal(missingOrganization.status, 400);
  assert.equal((await register({ email: 'not-an-email' })).status, 400);
  const weak = await register({ email: 'a@test.dev', password: 'short' });
  assert.equal(weak.status, 400);
  assert.equal(weak.message, 'Use at least 8 characters for the password');
  assert.equal((await register({ email: 'a@test.dev', password: 'lettersonly' })).status, 400);

  const first = await register({ organizationName: 'Acme Ltd', name: 'Asha Owner', email: 'Asha@Test.dev' });
  assert.equal(first.status, 201);
  assert.equal(first.data.user.role, 'admin');
  assert.equal(first.data.user.email, 'asha@test.dev');
  assert.equal(first.data.user.mustChangePassword, false);
  assert.equal('passwordHash' in first.data.user, false);
  assert.equal((await api('GET', '/auth/me', undefined, first.data.token)).data.user.role, 'admin', 'signed in at once');

  const stored = await users.findOne({ email: 'asha@test.dev' });
  assert.match(stored.passwordHash, /^\$2[aby]\$12\$/, 'bcrypt hash with cost 12');
  const organization = await mongoose.connection.collection('organizations').findOne({ _id: stored.organization });
  assert.equal(organization.name, 'Acme Ltd');
  assert.equal(String(organization.createdBy), String(stored._id));

  // A second person registers too: a second, separate organization.
  const second = await register({ organizationName: 'Beta Co', name: 'Ben Owner', email: 'ben@test.dev' });
  assert.equal(second.status, 201);
  assert.notEqual(String((await users.findOne({ email: 'ben@test.dev' })).organization), String(stored.organization));
});

test('an email can only be registered once, even at the same moment', { skip }, async () => {
  const before = await users.findOne({ email: 'asha@test.dev' });
  const taken = await register({ organizationName: 'Take Over', name: 'Mallory', email: 'asha@test.dev', password: 'Takeover2026' });
  assert.equal(taken.status, 409);
  assert.match(taken.message, /already exists/);
  assert.deepEqual(await users.findOne({ _id: before._id }), before, 'the existing account is untouched');

  const organizations = mongoose.connection.collection('organizations');
  const count = await organizations.countDocuments();
  const results = await Promise.all([register({ email: 'race@test.dev' }), register({ email: 'race@test.dev', password: 'Other2026b' })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await users.countDocuments({ email: 'race@test.dev' }), 1);
  assert.equal(await organizations.countDocuments(), count + 1, 'the losing request leaves no empty organization');
});

test('administrators only see and change their own organization', { skip }, async () => {
  const asha = await signIn('asha@test.dev', 'Owner2026a');
  const ben = await signIn('ben@test.dev', 'Owner2026a');
  const acme = await populate(asha, 'acme');
  const beta = await populate(ben, 'beta');
  assert.ok(acme.task && beta.task, 'both organizations work normally');

  assert.deepEqual((await api('GET', '/users/managers', undefined, asha)).data.managers.map((m) => m.name), ['acme Manager']);
  assert.deepEqual((await api('GET', '/employees', undefined, asha)).data.employees.map((e) => e.name), ['acme Employee']);
  assert.deepEqual((await api('GET', '/employees/managers', undefined, asha)).data.managers.map((m) => m.name), ['acme Manager']);
  assert.deepEqual((await api('GET', '/tasks', undefined, asha)).data.tasks.map((t) => t.title), ['acme task']);
  assert.deepEqual((await api('GET', '/performance/dashboard', undefined, asha)).data.team.map((p) => p.name), ['acme Employee']);
  const team = await api('POST', '/agent/insights', { scope: 'team' }, asha);
  assert.deepEqual(team.data.subjects.map((s) => s.name), ['acme Employee']);

  // Ids from the other organization, used directly: not found, and nothing changes.
  assert.equal((await api('GET', `/employees/${beta.employee.id}`, undefined, asha)).status, 404);
  assert.equal((await api('PATCH', `/employees/${beta.employee.id}`, { designation: 'Hacked' }, asha)).status, 404);
  assert.equal((await api('DELETE', `/employees/${beta.employee.id}`, undefined, asha)).status, 404);
  assert.equal((await api('PATCH', `/users/managers/${beta.manager.id}`, { isActive: false }, asha)).status, 404);
  assert.equal((await api('POST', `/users/${beta.employee.userId}/password`, { password: 'Stolen2026' }, asha)).status, 404);
  assert.equal((await api('PATCH', `/tasks/${beta.task.id}`, { title: 'Hacked' }, asha)).status, 404);
  assert.equal((await api('POST', '/tasks', { title: 'Sneaky', assignedTo: beta.employee.id }, asha)).status, 404);
  const borrowedManager = await api('POST', '/employees', { name: 'Eve', email: 'eve@test.dev', password: 'Welcome123', employeeCode: 'X-1', manager: beta.manager.id }, asha);
  assert.equal(borrowedManager.status, 400, "another organization's manager can't be assigned");
  assert.equal((await api('PATCH', `/employees/${acme.employee.id}`, { manager: beta.manager.id }, asha)).status, 400);
  assert.equal((await api('GET', `/agent/metrics?employeeId=${beta.employee.id}`, undefined, asha)).status, 404);
  assert.equal((await api('POST', '/performance/recalculate', { days: 1 }, asha)).data.employees, 1);

  const betaEmployee = await users.findOne({ email: 'beta.employee@test.dev' });
  assert.equal(betaEmployee.mustChangePassword, true, "the other organization's employee is untouched");
  assert.equal((await api('GET', '/employees', undefined, ben)).data.employees[0].designation, undefined);
});

test('the original organization keeps its data and is invisible to new organizations', { skip }, async () => {
  // Accounts from before registration existed have no organization.
  await users.insertOne({ name: 'Old Admin', email: 'old.admin@test.dev', role: 'admin', isActive: true, tokenVersion: 0, passwordHash: legacy.passwordHash });
  await users.insertOne({ name: 'Old Manager', email: 'old.manager@test.dev', role: 'manager', isActive: true, tokenVersion: 0, passwordHash: legacy.passwordHash });
  const old = await signIn('old.admin@test.dev', 'Legacy2026a');
  assert.deepEqual((await api('GET', '/users/managers', undefined, old)).data.managers.map((m) => m.name), ['Old Manager']);
  const created = await api('POST', '/users/managers', { name: 'Old Second', email: 'old.second@test.dev', password: 'Welcome123' }, old);
  assert.equal(created.status, 201);
  assert.equal((await users.findOne({ email: 'old.second@test.dev' })).organization, undefined, 'stays in the original organization');

  const asha = await signIn('asha@test.dev', 'Owner2026a');
  assert.ok((await api('GET', '/users/managers', undefined, asha)).data.managers.every((m) => !m.name.startsWith('Old')));
  assert.ok((await api('GET', '/users/managers', undefined, old)).data.managers.every((m) => m.name.startsWith('Old')));
});

test('sign-in, sign-out and role checks', { skip }, async () => {
  const wrong = await api('POST', '/auth/login', { email: 'asha@test.dev', password: 'Wrong2026x' });
  const unknown = await api('POST', '/auth/login', { email: 'nobody@test.dev', password: 'Wrong2026x' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.message, unknown.message, 'the same message, so accounts cannot be discovered');
  assert.equal((await api('POST', '/auth/login', { email: 'asha@test.dev' })).status, 400, 'missing password');

  // Managers and employees still sign in, and can't use administrator APIs.
  for (const email of ['acme.manager@test.dev', 'acme.employee@test.dev']) {
    const first = await api('POST', '/auth/login', { email, password: 'Welcome123' });
    assert.equal(first.status, 200, `${email} signs in`);
    const changed = await api('POST', '/auth/password', { currentPassword: 'Welcome123', newPassword: 'Chosen2026' }, first.data.token);
    assert.equal(changed.status, 200);
    assert.equal((await api('GET', '/users/managers', undefined, changed.data.token)).status, 403, `${email} is not an administrator`);
    assert.equal((await api('POST', '/users/managers', { name: 'Sneaky', email: 'sneaky@test.dev', password: 'Sneaky2026' }, changed.data.token)).status, 403);
  }
  assert.equal((await api('GET', '/users/managers')).status, 401, 'no token');
  assert.equal((await api('GET', '/users/managers', undefined, 'forged.token.value')).status, 401);

  const token = await signIn('asha@test.dev', 'Owner2026a');
  assert.equal((await api('POST', '/auth/logout', undefined, token)).status, 204);
  const sid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sid;
  assert.ok((await mongoose.connection.collection('worksessions').findOne({ _id: new mongoose.Types.ObjectId(sid) })).logoutAt);

  assert.deepEqual((await api('GET', '/auth/demo')).data, { enabled: false, roles: [] });
  assert.equal((await api('POST', '/auth/demo', { role: 'admin' })).status, 404);
  assert.equal((await api('POST', '/auth/setup', { name: 'Old', email: 'x@test.dev', password: 'Owner2026a' })).status, 404, 'the old setup endpoint is gone');
});
