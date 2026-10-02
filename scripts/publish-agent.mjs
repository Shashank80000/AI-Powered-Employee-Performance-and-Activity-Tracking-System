#!/usr/bin/env node
// Builds the desktop agent installer for THIS operating system with your server's address built in,
// then copies it to the folder the server offers on the website's Download page.
//
//   npm run agent:publish -- --server https://workplus.example.com
//   npm run agent:publish -- --from ./ci-artifacts          # copy installers built elsewhere (no build)
//
// Installers can only be built for the OS you run this on (native modules), so build Windows,
// macOS and Linux on each system, or use the "Build desktop agent" GitHub workflow and --from.
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isInsecureRemote, normalizeServerUrl } from '../desktop-agent/src/utils/serverUrl.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALLER = /\.(dmg|zip|exe|AppImage|deb)$/;

const { values } = parseArgs({
  options: {
    server: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    help: { type: 'boolean', short: 'h' }
  }
});

if (values.help) {
  console.log('Usage: npm run agent:publish -- --server <address> [--to <downloads dir>]\n       npm run agent:publish -- --from <folder with installers> [--to <downloads dir>]');
  process.exit(0);
}

const target = path.resolve(values.to ?? process.env.DOWNLOADS_DIR ?? path.join(root, 'server', 'storage', 'downloads'));
let source = values.from ? path.resolve(values.from) : path.join(root, 'desktop-agent', 'release');

if (!values.from) {
  if (!values.server) {
    console.error('Pass the address employees\' computers will use to reach the server, e.g. --server https://workplus.example.com\n(Use --server localhost:4000 only for testing on this computer.)');
    process.exit(2);
  }
  const apiUrl = normalizeServerUrl(values.server);
  if (isInsecureRemote(apiUrl)) console.warn(`Warning: ${apiUrl} is plain http on a public address, so passwords would travel unencrypted. Use https.`);
  // npm workspaces hoist electron to the root node_modules, where electron-builder doesn't look for it.
  const electronPackage = createRequire(path.join(root, 'desktop-agent', 'package.json')).resolve('electron/package.json');
  const electronVersion = JSON.parse(await readFile(electronPackage, 'utf8')).version;
  console.log(`Building the desktop agent for ${process.platform} (Electron ${electronVersion}) with server ${apiUrl} ...`);
  const builderArgs = [`-c.extraMetadata.workplus.apiUrl=${apiUrl}`, `-c.electronVersion=${electronVersion}`, '--publish', 'never'];
  const result = spawnSync('npm', ['run', 'dist', '-w', '@tracker/desktop-agent', '--', ...builderArgs], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// --from may point at GitHub artifact folders (one sub-folder per OS), so look one level down too.
async function findInstallers(directory) {
  const found = [];
  for (const name of await readdir(directory)) {
    const full = path.join(directory, name);
    const info = await stat(full);
    if (info.isFile() && INSTALLER.test(name)) found.push(full);
    else if (info.isDirectory() && directory === source) found.push(...(await findInstallers(full)));
  }
  return found;
}

const installers = await findInstallers(source).catch(() => []);
if (installers.length === 0) {
  console.error(`No installers found in ${source}`);
  process.exit(1);
}
await mkdir(target, { recursive: true });
for (const file of installers) {
  await copyFile(file, path.join(target, path.basename(file)));
  console.log(`  published ${path.basename(file)}`);
}
console.log(`\n${installers.length} installer(s) in ${target}. They now appear on the website at /download.`);
