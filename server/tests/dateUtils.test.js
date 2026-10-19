import assert from 'node:assert/strict';
import test from 'node:test';

// dateUtils reads APP_TIMEZONE when it loads; a query string gives each zone its own copy of the module.
async function inZone(zone) {
  const previous = process.env.APP_TIMEZONE;
  process.env.APP_TIMEZONE = zone;
  try {
    return await import(`../src/utils/dateUtils.js?zone=${zone}`);
  } finally {
    if (previous === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = previous;
  }
}

test('days run midnight to midnight UTC by default', async () => {
  const dates = await inZone('UTC');
  assert.equal(dates.dayStart('2026-10-19').toISOString(), '2026-10-19T00:00:00.000Z');
  assert.equal(dates.toDateKey(new Date('2026-10-18T23:59:00Z')), '2026-10-18');
});

test('APP_TIMEZONE moves the day boundary to local midnight', async () => {
  const dates = await inZone('Asia/Kolkata');
  assert.equal(dates.dayStart('2026-10-19').toISOString(), '2026-10-18T18:30:00.000Z');
  // 01:30 in India on the 19th is still the 18th in UTC: it belongs to the 19th.
  assert.equal(dates.toDateKey(new Date('2026-10-18T20:00:00Z')), '2026-10-19');
  assert.equal(dates.startOfDay(new Date('2026-10-18T20:00:00Z')).toISOString(), '2026-10-18T18:30:00.000Z');
  assert.equal(dates.weekday(new Date('2026-10-18T20:00:00Z')), 1, 'Monday in India, still Sunday in UTC');
  const { start, end } = dates.periodRange('day', new Date('2026-10-19T12:00:00Z'));
  assert.deepEqual([start.toISOString(), end.toISOString()], ['2026-10-18T18:30:00.000Z', '2026-10-19T18:30:00.000Z']);
});

test('a day with a daylight saving change keeps its own midnights', async () => {
  const dates = await inZone('America/New_York');
  const first = dates.dayStart('2026-11-01');
  assert.equal(first.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(dates.addDays(first, 1).toISOString(), '2026-11-02T05:00:00.000Z', 'that day lasts 25 hours');
});
