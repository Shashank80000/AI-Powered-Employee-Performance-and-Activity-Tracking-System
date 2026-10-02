import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// Strict CSP for the packaged renderer. Not applied in dev because Vite's React refresh
// preamble is an inline script. The renderer never talks to the network directly; all
// server calls go through the main process via IPC.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

const cspPlugin = {
  name: 'agent-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
  },
};

// Renderer build only. The Electron main process is plain Node ESM and is not bundled.
export default defineConfig({
  root: path.join(here, 'src/renderer'),
  base: './',
  plugins: [react(), cspPlugin],
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
