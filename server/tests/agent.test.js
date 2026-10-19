import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// End-to-end check of the AI agent API and sign-in/sign-out recording, through the real API and database.
// Uses its own database next to TEST_MONGODB_URI's (test files run in parallel), which it empties.
// Runs without an Anthropic key, so answers come from the rule-based fallback and nothing is sent to a model.
const uri = process.env.TEST_MONGODB_URI?.replace(/\/([^/?]+)(\?|$)/, '/$1_agent$2');
process.env.MONGODB_URI = uri ?? 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'x'.repeat(40);
process.env.AGENT_RATE_LIMIT_PER_HOUR = '20';
delete process.env.ANTHROPIC_API_KEY;

const skip = uri ? false : 'set TEST_MONGODB_URI to a throwaway database to run the agent API test';
const DAY_MS = 24 * 60 * 60 * 1000;
let server;
let base;
let mongoose;
let models;
const people = {};

before(async () => {
  if (skip) return;
  ({ default: mongoose } = await import('mongoose'));
  const bcrypt = (await import('bcryptjs')).default;
  const { createApp } = await import('../src/app.js');
  models = {
    ...(await import('../src/models/User.js')),
    ...(await import('../src/models/Employee.js')),
    ...(await import('../src/models/Task.js')),
    ...(await import('../src/models/WorkSession.js')),
    ...(await import('../src/models/AgentRun.js'))
  };
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const passwordHash = await bcrypt.hash('Passw0rd!', 4);
  const user = (name, role) => models.User.create({ name, email: `${name.split(' ')[0].toLowerCase()}@test.dev`, passwordHash, role });
  people.admin = await user('Ada Admin', 'admin');
  people.mina = await user('Mina Manager', 'manager');
  people.omar = await user('Omar Manager', 'manager');
  people.eveUser = await user('Eve Employee', 'employee');
  people.samUser = await user('Sam Employee', 'employee');
  people.eve = await models.Employee.create({ user: people.eveUser._id, employeeCode: 'E-1', manager: people.mina._id });
  people.sam = await models.Employee.create({ user: people.samUser._id, employeeCode: 'E-2', manager: people.omar._id });

  // Eve's tasks, written straight to the collection (as an import would) so inconsistent records are possible.
  const now = Date.now();
  const ago = (days) => new Date(now - days * DAY_MS);
  const eveTask = (title, fields) => ({ title, assignedTo: people.eve._id, createdBy: people.mina._id, priority: 'medium', createdAt: ago(5), updatedAt: ago(1), history: [], ...fields });
  await models.Task.collection.insertMany([
    eveTask('On time', { status: 'done', dueDate: ago(1), completedAt: ago(2) }),
    eveTask('Late', { status: 'done', dueDate: ago(3), completedAt: ago(2) }),
    eveTask('Overdue', { status: 'todo', dueDate: ago(1) }),
    eveTask('Waiting for review', { status: 'review', dueDate: ago(-5) }),
    eveTask('No deadline', { status: 'in-progress' }),
    eveTask('Done without time', { status: 'done', dueDate: ago(2) }),
    eveTask('Entered twice', { status: 'todo', dueDate: ago(-10) }),
    eveTask('Entered twice', { status: 'todo', dueDate: ago(-10) })
  ]);
  await models.Task.create({ title: 'Sam task', assignedTo: people.sam._id, createdBy: people.omar._id, status: 'todo', dueDate: ago(1) });

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (skip) return;
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function api(token, method, path, body, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }), ...headers },
    body: body && JSON.stringify(body)
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data };
}

async function login(email, headers) {
  const { status, data } = await api(null, 'POST', '/auth/login', { email, password: 'Passw0rd!' }, headers);
  assert.equal(status, 200, `sign in as ${email}`);
  return data.token;
}

const sessionIdOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sid;

