import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// End-to-end check of the admin → manager → employee workflow and its permissions, through the real API.
// Needs a throwaway MongoDB database, which it empties: TEST_MONGODB_URI=mongodb://127.0.0.1:27017/workplus_test npm test
const uri = process.env.TEST_MONGODB_URI;
process.env.MONGODB_URI = uri ?? 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'x'.repeat(40);

const skip = uri ? false : 'set TEST_MONGODB_URI to a throwaway database to run the workflow test';
let server;
let base;
let mongoose;
let User;

before(async () => {
  if (skip) return;
  ({ default: mongoose } = await import('mongoose'));
  ({ User } = await import('../src/models/User.js'));
  const { createApp } = await import('../src/app.js');
  const bcrypt = (await import('bcryptjs')).default;
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  await User.create({ name: 'Ada Admin', email: 'admin@test.dev', passwordHash: await bcrypt.hash('Admin123!', 4), role: 'admin' });
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

async function api(token, method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body)
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data, message: data?.error?.details?.[0]?.message ?? data?.error?.message };
}

async function login(email, password) {
  const { status, data } = await api(null, 'POST', '/auth/login', { email, password });
  assert.equal(status, 200, `sign in as ${email}`);
  return data;
}

test('admin, manager and employee workflow with role checks', { skip }, async (t) => {
  const admin = (await login('admin@test.dev', 'Admin123!')).token;
  let mina;
  let omar;
  let eve;
  let sam;
  let task;

  await t.test('admin creates managers, with clear validation', async () => {
    const weak = await api(admin, 'POST', '/users/managers', { name: 'Mina Manager', email: 'mina@test.dev', password: 'password' });
    assert.equal(weak.status, 400);
    assert.equal(weak.message, 'Include at least one number in the password');

    const created = await api(admin, 'POST', '/users/managers', { name: 'Mina Manager', email: 'Mina@Test.dev', password: 'Welcome123' });
    assert.equal(created.status, 201);
    assert.equal(created.data.manager.email, 'mina@test.dev');
    assert.equal(created.data.manager.mustChangePassword, true);
    assert.equal('passwordHash' in created.data.manager, false);
    mina = created.data.manager;

    const duplicate = await api(admin, 'POST', '/users/managers', { name: 'Mina Again', email: 'mina@test.dev', password: 'Welcome123' });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.message, /already exists/);

    omar = (await api(admin, 'POST', '/users/managers', { name: 'Omar Manager', email: 'omar@test.dev', password: 'Welcome123' })).data.manager;
    const list = await api(admin, 'GET', '/users/managers');
    assert.deepEqual(list.data.managers.map((manager) => [manager.name, manager.teamSize]), [['Mina Manager', 0], ['Omar Manager', 0]]);
  });

  await t.test('admin creates employees and assigns them to managers', async () => {
    const base = { password: 'Welcome123', designation: 'Engineer', department: 'Product' };
    const created = await api(admin, 'POST', '/employees', { ...base, name: 'Eve Employee', email: 'eve@test.dev', employeeCode: 'E-1', manager: mina.id });
    assert.equal(created.status, 201);
    assert.equal(created.data.employee.managerName, 'Mina Manager');
    eve = created.data.employee;
    sam = (await api(admin, 'POST', '/employees', { ...base, name: 'Sam Employee', email: 'sam@test.dev', employeeCode: 'E-2', manager: omar.id })).data.employee;

    const users = await User.countDocuments();
    const duplicateCode = await api(admin, 'POST', '/employees', { ...base, name: 'Dup Code', email: 'dup@test.dev', employeeCode: 'E-1' });
    assert.equal(duplicateCode.status, 409);
    assert.match(duplicateCode.message, /employee code is already in use/);
    assert.equal(await User.countDocuments(), users, 'a rejected employee leaves no account behind');

    const notAManager = await api(admin, 'POST', '/employees', { ...base, name: 'Bad Manager', email: 'bad@test.dev', employeeCode: 'E-3', manager: eve.userId });
    assert.equal(notAManager.status, 400);
    assert.equal((await api(admin, 'PATCH', `/employees/${sam.id}`, { manager: eve.userId })).status, 400);
  });

  await t.test('a new manager must replace the temporary password', async () => {
    const session = await login('mina@test.dev', 'Welcome123');
    assert.equal(session.user.mustChangePassword, true);
    assert.equal((await api(session.token, 'POST', '/auth/password', { currentPassword: 'wrong', newPassword: 'Mina2026pass' })).status, 400);
    assert.equal((await api(session.token, 'POST', '/auth/password', { currentPassword: 'Welcome123', newPassword: 'Welcome123' })).status, 400);
    const changed = await api(session.token, 'POST', '/auth/password', { currentPassword: 'Welcome123', newPassword: 'Mina2026pass', role: 'admin' });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.user.mustChangePassword, false);
    assert.equal(changed.data.user.role, 'manager', 'the role cannot be changed through this request');
    await assert.rejects(login('mina@test.dev', 'Welcome123'));
  });

  const minaToken = async () => (await login('mina@test.dev', 'Mina2026pass')).token;

  await t.test('a manager sees and manages only their own team', async () => {
    const manager = await minaToken();
    assert.deepEqual((await api(manager, 'GET', '/employees')).data.employees.map((employee) => employee.name), ['Eve Employee']);
    assert.equal((await api(manager, 'GET', `/employees/${sam.id}`)).status, 404);
    assert.equal((await api(manager, 'PATCH', `/employees/${sam.id}`, { department: 'X' })).status, 404);
    assert.equal((await api(manager, 'PATCH', `/employees/${eve.id}`, { manager: omar.id })).status, 403);
    assert.equal((await api(manager, 'PATCH', `/employees/${eve.id}`, { department: 'Design' })).status, 200);
    assert.equal((await api(manager, 'POST', '/users/managers', { name: 'Sneaky', email: 's@test.dev', password: 'Welcome123' })).status, 403);
    assert.equal((await api(manager, 'POST', '/employees', { name: 'Sneaky', email: 's@test.dev', password: 'Welcome123', employeeCode: 'S' })).status, 403);
    assert.equal((await api(manager, 'POST', `/users/${eve.userId}/password`, { password: 'Hacked123' })).status, 403);
    assert.equal((await api(manager, 'POST', '/tasks', { title: 'Not my team', assignedTo: sam.id })).status, 404);

    const empty = await api(manager, 'POST', '/tasks', { title: '', assignedTo: eve.id });
    assert.equal(empty.message, 'Enter a task title of at least 2 characters');
    const created = await api(manager, 'POST', '/tasks', {
      title: 'Write the onboarding guide',
      description: 'Cover sign-in and the first task',
      assignedTo: eve.id,
      priority: 'high',
      expectedMinutes: 120,
      dueDate: new Date(Date.now() + 86400000).toISOString()
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.task.createdByName, 'Mina Manager');
    task = created.data.task;
  });

  await t.test('an employee sees only their own profile and tasks', async () => {
    const session = await login('eve@test.dev', 'Welcome123');
    const employee = session.token;
    const me = await api(employee, 'GET', '/employees/me');
    assert.equal(me.data.employee.managerName, 'Mina Manager');
    assert.equal((await api(employee, 'GET', '/employees')).status, 403);
    assert.equal((await api(employee, 'GET', `/employees/${sam.id}`)).status, 404);
    assert.equal((await api(employee, 'GET', `/tasks?assignedTo=${sam.id}`)).status, 404);
    assert.deepEqual((await api(employee, 'GET', '/tasks')).data.tasks.map((item) => item.title), ['Write the onboarding guide']);
    assert.equal((await api(employee, 'POST', '/tasks', { title: 'Self-assigned', assignedTo: eve.id })).status, 403);
    assert.equal((await api(employee, 'GET', '/users/managers')).status, 403);

    const sneaky = await api(employee, 'PATCH', `/tasks/${task.id}`, { status: 'in-progress', title: 'Renamed', priority: 'low' });
    assert.equal(sneaky.status, 200);
    assert.equal(sneaky.data.task.title, 'Write the onboarding guide', 'employees cannot edit task details');
    assert.equal(sneaky.data.task.priority, 'high');

    const selfApprove = await api(employee, 'PATCH', `/tasks/${task.id}`, { status: 'done' });
    assert.equal(selfApprove.status, 400);
    assert.equal(selfApprove.message, 'Submit the task for review; your manager marks it done');
    assert.equal((await api(employee, 'POST', `/tasks/${task.id}/review`, { decision: 'approve' })).status, 403);

    const submitted = await api(employee, 'PATCH', `/tasks/${task.id}`, { status: 'review', note: 'Draft is in the shared folder' });
    assert.equal(submitted.data.task.status, 'review');
    assert.deepEqual(submitted.data.task.history.map((event) => [event.kind, event.text, event.authorName]), [['submitted', 'Draft is in the shared folder', 'Eve Employee']]);

    const other = (await login('sam@test.dev', 'Welcome123')).token;
    assert.equal((await api(other, 'PATCH', `/tasks/${task.id}`, { status: 'todo' })).status, 404);
    assert.equal((await api(other, 'POST', `/tasks/${task.id}/comments`, { text: 'hi' })).status, 404);
  });

  await t.test('the manager sends work back, then approves it', async () => {
    const manager = await minaToken();
    const employee = (await login('eve@test.dev', 'Welcome123')).token;
    const noReason = await api(manager, 'POST', `/tasks/${task.id}/review`, { decision: 'changes' });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.message, 'Explain what needs to change, so the employee knows what to do');

    const sentBack = await api(manager, 'POST', `/tasks/${task.id}/review`, { decision: 'changes', comment: 'Add the password reset steps' });
    assert.equal(sentBack.data.task.status, 'in-progress');
    assert.equal((await api(manager, 'POST', `/tasks/${task.id}/review`, { decision: 'approve' })).status, 409, 'only tasks in review');

    assert.equal((await api(employee, 'POST', `/tasks/${task.id}/comments`, { text: '  ' })).status, 400);
    assert.equal((await api(employee, 'POST', `/tasks/${task.id}/comments`, { text: 'Added them' })).status, 201);
    await api(employee, 'PATCH', `/tasks/${task.id}`, { status: 'review' });
    const approved = await api(manager, 'POST', `/tasks/${task.id}/review`, { decision: 'approve', comment: 'Great work' });
    assert.equal(approved.data.task.status, 'done');
    assert.ok(approved.data.task.completedAt);
    assert.deepEqual(approved.data.task.history.map((event) => event.kind), ['submitted', 'changes-requested', 'comment', 'submitted', 'approved']);

    const reopen = await api(employee, 'PATCH', `/tasks/${task.id}`, { status: 'in-progress' });
    assert.equal(reopen.status, 409);
    assert.equal((await api(employee, 'PATCH', `/tasks/${task.id}`, { actualMinutesDelta: 5 })).status, 200, 'the desktop agent can still log time');
  });

  await t.test('admin manages access: reassign, deactivate, reset password, reactivate', async () => {
    const blocked = await api(admin, 'PATCH', `/users/managers/${mina.id}`, { isActive: false });
    assert.equal(blocked.status, 409);
    assert.match(blocked.message, /still manages 1 employee/);
    assert.equal((await api(admin, 'PATCH', `/employees/${eve.id}`, { manager: omar.id })).data.employee.managerName, 'Omar Manager');
    assert.equal((await api(admin, 'PATCH', `/users/managers/${mina.id}`, { isActive: false })).data.manager.isActive, false);
    assert.equal((await api(null, 'POST', '/auth/login', { email: 'mina@test.dev', password: 'Mina2026pass' })).status, 401);
    assert.equal((await api(admin, 'POST', '/employees', { name: 'Late', email: 'late@test.dev', password: 'Welcome123', employeeCode: 'E-9', manager: mina.id })).status, 400);

    const omarToken = (await login('omar@test.dev', 'Welcome123')).token;
    assert.deepEqual((await api(omarToken, 'GET', '/tasks')).data.tasks.map((item) => item.title), ['Write the onboarding guide'], 'the new manager sees the reassigned work');

    assert.equal((await api(admin, 'POST', `/users/${eve.userId}/password`, { password: 'short' })).status, 400);
    assert.equal((await api(admin, 'POST', `/users/${eve.userId}/password`, { password: 'Reset2026x' })).status, 204);
    await assert.rejects(login('eve@test.dev', 'Welcome123'));
    const reset = await login('eve@test.dev', 'Reset2026x');
    assert.equal(reset.user.mustChangePassword, true);
    const adminId = (await api(admin, 'GET', '/auth/me')).data.user.id;
    assert.equal((await api(admin, 'POST', `/users/${adminId}/password`, { password: 'Reset2026x' })).status, 403);

    assert.equal((await api(admin, 'DELETE', `/employees/${eve.id}`)).status, 204);
    assert.equal((await api(reset.token, 'GET', '/tasks')).status, 401, 'a deactivated employee is signed out at once');
    assert.equal((await api(omarToken, 'POST', '/tasks', { title: 'For a deactivated person', assignedTo: eve.id })).status, 400);
    assert.equal((await api(admin, 'PATCH', `/employees/${eve.id}`, { department: 'X' })).status, 409);
    assert.equal((await api(admin, 'POST', `/employees/${eve.id}/reactivate`)).data.employee.status, 'active');
    await login('eve@test.dev', 'Reset2026x');
  });

  await t.test('requests without a valid session are rejected', async () => {
    assert.equal((await api(null, 'GET', '/tasks')).status, 401);
    assert.equal((await api('not-a-token', 'GET', '/employees')).status, 401);
    const [header, , signature] = admin.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: eve.userId, role: 'admin' })).toString('base64url');
    assert.equal((await api(`${header}.${forged}.${signature}`, 'GET', '/users/managers')).status, 401);
  });
});
