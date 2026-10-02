import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectCapabilities, linuxSessionType, supportedChoices } from '../src/main/platform.js';

test('macOS and Windows support every tracker', () => {
  for (const platform of ['darwin', 'win32']) {
    const caps = detectCapabilities(platform, {});
    assert.equal(caps.keyboard.supported, true);
    assert.equal(caps.apps.supported, true);
    assert.equal(caps.screenshots.supported, true);
    assert.equal(caps.idle.limited, undefined);
    assert.equal(caps.trayReliable, true);
    assert.equal(caps.sessionType, null);
  }
});

test('Linux X11 supports trackers but not a guaranteed tray', () => {
  const caps = detectCapabilities('linux', { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' });
  assert.equal(caps.os, 'linux');
  assert.equal(caps.screenshots.supported, true);
  assert.equal(caps.keyboard.supported, true);
  assert.equal(caps.trayReliable, false);
});

test('Linux Wayland disables keyboard, apps and screenshots with a reason', () => {
  const caps = detectCapabilities('linux', { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' });
  for (const key of ['keyboard', 'apps', 'screenshots']) {
    assert.equal(caps[key].supported, false, key);
    assert.match(caps[key].reason, /Wayland/);
  }
  assert.equal(caps.idle.limited, true);
});

test('session type falls back to WAYLAND_DISPLAY / DISPLAY', () => {
  assert.equal(linuxSessionType({ WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' }), 'wayland');
  assert.equal(linuxSessionType({ DISPLAY: ':1' }), 'x11');
  assert.equal(linuxSessionType({}), 'unknown');
  assert.equal(detectCapabilities('linux', {}).screenshots.supported, false);
});

test('supportedChoices turns off what the system cannot do', () => {
  const wayland = detectCapabilities('linux', { XDG_SESSION_TYPE: 'wayland' });
  assert.deepEqual(supportedChoices({ keyboard: true, apps: true, screenshots: true }, wayland), { keyboard: false, apps: false, screenshots: false });
  const mac = detectCapabilities('darwin', {});
  assert.deepEqual(supportedChoices({ keyboard: true, apps: false, screenshots: true }, mac), { keyboard: true, apps: false, screenshots: true });
});