test('AI agent API: sessions, permissions, metrics and fallback', { skip }, async (t) => {
  let eve;
  let mina;
  let admin;
  let eveRunId;

  await t.test('signing in records a session and signing out closes it', async () => {
    eve = await login('eve@test.dev');
    const session = await models.WorkSession.findById(sessionIdOf(eve)).lean();
    assert.equal(session.client, 'web');
    assert.equal(String(session.employee), String(people.eve._id));
    assert.equal(session.logoutAt, undefined);

    assert.equal((await api(eve, 'POST', '/auth/logout')).status, 204);
    const closed = await models.WorkSession.findById(sessionIdOf(eve)).lean();
    assert.ok(closed.logoutAt >= closed.loginAt);

    const agentToken = await login('eve@test.dev', { 'X-Client': 'agent' });
    assert.equal((await models.WorkSession.findById(sessionIdOf(agentToken)).lean()).client, 'agent');
    assert.equal((await api(null, 'POST', '/auth/logout')).status, 401, 'signing out needs a token');

    eve = await login('eve@test.dev');
    mina = await login('mina@test.dev');
    admin = await login('ada@test.dev');
    assert.equal((await models.WorkSession.findById(sessionIdOf(mina)).lean()).employee, undefined, 'managers have no employee profile');
  });

  await t.test('changing the password keeps the same session', async () => {
    const changed = await api(eve, 'POST', '/auth/password', { currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd!' });
    assert.equal(changed.status, 200);
    assert.equal(sessionIdOf(changed.data.token), sessionIdOf(eve));
    eve = changed.data.token;
  });

  await t.test('unauthenticated requests are refused', async () => {
    assert.equal((await api(null, 'GET', '/agent/status')).status, 401);
    assert.equal((await api(null, 'POST', '/agent/insights', {})).status, 401);
    assert.equal((await api('not-a-token', 'GET', '/agent/metrics')).status, 401);
  });

  await t.test('employees only ever get their own data', async () => {
    assert.equal((await api(eve, 'POST', '/agent/insights', { scope: 'team' })).status, 403);
    const tampered = await api(eve, 'POST', '/agent/insights', { employeeId: String(people.sam._id) });
    assert.equal(tampered.status, 201);
    assert.deepEqual(tampered.data.subjects.map((s) => s.name), ['Eve Employee'], 'another employeeId is ignored');
    const viaQuery = await api(eve, 'GET', `/agent/metrics?employeeId=${people.sam._id}`);
    assert.deepEqual(viaQuery.data.subjects.map((s) => s.name), ['Eve Employee']);
    eveRunId = tampered.data.runId;
  });

  await t.test('managers only see their own team', async () => {
    assert.equal((await api(mina, 'POST', '/agent/insights', { employeeId: String(people.sam._id) })).status, 404);
    assert.equal((await api(mina, 'GET', `/agent/metrics?employeeId=${people.sam._id}`)).status, 404);
    const team = await api(mina, 'POST', '/agent/insights', { scope: 'team' });
    assert.deepEqual(team.data.subjects.map((s) => s.name), ['Eve Employee']);
    assert.ok(team.data.facts.every((fact) => !fact.id.startsWith('E-2/')), 'no facts about another team');
    const everyone = await api(admin, 'POST', '/agent/insights', { scope: 'team' });
    assert.deepEqual(everyone.data.subjects.map((s) => s.name).sort(), ['Eve Employee', 'Sam Employee']);
  });

  await t.test('invalid input is rejected with clear errors', async () => {
    assert.equal((await api(mina, 'POST', '/agent/insights', { employeeId: 'abc' })).status, 400);
    const missing = await api(mina, 'POST', '/agent/insights', {});
    assert.equal(missing.status, 400);
    assert.match(missing.data.error.message, /Choose an employee/);
    assert.equal((await api(mina, 'POST', '/agent/insights', { employeeId: String(people.eve._id), question: 'x'.repeat(501) })).status, 400);
    assert.equal((await api(mina, 'POST', '/agent/insights', { employeeId: String(people.eve._id), period: 'year' })).status, 400);
  });

  await t.test('metrics are calculated from the records and problems are reported', async () => {
    const { status, data } = await api(mina, 'GET', `/agent/metrics?employeeId=${people.eve._id}&period=week`);
    assert.equal(status, 200);
    const tasks = data.metrics.current.tasks;
    // 8 tasks; "Done without time" can't be placed in a period, so 7 are measurable.
    assert.equal(tasks.excludedFromRates, 1);
    assert.equal(tasks.workload, 7);
    assert.equal(tasks.completed, 2);
    assert.equal(tasks.completionRate, 28.6);
    assert.equal(tasks.pending, 5);
    assert.equal(tasks.overdue, 1);
    assert.equal(tasks.inReview, 1);
    assert.equal(tasks.noDeadline, 1);
    assert.equal(tasks.onTime, 1);
    assert.equal(tasks.late, 1);
    assert.equal(tasks.onTimeRate, 50);
    const codes = data.dataQuality.map((issue) => issue.code).sort();
    assert.deepEqual(codes, ['DONE_WITHOUT_COMPLETION_TIME', 'POSSIBLE_DUPLICATE_TASK']);
    // One website session signed out, one still open; the desktop agent sign-in is only counted.
    assert.equal(data.metrics.current.sessions.total, 2);
    assert.equal(data.metrics.current.sessions.closed, 1);
    assert.equal(data.metrics.current.sessions.stillOpen, 1);
    assert.equal(data.metrics.current.sessions.agentSignIns, 1);
    assert.ok(data.facts.some((fact) => fact.id === 'tasks.overdue' && fact.evidence[0].title === 'Overdue'));
  });

  await t.test('without an AI key the agent answers from rules and says so', async () => {
    const { status, data } = await api(mina, 'POST', '/agent/insights', { employeeId: String(people.eve._id), question: 'What should I follow up on?' });
    assert.equal(status, 201);
    assert.equal(data.source, 'rules');
    assert.match(data.fallbackReason, /ANTHROPIC_API_KEY/);
    assert.match(data.answer.text, /fixed rules/);
    assert.deepEqual(data.validation.rejected, []);
    assert.ok(data.recommendations.some((item) => item.factIds.includes('tasks.overdue')));
    assert.ok(data.recommendations.some((item) => item.factIds.includes('tasks.inReview')));
    const run = await models.AgentRun.findById(data.runId).lean();
    assert.equal(run.question, 'What should I follow up on?');
    assert.ok(run.facts.length > 10, 'the facts behind the answer are stored for evaluation');
  });

  await t.test('only the asker can rate an answer, and history is private', async () => {
    assert.equal((await api(mina, 'POST', `/agent/runs/${eveRunId}/feedback`, { rating: 5 })).status, 404);
    assert.equal((await api(eve, 'POST', `/agent/runs/${eveRunId}/feedback`, { rating: 9 })).status, 400);
    const rated = await api(eve, 'POST', `/agent/runs/${eveRunId}/feedback`, { rating: 4, comment: 'Useful' });
    assert.equal(rated.status, 200);
    assert.equal(rated.data.feedback.rating, 4);

    const mine = await api(mina, 'GET', '/agent/runs');
    assert.ok(mine.data.runs.length > 0 && mine.data.runs.every((run) => run.id !== eveRunId));
    const asEmployee = await api(eve, 'GET', '/agent/runs?all=true');
    assert.ok(asEmployee.data.runs.every((run) => run.scope === 'employee'), 'all=true is ignored for non-admins');
    const all = await api(admin, 'GET', '/agent/runs?all=true');
    assert.ok(all.data.runs.some((run) => run.id === eveRunId && run.feedback.rating === 4));
  });

  await t.test('requests are rate limited per person', async () => {
    let status;
    for (let i = 0; i < 25 && status !== 429; i += 1) status = (await api(admin, 'POST', '/agent/insights', { scope: 'team', period: 'day' })).status;
    assert.equal(status, 429);
    assert.equal((await api(eve, 'GET', '/agent/status')).status, 200, 'other people are unaffected');
  });
});
