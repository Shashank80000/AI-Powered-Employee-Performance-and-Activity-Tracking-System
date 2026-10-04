import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// downloadService reads env, which needs these two values to load.
process.env.MONGODB_URI ??= 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'x'.repeat(40);
const { listInstallers, listReleaseInstallers, parseInstallerName } = await import('../src/services/downloadService.js');

test('parses electron-builder installer names', () => {
  assert.deepEqual(parseInstallerName('WorkPlus Agent-0.2.0-mac-arm64.dmg'), {
    file: 'WorkPlus Agent-0.2.0-mac-arm64.dmg', version: '0.2.0', platform: 'macos', arch: 'arm64', format: 'dmg', label: 'Disk image (.dmg)', preferred: true
  });
  assert.equal(parseInstallerName('WorkPlus Agent-0.2.0-linux-x86_64.AppImage').arch, 'x64');
  assert.equal(parseInstallerName('WorkPlus Agent-0.2.0-win-x64.exe').preferred, true);
  assert.equal(parseInstallerName('WorkPlus Agent-0.2.0-mac-x64.zip').preferred, false);
  assert.equal(parseInstallerName('latest-mac.yml'), null);
});

test('lists only the newest version', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'downloads-'));
  try {
    for (const name of ['WorkPlus Agent-0.1.0-win-x64.exe', 'WorkPlus Agent-0.10.0-win-x64.exe', 'WorkPlus Agent-0.10.0-mac-arm64.dmg', 'notes.txt']) {
      await writeFile(path.join(directory, name), 'x');
    }
    const { version, installers } = await listInstallers(directory);
    assert.equal(version, '0.10.0');
    assert.deepEqual(installers.map((item) => item.file), ['WorkPlus Agent-0.10.0-mac-arm64.dmg', 'WorkPlus Agent-0.10.0-win-x64.exe']);
    assert.equal(installers[0].bytes, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a missing folder means no downloads yet', async () => {
  assert.deepEqual(await listInstallers(path.join(tmpdir(), 'does-not-exist-workplus')), { version: null, installers: [] });
});

test('lists the newest installers attached to the latest GitHub Release', async () => {
  const asset = (name, size) => ({ name, size, browser_download_url: `https://github.com/o/r/releases/download/v0.2.0/${encodeURIComponent(name)}` });
  const fakeFetch = async (url) => {
    assert.equal(url, 'https://api.github.com/repos/o/r/releases/latest');
    return { ok: true, status: 200, json: async () => ({ assets: [asset('WorkPlus Agent-0.2.0-win-x64.exe', 7), asset('WorkPlus Agent-0.2.0-mac-arm64.dmg', 5), asset('latest-mac.yml', 1)] }) };
  };
  const { version, installers } = await listReleaseInstallers('o/r', fakeFetch);
  assert.equal(version, '0.2.0');
  assert.deepEqual(installers.map((item) => [item.file, item.bytes]), [['WorkPlus Agent-0.2.0-mac-arm64.dmg', 5], ['WorkPlus Agent-0.2.0-win-x64.exe', 7]]);
  assert.match(installers[0].downloadUrl, /^https:\/\/github\.com\/o\/r\/releases\/download\//);
});

test('a repository without releases means no downloads yet', async () => {
  const fakeFetch = async () => ({ ok: false, status: 404 });
  assert.deepEqual(await listReleaseInstallers('o/r', fakeFetch), { version: null, installers: [] });
});
