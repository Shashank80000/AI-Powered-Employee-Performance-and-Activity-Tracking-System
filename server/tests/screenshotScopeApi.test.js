import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// Screenshots are kept apart per employee: a list only ever holds the chosen person's screenshots, managers only reach
// their own team, admins only their own organization. Uses its own database next to TEST_MONGODB_URI's, which it empties.
const base = process.env.TEST_MONGODB_URI;
const uri = base && base.replace(/\/([^/?]+)(\?|$)/, '/$1_shotscope$2');
process.env.MONGODB_URI = uri ?? 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'x'.repeat(40);
delete process.env.ANTHROPIC_API_KEY;

const skip = uri ? false : 'set TEST_MONGODB_URI to a throwaway database to run the screenshot scope test';
let server;
let root;
let mongoose;
let today;
const people = {};
const shots = {};
const tokens = {};

before(async () => {
  if (skip) return;
  ({ default: mongoose } = await import('mongoose'));
  const bcrypt = (await import('bcryptjs')).default;
  const { createApp } = await import('../src/app.js');
  const dates = await import('../src/utils/dateUtils.js');
  const { User } = await import('../src/models/User.js');
  const { Employee } = await import('../src/models/Employee.js');
  const { Organization } = await import('../src/models/Organization.js');
  const { Screenshot } = await import('../src/models/Screenshot.js');
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const passwordHash = await bcrypt.hash('Passw0rd!', 4);
  const user = (name, role, organization) =>
    User.create({ name, email: `${name.split(' ')[0].toLowerCase()}@scope.dev`, passwordHash, role, ...(organization && { organization }) });
  people.admin = await user('Ada Admin', 'admin');
  people.mina = await user('Mina Manager', 'manager');
  people.omar = await user('Omar Manager', 'manager');
  people.eve = await Employee.create({ user: (await user('Eve Employee', 'employee'))._id, employeeCode: 'E-1', manager: people.mina._id });
  people.sam = await Employee.create({ user: (await user('Sam Employee', 'employee'))._id, employeeCode: 'E-2', manager: people.mina._id });
  people.tom = await Employee.create({ user: (await user('Tom Employee', 'employee'))._id, employeeCode: 'E-3', manager: people.omar._id });
  const org = await Organization.create({ name: 'Other Org' });
  people.bea = await user('Bea Admin', 'admin', org._id);

  const day = dates.startOfDay();
  today = dates.toDateKey(day);
  const shot = (employee, minutes) => ({ employee: employee._id, capturedAt: new Date(day.getTime() + minutes * 60000), bytes: 1, consentVersion: 2 });
  // Interleaved capture times, so a list that mixed people would show it.
  const created = await Screenshot.insertMany([shot(people.eve, 600), shot(people.sam, 601), shot(people.eve, 605), shot(people.tom, 606), shot(people.sam, 610)]);
  for (const name of ['eve', 'sam', 'tom']) shots[name] = created.filter((s) => s.employee.equals(people[name]._id)).map((s) => s._id.toString());

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  root = `http://127.0.0.1:${server.address().port}/api`;
  people.eveUserEmail = 'eve@scope.dev';
  for (const name of ['admin', 'mina', 'omar', 'bea', 'eveLogin']) {
    const response = await fetch(`${root}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: name === 'eveLogin' ? people.eveUserEmail : `${people[name].name.split(' ')[0].toLowerCase()}@scope.dev`, password: 'Passw0rd!' }) });
    tokens[name] = (await response.json()).token;
  }
});

after(async () => {
  if (skip) return;
  server?.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function list(who, employee) {
  const response = await fetch(`${root}/screenshots/team?employeeId=${employee._id}&date=${today}`, { headers: { Authorization: `Bearer ${tokens[who]}` } });
  return { status: response.status, ids: response.ok ? (await response.json()).screenshots.map((s) => s.id) : null };
}

test('a manager sees each team member separately, and nobody outside the team', { skip }, async () => {
  assert.deepEqual(await list('mina', people.eve), { status: 200, ids: shots.eve });
  assert.deepEqual(await list('mina', people.sam), { status: 200, ids: shots.sam });
  assert.equal((await list('mina', people.tom)).status, 404);
  assert.deepEqual(await list('omar', people.tom), { status: 200, ids: shots.tom });
  assert.equal((await list('omar', people.eve)).status, 404);
});

test('an admin sees each employee separately, and nobody from another organization', { skip }, async () => {
  for (const name of ['eve', 'sam', 'tom']) assert.deepEqual(await list('admin', people[name]), { status: 200, ids: shots[name] });
  for (const name of ['eve', 'sam', 'tom']) assert.equal((await list('bea', people[name])).status, 404);
});

test("a manager can't open another team's screenshot image by id", { skip }, async () => {
  const response = await fetch(`${root}/screenshots/team/${shots.tom[0]}/image`, { headers: { Authorization: `Bearer ${tokens.mina}` } });
  assert.equal(response.status, 404);
});

async function asEmployee(method, path) {
  const response = await fetch(root + path, { method, headers: { Authorization: `Bearer ${tokens.eveLogin}` } });
  const body = response.headers.get('content-type')?.includes('json') ? await response.json() : null;
  return { status: response.status, body };
}

test('an employee only ever gets their own screenshots', { skip }, async () => {
  assert.ok(tokens.eveLogin, 'employee signed in');
  // Their own list holds only their screenshots, even when another person's id is passed.
  for (const query of [`?date=${today}`, `?date=${today}&employeeId=${people.sam._id}`]) {
    const own = await asEmployee('GET', `/screenshots${query}`);
    assert.equal(own.status, 200);
    assert.deepEqual(own.body.screenshots.map((s) => s.id), shots.eve);
  }
  // The team views are closed to employees.
  assert.equal((await asEmployee('GET', `/screenshots/team?employeeId=${people.sam._id}&date=${today}`)).status, 403);
  assert.equal((await asEmployee('GET', `/screenshots/team/${shots.sam[0]}/image`)).status, 403);
  // Another person's screenshot can't be opened or deleted by id, whether in the same team or not.
  for (const id of [shots.sam[0], shots.tom[0]]) {
    assert.equal((await asEmployee('GET', `/screenshots/${id}/image`)).status, 404);
    assert.equal((await asEmployee('DELETE', `/screenshots/${id}`)).status, 404);
  }
  const { Screenshot } = await import('../src/models/Screenshot.js');
  assert.equal(await Screenshot.countDocuments({ _id: { $in: [shots.sam[0], shots.tom[0]] } }), 2, 'nothing was deleted');
});

test("an employee can't read another employee's daily analysis", { skip }, async () => {
  const { DailyAnalysis } = await import('../src/models/DailyAnalysis.js');
  const { dayStart } = await import('../src/utils/dateUtils.js');
  await DailyAnalysis.create({ employee: people.sam._id, date: dayStart(today), summary: "Sam's day" });
  const response = await asEmployee('GET', `/analysis/daily?employeeId=${people.sam._id}&date=${today}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.dailyAnalysis, null, "the employee's own (empty) day, never Sam's");
});
