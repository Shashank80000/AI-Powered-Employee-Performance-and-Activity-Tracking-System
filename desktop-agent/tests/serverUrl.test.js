import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isInsecureRemote, normalizeServerUrl } from '../src/utils/serverUrl.js';

test('adds a scheme and /api', () => {
  assert.equal(normalizeServerUrl('192.168.1.20:4000'), 'http://192.168.1.20:4000/api');
  assert.equal(normalizeServerUrl('localhost:4000'), 'http://localhost:4000/api');
  assert.equal(normalizeServerUrl('workplus.example.com'), 'https://workplus.example.com/api');
});

test('keeps an existing /api and strips extras', () => {
  assert.equal(normalizeServerUrl('https://workplus.example.com/api/'), 'https://workplus.example.com/api');
  assert.equal(normalizeServerUrl('  http://10.0.0.5:4000/api?x=1#y '), 'http://10.0.0.5:4000/api');
  assert.equal(normalizeServerUrl('https://example.com/pulse'), 'https://example.com/pulse/api');
});

test('rejects nonsense', () => {
  assert.throws(() => normalizeServerUrl(''), /Enter the server address/);
  assert.throws(() => normalizeServerUrl('ftp://example.com'), /http/);
  assert.throws(() => normalizeServerUrl('http://'), /does not look like/);
});

test('flags plain http to the internet only', () => {
  assert.equal(isInsecureRemote('http://workplus.example.com/api'), true);
  assert.equal(isInsecureRemote('https://workplus.example.com/api'), false);
  assert.equal(isInsecureRemote('http://192.168.1.20:4000/api'), false);
  assert.equal(isInsecureRemote('http://localhost:4000/api'), false);
});
