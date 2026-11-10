import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createActivityService } from '../src/services/activityService.js';

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'workplus-queue-')), 'queue-u1.json');
const snapshot = (n) => ({ capturedAt: new Date(n * 60000).toISOString(), intervalSeconds: 60, activeSeconds: 60, idleSeconds: 0, mouseEvents: n, keyboardEvents: 0 });

/** An API that is offline until `online` is set, recording what it received. */
function fakeApi() {
  const api = {
    online: false,
    sent: [],
    hasToken: () => true,
    async postSnapshots(payload) {
      if (!api.online) throw Object.assign(new Error('offline'), { status: 0 });
      api.sent.push(...payload.snapshots);
    },
  };
  return api;
}

test('queued snapshots survive a restart and are sent by the next run', async () => {
  const file = tempFile();
  const api = fakeApi();
  const first = createActivityService({ api });
  first.useStore(file);
  first.enqueue(snapshot(1));
  first.enqueue(snapshot(2));
  first.stop();
  assert.ok(fs.existsSync(file), 'queue is written to disk as soon as a snapshot is added');

  // Next run (e.g. after a Windows shutdown): nothing in memory until the store is attached.
  const second = createActivityService({ api });
  assert.equal(second.getState().queued, 0);
  second.useStore(file);
  assert.equal(second.getState().queued, 2);

  api.online = true;
  assert.equal(await second.flush(), true);
  second.stop();
  assert.deepEqual(api.sent.map((s) => s.mouseEvents), [1, 2]);
  assert.equal(fs.existsSync(file), false, 'file is removed once everything is sent');
});

test('clear() deletes the stored queue', () => {
  const file = tempFile();
  const service = createActivityService({ api: fakeApi() });
  service.useStore(file);
  service.enqueue(snapshot(1));
  service.clear();
  assert.equal(fs.existsSync(file), false);
});

test('attaching the same store again keeps the in-memory queue', () => {
  const file = tempFile();
  const service = createActivityService({ api: fakeApi() });
  service.useStore(file);
  service.enqueue(snapshot(1));
  service.useStore(file);
  assert.equal(service.getState().queued, 1);
});

test('a corrupt or foreign file is ignored', () => {
  const file = tempFile();
  fs.writeFileSync(file, '{not json');
  const service = createActivityService({ api: fakeApi() });
  service.useStore(file);
  assert.equal(service.getState().queued, 0);

  fs.writeFileSync(file, JSON.stringify([{ snapshot: snapshot(1), applications: [] }, { junk: true }, null]));
  const other = createActivityService({ api: fakeApi() });
  other.useStore(file);
  assert.equal(other.getState().queued, 1);
});
