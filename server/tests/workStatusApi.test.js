import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

// The internal API the analysis agent uses: working / entertainment / not working is attached to each screenshot
// and stored with the day's analysis. Uses its own database next to TEST_MONGODB_URI's, which it empties.
const base = process.env.TEST_MONGODB_URI;
const uri = base && base.replace(/\/([^/?]+)(\?|$)/, '/$1_workstatus$2');
process.env.MONGODB_URI = uri ?? 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'x'.repeat(40);
process.env.SERVICE_API_KEY = 'test-service-key-0123456789abcdef0123';
process.env.SCREENSHOT_INTERVAL_MINUTES = '5';

const skip = uri ? false : 'set TEST_MONGODB_URI to a throwaway database to run the work status API test';
let server;
let root;
let mongoose;
let employee;
let dateKey;
let at;

before(async () => {
  if (skip) return;
  ({ default: mongoose } = await import('mongoose'));
  const { createApp } = await import('../src/app.js');
  const dates = await import('../src/utils/dateUtils.js');
  const { User } = await import('../src/models/User.js');
  const { Employee } = await import('../src/models/Employee.js');
  const { Screenshot } = await import('../src/models/Screenshot.js');
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  const user = await User.create({ name: 'Wes Worker', email: 'wes@status.dev', passwordHash: 'x', role: 'employee' });
  employee = await Employee.create({ user: user._id, employeeCode: 'W-1' });
  const day = dates.startOfDay();
  dateKey = dates.toDateKey(day);
  at = (minutes) => new Date(day.getTime() + (9 * 60 + minutes) * 60 * 1000);
  const shot = (minutes, category, productive) =>
    ({ employee: employee._id, capturedAt: at(minutes), bytes: 1, status: 'analyzed', analysis: { category, activity: 'generic', productive, confidence: 0.9 } });
  await Screenshot.insertMany([shot(0, 'coding', true), shot(5, 'coding', true), shot(10, 'social_media', false), shot(15, 'other', false), shot(20, 'idle_or_locked', false)]);

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  root = `http://127.0.0.1:${server.address().port}/api/internal`;
});

after(async () => {
  if (skip) return;
  server?.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

const headers = { 'Content-Type': 'application/json', 'X-Service-Key': 'test-service-key-0123456789abcdef0123' };

test('each screenshot the agent reads carries its work status', { skip }, async () => {
  const response = await fetch(`${root}/day/${employee._id}?date=${dateKey}`, { headers });
  assert.equal(response.status, 200);
  const { screenshots } = await response.json();
  assert.deepEqual(screenshots.map((s) => s.analysis.status), ['working', 'working', 'entertainment', 'not_working', 'not_working']);
});

test('the stored day analysis gets per-entry statuses and minutes, also from an agent that sends no productive flag', { skip }, async () => {
  const entry = (minutes, category, extra = {}) => ({ capturedAt: at(minutes).toISOString(), category, activity: 'generic', ...extra });
  const body = {
    employeeId: employee._id.toString(),
    date: dateKey,
    screenshotCount: 5,
    analyzedCount: 5,
    categoryMinutes: { coding: 10, social_media: 5, other: 5, idle_or_locked: 5 },
    productiveMinutes: 10,
    // First entry as a new agent sends it; the rest as an older agent (status comes from the stored screenshot).
    timeline: [entry(0, 'coding', { productive: true }), entry(5, 'coding'), entry(10, 'social_media'), entry(15, 'other'), entry(20, 'idle_or_locked')],
    summary: 'Automatic summary: test.',
    highlights: [],
    suggestions: [],
    model: 'rule-based-template',
    generatedAt: new Date().toISOString()
  };
  const response = await fetch(`${root}/daily-analyses`, { method: 'PUT', headers, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  const { dailyAnalysis } = await response.json();
  assert.deepEqual(dailyAnalysis.statusMinutes, { working: 10, entertainment: 5, not_working: 10, estimated: false });
  assert.deepEqual(dailyAnalysis.timeline.map((e) => e.status), ['working', 'working', 'entertainment', 'not_working', 'not_working']);
});
