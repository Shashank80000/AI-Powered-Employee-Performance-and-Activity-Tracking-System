import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

// Regression tests for the problems found by the role-based QA (admin, manager, employee, developer review and the
// Postman run). Each test names the problem it guards against. Uses its own database next to TEST_MONGODB_URI's.
const base = process.env.TEST_MONGODB_URI;
const uri = base && base.replace(/\/([^/?]+)(\?|$)/, '/$1_qa$2');
process.env.MONGODB_URI = uri ?? 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'x'.repeat(40);
process.env.DEMO_MODE = 'false';
const screenshotDir = mkdtempSync(join(tmpdir(), 'workplus-qa-'));
process.env.SCREENSHOT_DIR = screenshotDir;
delete process.env.ANTHROPIC_API_KEY;

const skip = uri ? false : 'set TEST_MONGODB_URI to a throwaway database to run the QA regression tests';
const HOUR = 60 * 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms);
let server;
let root;
let mongoose;
let db;
const ids = {};

before(async () => {
  if (skip) return;
  ({ default: mongoose } = await import('mongoose'));
  const bcrypt = (await import('bcryptjs')).default;
  const { createApp } = await import('../src/app.js');
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  db = mongoose.connection;
  const passwordHash = await bcrypt.hash('Passw0rd!', 4);
  const user = async (name, email, role) => (await db.collection('users').insertOne({ name, email, role, passwordHash, isActive: true, tokenVersion: 0 })).insertedId;
  ids.admin = await user('Ada Admin', 'ada@qa.dev', 'admin');
  ids.manager = await user('Max Manager', 'max@qa.dev', 'manager');
  ids.eveUser = await user('Eve Employee', 'eve@qa.dev', 'employee');
  ids.zedUser = await user('Zed Employee', 'zed@qa.dev', 'employee');
  await user('Lou Locked', 'lou@qa.dev', 'manager');
  const employee = async (userId, code) =>
    (await db.collection('employees').insertOne({ user: userId, employeeCode: code, manager: ids.manager, status: 'active', consent: {}, tracking: { state: 'stopped', changedBy: 'system', changedAt: new Date() } })).insertedId;
  ids.eve = await employee(ids.eveUser, 'EMP-001');
  ids.zed = await employee(ids.zedUser, 'EMP-002');
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  root = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  rmSync(screenshotDir, { recursive: true, force: true });
});

async function api(token, method, path, body, headers = {}) {
  const raw = Buffer.isBuffer(body);
  const response = await fetch(root + path, {
    method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body !== undefined && { 'Content-Type': raw ? 'image/jpeg' : 'application/json' }), ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, data, headers: response.headers, message: data?.error?.details?.[0]?.message ?? data?.error?.message };
}

async function login(email, headers) {
  const { status, data } = await api(null, 'POST', '/auth/login', { email, password: 'Passw0rd!' }, headers);
  assert.equal(status, 200, `sign in as ${email}`);
  return data.token;
}

const claims = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

test('sign-in and sessions', { skip }, async (t) => {
  await t.test('signing out ends the token at once', async () => {
    const token = await login('max@qa.dev');
    assert.equal((await api(token, 'GET', '/auth/me')).status, 200);
    assert.equal((await api(token, 'POST', '/auth/logout')).status, 204);
    const after = await api(token, 'GET', '/auth/me');
    assert.equal(after.status, 401);
    assert.equal(after.data.error.code, 'SESSION_ENDED');
  });

  await t.test('only employees get the desktop agent’s long sign-in', async () => {
    const admin = claims(await login('ada@qa.dev', { 'X-Client': 'agent' }));
    assert.equal(admin.exp - admin.iat, 3 * 24 * 3600, 'an admin with the agent header still gets the website lifetime');
    const employee = claims(await login('eve@qa.dev', { 'X-Client': 'agent' }));
    assert.equal(employee.exp - employee.iat, 30 * 24 * 3600);
  });

  await t.test('repeated wrong passwords are limited, per account', async () => {
    for (let i = 0; i < 10; i += 1) assert.equal((await api(null, 'POST', '/auth/login', { email: 'lou@qa.dev', password: 'Wrong123' })).status, 401);
    const limited = await api(null, 'POST', '/auth/login', { email: 'lou@qa.dev', password: 'Passw0rd!' });
    assert.equal(limited.status, 429, 'even the right password waits');
    assert.equal((await api(null, 'POST', '/auth/login', { email: 'eve@qa.dev', password: 'Passw0rd!' })).status, 200, 'other accounts are unaffected');
  });

  await t.test('a password reset closes the person’s recorded sessions', async () => {
    const admin = await login('ada@qa.dev');
    await login('eve@qa.dev');
    assert.ok(await db.collection('worksessions').countDocuments({ user: ids.eveUser, logoutAt: null }));
    assert.equal((await api(admin, 'POST', `/users/${ids.eveUser}/password`, { password: 'Temp2026x' })).status, 204);
    assert.equal(await db.collection('worksessions').countDocuments({ user: ids.eveUser, logoutAt: null }), 0);
    await db.collection('users').updateOne({ _id: ids.eveUser }, { $set: { passwordHash: (await db.collection('users').findOne({ _id: ids.zedUser })).passwordHash, mustChangePassword: false } });
  });

  await t.test('failed registrations don’t use up the address’s allowance', async () => {
    for (let i = 0; i < 11; i += 1) {
      assert.equal((await api(null, 'POST', '/auth/register', { organizationName: 'Dup', name: 'Dup', email: 'ada@qa.dev', password: 'Dup2026xx' })).status, 409);
    }
    assert.equal((await api(null, 'POST', '/auth/register', { organizationName: 'Fresh', name: 'Fresh Owner', email: 'fresh@qa.dev', password: 'Fresh2026x' })).status, 201);
  });
});

