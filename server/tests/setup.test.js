import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// First-run administrator setup through the real API. Uses its own database next to TEST_MONGODB_URI's, which it empties.
const base = process.env.TEST_MONGODB_URI;
const uri = base && base.replace(/\/([^/?]+)(\?|$)/, '/$1_setup$2');
process.env.MONGODB_URI = uri ?? 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'x'.repeat(40);

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
