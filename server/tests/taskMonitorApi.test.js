import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// GET /api/tasks/monitor through the real app and database: who sees which task's flags, and that nothing leaks across
// managers or organizations. Uses its own database next to TEST_MONGODB_URI's (test files run in parallel), which it empties.
const base = process.env.TEST_MONGODB_URI;
const uri = base && base.replace(/\/([^/?]+)(\?|$)/, '/$1_taskmonitor$2');
process.env.MONGODB_URI = uri ?? 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'x'.repeat(40);
delete process.env.ANTHROPIC_API_KEY;

const skip = uri ? false : 'set TEST_MONGODB_URI to a throwaway database to run the task monitor API test';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
let server;
let root;
let mongoose;
let models;
const people = {};
const tasks = {};

before(async () => {
  if (skip) return;
  ({ default: mongoose } = await import('mongoose'));
  const bcrypt = (await import('bcryptjs')).default;
  const { createApp } = await import('../src/app.js');
  models = {
    ...(await import('../src/models/User.js')),
    ...(await import('../src/models/Employee.js')),
    ...(await import('../src/models/Organization.js')),
    ...(await import('../src/models/Task.js'))
  };
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const passwordHash = await bcrypt.hash('Passw0rd!', 4);
  const user = (name, role, organization) =>
    models.User.create({ name, email: `${name.split(' ')[0].toLowerCase()}@monitor.dev`, passwordHash, role, ...(organization && { organization }) });
  // Original organization: one admin, two managers. Mina has Eve and the deactivated Ivy, Omar has Sam.
  people.ada = await user('Ada Admin', 'admin');
  people.mina = await user('Mina Manager', 'manager');
  people.omar = await user('Omar Manager', 'manager');
  people.eveUser = await user('Eve Employee', 'employee');
  people.samUser = await user('Sam Employee', 'employee');
  people.ivyUser = await user('Ivy Employee', 'employee');
  people.eve = await models.Employee.create({ user: people.eveUser._id, employeeCode: 'E-1', manager: people.mina._id });
  people.sam = await models.Employee.create({ user: people.samUser._id, employeeCode: 'E-2', manager: people.omar._id });
  people.ivy = await models.Employee.create({ user: people.ivyUser._id, employeeCode: 'E-3', manager: people.mina._id, status: 'inactive' });
  // A second organization.
  const org = await models.Organization.create({ name: 'Other Org' });
  people.bea = await user('Bea Admin', 'admin', org._id);
  people.bobUser = await user('Bob Employee', 'employee', org._id);
  people.bob = await models.Employee.create({ user: people.bobUser._id, organization: org._id, employeeCode: 'E-1' });

  const now = Date.now();
  const at = (offset) => new Date(now + offset);
  const make = (title, fields) => ({
    _id: new mongoose.Types.ObjectId(),
    title,
    description: 'secret description',
    createdBy: people.mina._id,
    status: 'todo',
    priority: 'medium',
    expectedMinutes: 60,
    actualMinutes: 0,
    createdAt: at(-10 * DAY),
    updatedAt: at(-HOUR),
    history: [],
    ...fields
  });
  const list = {
    eveOverdue: make('Eve overdue', { assignedTo: people.eve._id, status: 'in-progress', dueDate: at(-2 * DAY) }),
    eveReview: make('Eve waiting for review', { assignedTo: people.eve._id, status: 'review', submittedAt: at(-5 * DAY), dueDate: at(-4 * DAY) }),
    // Stored directly, as only a bad import could: the schema refuses negative time.
    eveBadTime: make('Eve bad time', { assignedTo: people.eve._id, dueDate: at(9 * DAY), actualMinutes: -3 }),
    eveCrossOrg: make('Eve cross org', { assignedTo: people.eve._id, createdBy: people.bea._id, dueDate: at(9 * DAY) }),
    eveHealthy: make('Eve healthy', { assignedTo: people.eve._id, dueDate: at(9 * DAY) }),
    ivyOpen: make('Ivy open', { assignedTo: people.ivy._id, dueDate: at(9 * DAY) }),
    samOverdue: make('Sam overdue', { assignedTo: people.sam._id, createdBy: people.omar._id, dueDate: at(-DAY) }),
    bobOverdue: make('Bob overdue', { assignedTo: people.bob._id, createdBy: people.bea._id, dueDate: at(-DAY) }),
    adaOrphan: make('Ada orphan', { assignedTo: new mongoose.Types.ObjectId(), createdBy: people.ada._id, dueDate: at(9 * DAY) }),
    beaOrphan: make('Bea orphan', { assignedTo: new mongoose.Types.ObjectId(), createdBy: people.bea._id, dueDate: at(9 * DAY) })
  };
  await models.Task.collection.insertMany(Object.values(list));
  for (const [key, value] of Object.entries(list)) tasks[key] = String(value._id);

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

const taskIds = (data) => [...new Set(data.flags.map((flag) => flag.taskId))].sort();
const named = (...keys) => keys.map((key) => tasks[key]).sort();
const rulesFor = (data, key) => data.flags.filter((flag) => flag.taskId === tasks[key]).map((flag) => flag.rule).sort();

test('GET /tasks/monitor: scope, contents and no leakage', { skip }, async (t) => {
  const tokens = {};
  for (const name of ['ada', 'mina', 'omar', 'eve', 'bea', 'bob']) tokens[name] = await login(`${name}@monitor.dev`);
  const monitor = (who, query = '') => api(tokens[who], `/tasks/monitor${query}`);
  const of = (employee) => `?employeeId=${people[employee]._id}`;

  await t.test('needs a signed-in user', async () => {
    assert.equal((await api(null, '/tasks/monitor')).status, 401);
  });

  await t.test('"monitor" is routed to the monitor, not read as a task id', async () => {
    const { status, data } = await monitor('mina');
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.flags));
    assert.equal(data.thresholds.stalledDays, 4);
  });

  await t.test("a manager sees their own team's flags, with the evidence", async () => {
    const { data } = await monitor('mina');
    assert.equal(data.scope, 'team');
    assert.deepEqual(taskIds(data), named('eveOverdue', 'eveReview', 'eveBadTime', 'eveCrossOrg', 'ivyOpen'));
    assert.deepEqual(rulesFor(data, 'eveOverdue'), ['overdue']);
    assert.deepEqual(rulesFor(data, 'eveReview'), ['review-waiting']);
    assert.deepEqual(rulesFor(data, 'eveBadTime'), ['invalid-time-logged']);
    assert.deepEqual(rulesFor(data, 'eveCrossOrg'), ['organization-mismatch']);
    assert.deepEqual(rulesFor(data, 'ivyOpen'), ['assignee-inactive']);
    const overdue = data.flags.find((flag) => flag.rule === 'overdue');
    assert.equal(overdue.taskTitle, 'Eve overdue');
    assert.equal(overdue.assigneeName, 'Eve Employee');
    assert.equal(overdue.employeeId, String(people.eve._id));
    assert.ok(overdue.evidence.daysLate >= 2 && overdue.evidence.daysLate < 2.1);
    assert.equal(data.flags.find((flag) => flag.rule === 'review-waiting').evidence.submittedOnTime, true);
    assert.equal(data.summary.tasksChecked, 6, "Eve's five tasks and Ivy's one");
    assert.equal(data.summary.flaggedTasks, 5);
    assert.ok(!JSON.stringify(data).includes('secret description'), 'descriptions are never sent');
    assert.ok(!JSON.stringify(data).includes(String(people.bea._id)), "the other organization's creator is not named");
  });

  await t.test("a manager can't reach another manager's or organization's employees", async () => {
    assert.equal((await monitor('mina', of('sam'))).status, 404);
    assert.equal((await monitor('mina', of('bob'))).status, 404);
    assert.equal((await monitor('omar', of('eve'))).status, 404);
    const omar = await monitor('omar');
    assert.deepEqual(taskIds(omar.data), named('samOverdue'));
    const one = await monitor('mina', of('eve'));
    assert.equal(one.data.scope, 'employee');
    assert.deepEqual(taskIds(one.data), named('eveOverdue', 'eveReview', 'eveBadTime', 'eveCrossOrg'));
  });

  await t.test('admins see their own organization, including tasks whose assignee no longer exists', async () => {
    const ada = await monitor('ada');
    assert.equal(ada.data.scope, 'organization');
    assert.deepEqual(taskIds(ada.data), named('eveOverdue', 'eveReview', 'eveBadTime', 'eveCrossOrg', 'ivyOpen', 'samOverdue', 'adaOrphan'));
    assert.deepEqual(rulesFor(ada.data, 'adaOrphan'), ['assignee-missing']);
    assert.equal((await monitor('ada', of('bob'))).status, 404);

    const bea = await monitor('bea');
    assert.deepEqual(taskIds(bea.data), named('bobOverdue', 'beaOrphan'), "Bea created Eve's cross-org task but can't see Eve's work");
    assert.equal((await monitor('bea', of('eve'))).status, 404);
  });

  await t.test('employees get only their own tasks, without the record checks', async () => {
    const eve = await monitor('eve');
    assert.equal(eve.status, 200);
    assert.equal(eve.data.scope, 'own');
    assert.deepEqual(taskIds(eve.data), named('eveOverdue', 'eveReview'));
    assert.ok(eve.data.flags.every((flag) => flag.attention !== 'admin'));
    const review = eve.data.flags.find((flag) => flag.rule === 'review-waiting');
    assert.equal(review.attention, 'reviewer', 'shown as the reviewer’s step, not as overdue work');

    const tampered = await monitor('eve', of('sam'));
    assert.deepEqual(taskIds(tampered.data), named('eveOverdue', 'eveReview'), 'another employeeId is ignored');
    const bob = await monitor('bob', of('eve'));
    assert.deepEqual(taskIds(bob.data), named('bobOverdue'));
  });

  await t.test('validation', async () => {
    const bad = await monitor('mina', '?employeeId=nope');
    assert.equal(bad.status, 400);
  });

  await t.test('reading the monitor writes nothing', async () => {
    const before = await models.Task.collection.find({}).toArray();
    await monitor('ada');
    const after = await models.Task.collection.find({}).toArray();
    assert.deepEqual(after, before);
  });
});