test('tasks', { skip }, async (t) => {
  const manager = await login('max@qa.dev');
  const eve = await login('eve@qa.dev');
  const create = (fields) => api(manager, 'POST', '/tasks', { title: 'QA task', assignedTo: String(ids.eve), ...fields });

  await t.test('a due date of null, 0 or an absurd year is refused, and null on edit removes it', async () => {
    for (const dueDate of [null, 0, false, '9999-01-01', 'not a date']) assert.equal((await create({ dueDate })).status, 400, `dueDate ${dueDate}`);
    const task = (await create({ dueDate: new Date(Date.now() + 48 * HOUR).toISOString() })).data.task;
    const cleared = await api(manager, 'PATCH', `/tasks/${task.id}`, { dueDate: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.data.task.dueDate, undefined);
    assert.equal(cleared.data.task.history.at(-1).text, 'Due date removed');
  });

  await t.test('employees can’t silently change what they don’t own, and logged time is capped', async () => {
    const task = (await create({ expectedMinutes: 60 })).data.task;
    const titled = await api(eve, 'PATCH', `/tasks/${task.id}`, { title: 'Renamed' });
    assert.equal(titled.status, 403);
    assert.match(titled.message, /title/);
    let logged;
    // Capped, not refused: the desktop agent re-sends refused time forever.
    for (let i = 0; i < 20; i += 1) logged = await api(eve, 'PATCH', `/tasks/${task.id}`, { actualMinutesDelta: 1440 });
    assert.equal(logged.status, 200);
    assert.equal(logged.data.task.actualMinutes, 320 * 60, 'logged time on one task is capped at 320 hours');
    assert.equal((await api(eve, 'PATCH', `/tasks/${task.id}`, { status: 'review', note: 'Done' })).status, 200);
    assert.equal((await api(manager, 'POST', `/tasks/${task.id}/review`, { decision: 'approve' })).status, 200);
    assert.equal((await api(eve, 'PATCH', `/tasks/${task.id}`, { status: 'in-progress' })).status, 409, 'approved work is closed');
  });

  await t.test('submitted work is decided, not moved or reassigned silently; reassignments are recorded', async () => {
    const task = (await create({})).data.task;
    await api(eve, 'PATCH', `/tasks/${task.id}`, { status: 'review' });
    assert.equal((await api(manager, 'PATCH', `/tasks/${task.id}`, { status: 'in-progress' })).status, 409, 'send back needs feedback');
    assert.equal((await api(manager, 'PATCH', `/tasks/${task.id}`, { assignedTo: String(ids.zed) })).status, 409);
    const open = (await create({})).data.task;
    const moved = await api(manager, 'PATCH', `/tasks/${open.id}`, { assignedTo: String(ids.zed) });
    assert.equal(moved.status, 200);
    assert.equal(moved.data.task.history.at(-1).text, 'Reassigned from Eve Employee to Zed Employee');
  });

  await t.test('on time is judged by submission, and submitted work is not the employee’s overdue work', async () => {
    const due = ago(2 * HOUR);
    const onTime = (await create({})).data.task;
    const waiting = (await create({})).data.task;
    const overdue = (await create({})).data.task;
    // Assigned 5 hours ago, due 2 hours ago.
    for (const task of [onTime, waiting, overdue]) await db.collection('tasks').updateOne({ _id: new mongoose.Types.ObjectId(task.id) }, { $set: { dueDate: due, createdAt: ago(5 * HOUR) } });
    // Handed in before the due date, approved after it.
    await db.collection('tasks').updateOne({ _id: new mongoose.Types.ObjectId(onTime.id) }, { $set: { status: 'done', submittedAt: ago(3 * HOUR), completedAt: ago(HOUR) } });
    await api(eve, 'PATCH', `/tasks/${waiting.id}`, { status: 'review' });
    const { data } = await api(manager, 'GET', `/agent/metrics?employeeId=${ids.eve}&period=week`);
    const tasks = data.metrics.current.tasks;
    assert.equal(tasks.late, 0);
    assert.ok(tasks.onTime >= 1);
    assert.deepEqual(tasks.evidence.overdue.map((item) => item.id), [overdue.id]);
    assert.deepEqual(tasks.evidence.reviewOverdue.map((item) => item.id), [waiting.id]);
  });
});

test('desktop agent uploads', { skip }, async (t) => {
  const zed = await login('zed@qa.dev', { 'X-Client': 'agent' });
  // Consent 3 hours ago; tracking active, then paused from 60 to 30 minutes ago, then active again.
  await db.collection('employees').updateOne(
    { _id: ids.zed },
    {
      $set: {
        consent: { version: 2, activity: true, keyboard: true, apps: true, screenshots: true, managerViewScreenshots: true, acceptedAt: ago(3 * HOUR) },
        cameraConsent: { given: true, mode: 'local', acceptedAt: ago(3 * HOUR) },
        tracking: { state: 'active', changedAt: ago(30 * 60 * 1000), changedBy: 'agent' },
        trackingHistory: [
          { state: 'active', previous: 'stopped', at: ago(2.5 * HOUR) },
          { state: 'paused', previous: 'active', at: ago(HOUR) },
          { state: 'active', previous: 'paused', at: ago(30 * 60 * 1000) }
        ]
      }
    }
  );
  const snapshot = (capturedAt, intervalSeconds = 300) => ({ capturedAt: capturedAt.toISOString(), intervalSeconds, activeSeconds: (intervalSeconds * 2) / 3, idleSeconds: intervalSeconds / 3 });
  const upload = (snapshots) => api(zed, 'POST', '/activity/snapshots', { snapshots }, { 'X-Client': 'agent' });

  await t.test('anything dated inside an earlier pause, before consent, or too long ago is discarded with a reason', async () => {
    const result = await upload([snapshot(ago(45 * 60 * 1000)), snapshot(ago(4 * HOUR)), snapshot(ago(10 * 24 * HOUR)), snapshot(ago(10 * 60 * 1000))]);
    assert.equal(result.status, 201);
    assert.equal(result.data.stored, 1, 'only the snapshot from after the resume');
    assert.deepEqual(result.data.discarded.map((item) => item.reason).sort(), [
      'It was captured before consent was given',
      'The capture time is more than 7 days ago',
      'Tracking was paused or stopped at that time'
    ]);
  });

  await t.test('overlapping snapshots are not counted twice, nor a batch sent twice at once', async () => {
    const start = ago(20 * 60 * 1000);
    const overlapping = await upload(Array.from({ length: 5 }, (_, i) => snapshot(new Date(start.getTime() + i * 1000))));
    assert.equal(overlapping.data.stored, 1);
    assert.equal(overlapping.data.discarded[0].reason, 'It overlaps time already recorded');
    const batch = [snapshot(ago(2 * 60 * 1000), 60)];
    const parallel = await Promise.all(Array.from({ length: 5 }, () => upload(batch)));
    assert.deepEqual(parallel.map((result) => `${result.status} ${result.message ?? ''}`.trim()), Array(5).fill('201'));
    assert.equal(parallel.reduce((sum, result) => sum + result.data.stored, 0), 1);
    assert.equal(await db.collection('activities').countDocuments({ employee: ids.zed, capturedAt: new Date(batch[0].capturedAt) }), 1);
  });

  await t.test('screenshots and camera observations follow the same rules; a re-sent observation is stored once', async () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64), Buffer.from([0xff, 0xd9])]);
    const paused = await api(zed, 'POST', '/screenshots', jpeg, { 'X-Captured-At': ago(45 * 60 * 1000).toISOString() });
    assert.equal(paused.status, 409);
    assert.match(paused.message, /paused/);
    assert.equal((await api(zed, 'POST', '/screenshots', jpeg, { 'X-Captured-At': ago(4 * HOUR).toISOString() })).status, 409, 'before consent');
    const stored = await api(zed, 'POST', '/screenshots', jpeg, { 'X-Captured-At': ago(5 * 60 * 1000).toISOString() });
    assert.equal(stored.status, 201);

    const observation = { observedAt: ago(5 * 60 * 1000).toISOString(), state: 'working_at_computer', source: 'local' };
    assert.equal((await api(zed, 'POST', '/camera/observations', { ...observation, observedAt: ago(45 * 60 * 1000).toISOString() })).status, 409);
    const results = await Promise.all(Array.from({ length: 4 }, () => api(zed, 'POST', '/camera/observations', observation)));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 200, 200, 201]);
    assert.equal(await db.collection('cameraobservations').countDocuments({ employee: ids.zed }), 1);
  });

  await t.test('withdrawing consent stops tracking', async () => {
    assert.equal((await api(zed, 'DELETE', '/consent')).status, 204);
    assert.equal((await api(zed, 'GET', '/tracking')).data.tracking.state, 'stopped');
  });
});

