import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countStatusMinutes, dayStatusMinutes, workStatus } from '../src/utils/workStatus.js';
import { summariseScreens } from '../src/utils/employeeOverview.js';

test('each category maps to working, entertainment or not working', () => {
  assert.equal(workStatus({ category: 'coding', productive: true }), 'working');
  assert.equal(workStatus({ category: 'other', productive: false }), 'not_working');
  assert.equal(workStatus({ category: 'idle_or_locked', productive: true }), 'not_working');
  // Entertainment wins even if the classifier called it productive.
  assert.equal(workStatus({ category: 'entertainment', productive: true }), 'entertainment');
  assert.equal(workStatus({ category: 'social_media', productive: false }), 'entertainment');
  assert.equal(workStatus({ category: 'unclassified', productive: false }), null);
  assert.equal(workStatus({ category: 'coding' }), null, 'unknown without a productive flag');
  assert.equal(workStatus(null), null);
});

test('minutes are counted per screenshot interval', () => {
  assert.deepEqual(countStatusMinutes(['working', 'working', 'entertainment', null, 'not_working'], 5), { working: 10, entertainment: 5, not_working: 5 });
});

test('stored totals are used as-is; older analyses are estimated from categories', () => {
  assert.deepEqual(dayStatusMinutes({ statusMinutes: { working: 30, entertainment: 10, not_working: 0 } }), { working: 30, entertainment: 10, not_working: 0, estimated: false });
  const old = { categoryMinutes: new Map([['coding', 60], ['entertainment', 10], ['social_media', 5], ['idle_or_locked', 15], ['other', 10], ['unclassified', 5]]), productiveMinutes: 65 };
  assert.deepEqual(dayStatusMinutes(old), { working: 65, entertainment: 15, not_working: 20, estimated: true });
  // Plain objects (lean queries) work too, and productive minutes can't exceed what's left.
  assert.deepEqual(dayStatusMinutes({ categoryMinutes: { entertainment: 20 }, productiveMinutes: 20 }), { working: 0, entertainment: 20, not_working: 0, estimated: true });
});

test('the employee report adds up the status minutes over days', () => {
  const range = { start: new Date('2026-11-01T00:00:00Z'), end: new Date('2026-11-03T00:00:00Z') };
  const analyses = [
    { date: new Date('2026-11-01T00:00:00Z'), screenshotCount: 4, analyzedCount: 4, categoryMinutes: { coding: 15, entertainment: 5 }, productiveMinutes: 15, statusMinutes: { working: 15, entertainment: 5, not_working: 0 } },
    { date: new Date('2026-11-02T00:00:00Z'), screenshotCount: 2, analyzedCount: 2, categoryMinutes: { idle_or_locked: 10 }, productiveMinutes: 0 }
  ];
  const screen = summariseScreens(analyses, range);
  assert.deepEqual(screen.statusMinutes, { working: 15, entertainment: 5, not_working: 10 });
  assert.equal(screen.statusEstimated, true);
});
