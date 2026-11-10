import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// GET /api/reports/overview through the real app and database: who may read whose report, and that the numbers come
// from the stored records. Uses its own database next to TEST_MONGODB_URI's (test files run in parallel), which it empties.
const base = process.env.TEST_MONGODB_URI;
const uri = base && base.replace(/\/([^/?]+)(\?|$)/, '/$1_overview$2');
process.env.MONGODB_URI = uri ?? 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'x'.repeat(40);
delete process.env.ANTHROPIC_API_KEY;

const skip = uri ? false : 'set TEST_MONGODB_URI to a throwaway database to run the employee report API test';
const HOUR = 60 * 60 * 1000;
let server;
let root;
let mongoose;
let models;
let dates;
const people = {};

before(async () => {
  if (skip) return;
  ({ default: mongoose } = await import('mongoose'));
  const bcrypt = (await import('bcryptjs')).default;
  const { createApp } = await import('../src/app.js');
  dates = await import('../src/utils/dateUtils.js');
  models = {
    ...(await import('../src/models/User.js')),
    ...(await import('../src/models/Employee.js')),
    ...(await import('../src/models/Organization.js')),
    ...(await import('../src/models/Task.js')),
    ...(await import('../src/models/Performance.js')),
    ...(await import('../src/models/DailyAnalysis.js')),
    ...(await import('../src/models/WorkSession.js'))
  };
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const passwordHash = await bcrypt.hash('Passw0rd!', 4);
  const user = (name, role, organization) =>
    models.User.create({ name, email: `${name.split(' ')[0].toLowerCase()}@overview.dev`, passwordHash, role, ...(organization && { organization }) });
  // Original organization (no organization field): one admin, two managers with one employee each.
  people.admin = await user('Ada Admin', 'admin');
  people.mina = await user('Mina Manager', 'manager');
  people.omar = await user('Omar Manager', 'manager');
  people.eveUser = await user('Eve Employee', 'employee');
  people.samUser = await user('Sam Employee', 'employee');
  people.eve = await models.Employee.create({ user: people.eveUser._id, employeeCode: 'E-1', manager: people.mina._id, designation: 'Developer' });
  people.sam = await models.Employee.create({ user: people.samUser._id, employeeCode: 'E-2', manager: people.omar._id });
  // A second organization with its own admin and employee.
  const org = await models.Organization.create({ name: 'Other Org' });
  people.bea = await user('Bea Admin', 'admin', org._id);
  people.bobUser = await user('Bob Employee', 'employee', org._id);
  people.bob = await models.Employee.create({ user: people.bobUser._id, organization: org._id, employeeCode: 'E-1' });

  const today = dates.startOfDay();
  const day = (offset) => dates.addDays(today, offset);
  const hours = (n) => n * 3600;
  await models.Performance.insertMany([
    { employee: people.eve._id, date: day(-1), activeSeconds: hours(3), idleSeconds: hours(1), productiveAppSeconds: hours(2), productivityScore: 70 },
    { employee: people.eve._id, date: day(-2), activeSeconds: hours(2), idleSeconds: hours(2), productiveAppSeconds: hours(1), productivityScore: 50 },
    { employee: people.sam._id, date: day(-1), activeSeconds: hours(8), idleSeconds: 0, productivityScore: 99 },
    { employee: people.bob._id, date: day(-1), activeSeconds: hours(8), idleSeconds: 0, productivityScore: 99 }
  ]);
  await models.DailyAnalysis.create({
    employee: people.eve._id,
    date: day(-1),
    screenshotCount: 10,
    analyzedCount: 10,
    categoryMinutes: { coding: 120, entertainment: 30 },
    productiveMinutes: 120,
    camera: { observationCount: 6, stateMinutes: { working_at_computer: 40, away_from_desk: 20 }, atDeskMinutes: 40, awayMinutes: 20 },
    summary: 'Mostly coding.'
  });
  const at = (offsetHours) => new Date(day(-1).getTime() + offsetHours * HOUR);
  const eveTask = (title, fields) => ({ title, assignedTo: people.eve._id, createdBy: people.mina._id, priority: 'medium', expectedMinutes: 60, actualMinutes: 0, createdAt: day(-5), updatedAt: day(-1), history: [], ...fields });
  await models.Task.collection.insertMany([
    eveTask('On time', { status: 'done', dueDate: at(17), submittedAt: at(10), completedAt: at(12), actualMinutes: 70 }),
    eveTask('Late', {
      status: 'done',
      dueDate: at(-24),
      submittedAt: at(9),
      completedAt: at(11),
      actualMinutes: 80,
      history: [
        { author: people.mina._id, authorName: 'Mina Manager', authorRole: 'manager', kind: 'changes-requested', text: 'Add tests', createdAt: at(-30) },
        { author: people.eveUser._id, authorName: 'Eve Employee', authorRole: 'employee', kind: 'submitted', createdAt: at(9) }
      ]
    }),
    eveTask('Overdue', { status: 'in-progress', dueDate: day(-2) })
  ]);
  await models.Task.create({ title: 'Sam task', assignedTo: people.sam._id, createdBy: people.omar._id, status: 'todo', dueDate: day(-1) });
  await models.WorkSession.create({ user: people.eveUser._id, employee: people.eve._id, client: 'web', loginAt: at(8), logoutAt: at(16) });

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  root = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function api(token, path) {
  const response = await fetch(root + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: response.status, data: await response.json().catch(() => null) };
}

async function login(email) {
  const response = await fetch(`${root}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Passw0rd!' }) });
  assert.equal(response.status, 200, `sign in as ${email}`);
  return (await response.json()).token;
}

test('GET /reports/overview: scope and contents', { skip }, async (t) => {
  const tokens = {};
  for (const name of ['ada', 'mina', 'omar', 'eve', 'bea', 'bob']) tokens[name] = await login(`${name}@overview.dev`);
  const overview = (who, query = '') => api(tokens[who], `/reports/overview${query}`);
  const of = (employee, extra = '') => `?employeeId=${people[employee]._id}${extra}`;

  await t.test('needs a signed-in user', async () => {
    assert.equal((await api(null, `/reports/overview${of('eve')}`)).status, 401);
  });

  await t.test("a manager reads their own employee's report, built from the stored records", async () => {
    const { status, data } = await overview('mina', of('eve'));
    assert.equal(status, 200);
    assert.equal(data.employee.name, 'Eve Employee');
    assert.equal(data.employee.designation, 'Developer');
    assert.equal(data.period, 'week');
    assert.equal(data.range.days, 7);

    assert.equal(data.activity.available, true);
    assert.equal(data.activity.daysTracked, 2);
    assert.equal(data.activity.activeHours, 5);
    assert.equal(data.activity.idleHours, 3);
    assert.equal(data.activity.productivityScore, 60, 'average of the tracked days, as on the dashboard');

    assert.equal(data.screen.available, true);
    assert.equal(data.screen.observedMinutes, 150);
    assert.equal(data.screen.productiveShare, 80);
    assert.deepEqual(data.screen.categories.map((c) => c.category), ['coding', 'entertainment']);

    assert.equal(data.camera.available, true);
    assert.equal(data.camera.atDeskMinutes, 40);
    assert.equal(data.camera.awayMinutes, 20);

    assert.equal(data.tasks.completed, 2);
    assert.equal(data.tasks.onTime, 1);
    assert.equal(data.tasks.late, 1);
    assert.equal(data.tasks.overdue, 1);
    assert.equal(data.tasks.review.changesRequested, 1);
    assert.equal(data.tasks.review.approvedFirstTime, 1);
    assert.deepEqual(data.tasks.effort, { tasksWithTime: 2, completedWithoutTime: 0, expectedMinutes: 120, actualMinutes: 150, actualVsExpected: 125 });
    assert.equal(data.tasks.evidence.overdue[0].title, 'Overdue');

    assert.ok(data.sessions.closed >= 1);
    assert.ok(data.sessions.recordedHours >= 8);
    assert.equal(data.trend.length, 7);
    assert.ok(data.observations.some((o) => o.id === 'tasks.overdue' && o.basis.overdue === 1));
    assert.match(data.disclaimer, /no AI is involved/);
  });

  await t.test("a manager can't read another manager's employee", async () => {
    assert.equal((await overview('mina', of('sam'))).status, 404);
    assert.equal((await overview('omar', of('eve'))).status, 404);
  });

  await t.test('admins see their own organization only', async () => {
    assert.equal((await overview('ada', of('eve'))).status, 200);
    assert.equal((await overview('ada', of('sam'))).status, 200);
    assert.equal((await overview('ada', of('bob'))).status, 404, 'org 1 admin, org 2 employee');
    assert.equal((await overview('bea', of('eve'))).status, 404, 'org 2 admin, org 1 employee');
    const own = await overview('bea', of('bob'));
    assert.equal(own.status, 200);
    assert.equal(own.data.employee.name, 'Bob Employee');
  });

  await t.test('employees only ever get their own report', async () => {
    const own = await overview('eve');
    assert.equal(own.status, 200);
    assert.equal(own.data.employee.name, 'Eve Employee');
    const tampered = await overview('eve', of('sam'));
    assert.equal(tampered.status, 200);
    assert.equal(tampered.data.employee.name, 'Eve Employee', 'another employeeId is ignored');
    const otherOrg = await overview('bob', of('eve'));
    assert.equal(otherOrg.data.employee.name, 'Bob Employee');
    assert.equal(otherOrg.data.activity.activeHours, 8);
  });

  await t.test('periods and validation', async () => {
    const month = await overview('mina', of('eve', '&period=month'));
    assert.equal(month.status, 200);
    assert.equal(month.data.range.days, 30);

    const yesterday = dates.toDateKey(dates.addDays(dates.startOfDay(), -1));
    const custom = await overview('mina', of('eve', `&from=${yesterday}&to=${yesterday}`));
    assert.equal(custom.status, 200);
    assert.equal(custom.data.period, 'custom');
    assert.deepEqual(custom.data.range, { start: yesterday, end: yesterday, days: 1 });
    assert.equal(custom.data.activity.activeHours, 3);

    assert.equal((await overview('mina')).status, 400, 'managers must choose an employee');
    assert.equal((await overview('mina', '?employeeId=not-an-id')).status, 400);
    assert.equal((await overview('mina', of('eve', '&period=year'))).status, 400);
    assert.equal((await overview('mina', of('eve', `&from=${yesterday}`))).status, 400);
    assert.equal((await overview('mina', of('eve', '&from=2026-10-07&to=2026-10-01'))).status, 400);
    assert.equal((await overview('mina', of('eve', '&from=2024-01-01&to=2026-01-01'))).status, 400);
    assert.equal((await overview('mina', of('eve', '&from=2026-02-30&to=2026-03-01'))).status, 400);
  });

  await t.test('stored reports still resolve by id', async () => {
    assert.equal((await api(tokens.mina, '/reports/0123456789abcdef01234567')).status, 404);
  });
});
