// Server address helpers (no Electron imports, so they're unit-tested in plain Node).

const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\]|.+\.local)$/i;

/**
 * Turns what a person types ("192.168.1.20:4000", "workplus.example.com") into a full API address
 * ("http://192.168.1.20:4000/api", "https://workplus.example.com/api"). Throws on nonsense.
 * @param {string} input
 */
export function normalizeServerUrl(input) {
  let text = String(input ?? '').trim();
  if (!text) throw new Error('Enter the server address.');
  // Add a scheme only when none was typed; any other scheme (ftp://) is rejected below.
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(text)) {
    const host = text.split(/[/:]/)[0];
    text = `${PRIVATE_HOST.test(host) ? 'http' : 'https'}://${text}`;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('That does not look like a server address.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('The address must start with http:// or https://');
  url.hash = '';
  url.search = '';
  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/api')) pathname = `${pathname}/api`;
  url.pathname = pathname;
  return url.toString().replace(/\/+$/, '');
}

/** Plain http to a non-local host sends passwords unencrypted. */
export function isInsecureRemote(apiUrl) {
  const url = new URL(apiUrl);
  return url.protocol === 'http:' && !PRIVATE_HOST.test(url.hostname);
}