test('input checks and responses', { skip }, async (t) => {
  const admin = await login('ada@qa.dev');
  const manager = await login('max@qa.dev');

  await t.test('impossible calendar dates are refused instead of rolling over', async () => {
    for (const date of ['2026-13-45', '2026-02-30']) {
      assert.equal((await api(manager, 'GET', `/analysis/daily?employeeId=${ids.eve}&date=${date}`)).status, 400, date);
      assert.equal((await api(manager, 'GET', `/screenshots/team?employeeId=${ids.eve}&date=${date}`)).status, 400, date);
    }
  });

  await t.test('employee codes are unique per organization, ignoring case', async () => {
    const sameOrg = await api(admin, 'POST', '/employees', { name: 'Case Dup', email: 'case@qa.dev', password: 'Welcome123', employeeCode: 'emp-001' });
    assert.equal(sameOrg.status, 409);
    assert.match(sameOrg.message, /employee code is already in use/);
    const other = (await api(null, 'POST', '/auth/register', { organizationName: 'Other Co', name: 'Olga Owner', email: 'olga@qa.dev', password: 'Olga2026xx' })).data.token;
    assert.equal((await api(other, 'POST', '/employees', { name: 'Other Emp', email: 'other.emp@qa.dev', password: 'Welcome123', employeeCode: 'EMP-001' })).status, 201);
  });

  await t.test('an employee’s profile shows whether they are still on a temporary password', async () => {
    const created = await api(admin, 'POST', '/employees', { name: 'New Hire', email: 'new.hire@qa.dev', password: 'Welcome123', employeeCode: 'EMP-900', manager: String(ids.manager) });
    assert.equal((await api(admin, 'GET', `/employees/${created.data.employee.id}`)).data.employee.temporaryPassword, true);
  });

  await t.test('responses tell browsers not to guess content types', async () => {
    assert.equal((await api(null, 'GET', '/health')).headers.get('x-content-type-options'), 'nosniff');
  });
});

test('start-up index migration replaces old non-unique indexes without deleting data', { skip }, async () => {
  const { runMigrations } = await import('../src/config/migrations.js');
  const activities = db.collection('activities');
  await activities.dropIndex('employee_1_capturedAt_-1');
  await activities.createIndex({ employee: 1, capturedAt: -1 }, { name: 'employee_1_capturedAt_-1' });
  const employees = db.collection('employees');
  await employees.dropIndex('organization_1_employeeCode_1');
  // The old global index (created non-unique here: two organizations now share EMP-001, which it couldn't hold).
  await employees.createIndex({ employeeCode: 1 }, { name: 'employeeCode_1' });
  const before = await activities.countDocuments();

  await runMigrations();
  const activityIndex = (await activities.indexes()).find((index) => index.name === 'employee_1_capturedAt_-1');
  assert.equal(activityIndex.unique, true);
  const employeeIndexes = await employees.indexes();
  assert.ok(employeeIndexes.some((index) => index.name === 'organization_1_employeeCode_1' && index.unique));
  assert.ok(!employeeIndexes.some((index) => index.name === 'employeeCode_1'), 'the old global index is gone');
  assert.equal(await activities.countDocuments(), before);
  await runMigrations();
});
