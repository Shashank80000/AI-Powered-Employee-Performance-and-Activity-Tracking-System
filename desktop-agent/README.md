# WorkPlus Agent (desktop-agent)

Electron desktop agent for the **AI-Powered Employee Performance and Activity Tracking System**.
It runs in the system tray, measures activity as **counts and durations only**, and uploads
snapshots to the Express server. The person who installs it decides what it collects: on
first launch (after sign-in) they go through a consent wizard, the agent requests only the OS
permissions those choices need, and nothing is collected before they press **Start tracking**.
One optional data type, a **screenshot every 5 minutes**, is **off by default** and only runs
if the person turns it on.

## Run

From the monorepo root (npm workspaces) or inside `desktop-agent/`:

```bash
npm install                                   # from the repo root installs all workspaces
cp desktop-agent/.env.example desktop-agent/.env   # optional, defaults work for local dev
npm run dev -w @tracker/desktop-agent         # Vite on :5174 + Electron
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (port 5174) and Electron with `VITE_DEV_SERVER_URL=http://localhost:5174` |
| `npm run build:renderer` | Builds the React UI into `dist/renderer` |
| `npm start` | Runs Electron against the built `dist/renderer/index.html` |
| `npm run dist` | Builds the renderer, then packages installers with electron-builder (`release/`) |

The server must be running (default `http://localhost:4000/api`). Only accounts with role
`employee` can sign in to the agent; tracking starts after sign-in **and** consent, and stops
on sign-out or when consent is withdrawn.

## Configuration (`.env` or environment)

| Variable | Default | Meaning |
| --- | --- | --- |
| `AGENT_API_URL` | `http://localhost:4000/api` | Server API base URL |
| `SNAPSHOT_INTERVAL_SECONDS` | `60` | How often a snapshot is built |
| `FLUSH_INTERVAL_SECONDS` | `300` | How often queued snapshots are uploaded (also uploads at 10 queued) |
| `IDLE_THRESHOLD_SECONDS` | `120` | Seconds without input before time counts as idle |
| `SCREENSHOT_INTERVAL_SECONDS` | `300` | Screenshot interval, only used if the person enabled screenshots. If unset, the server's `screenshotIntervalMinutes` (from `GET /consent`) is used |

## Consent

**At installation**, the Windows installer and the macOS disk image show the monitoring notice in
[`build/license_en.txt`](build/license_en.txt), and the person must click **I Agree** to install. Edit that
file to match your organisation's policy. The Windows installer then opens the app straight away.

On first launch, after signing in, the person sees a 3-step wizard
(`src/renderer/pages/OnboardingPage.jsx`):

1. **What WorkPlus does**: what is measured, and who sees what. The manager sees totals and
   categories, and can also open the person's screenshots if screenshots are on. Every view is
   recorded and the person can see who viewed each one, delete any screenshot, or turn
   screenshots off (which deletes them all). Every screenshot is deleted automatically 3 days
   after it was taken.
2. **Choose what to share**: the toggles below. Turning screenshots on reveals a required
   checkbox, "I agree that my manager and administrators can view my screenshots"; without it the
   person can't continue.
3. **Grant permissions**: live OS permission status for each enabled item, with **Grant** and
   **Re-check**. Disabled items are never requested.

**Start tracking** records the choices on the server (`PUT /consent`), saves them locally, then
starts the trackers. If the server cannot be reached, nothing starts and the person can retry.

| Toggle | Default | What is collected |
| --- | --- | --- |
| Activity time | **required** | Active/idle seconds and mouse-movement count. Without it tracking cannot run. |
| Keyboard activity count | on | Number of key presses per snapshot (`keyboardEvents`). Off -> always `0`, hook not loaded. |
| App names | on | Foreground app owner name + seconds (`applications[]`). Off -> tracker not started, no records. |
| Screenshots | **off** | One JPEG of the primary screen every 5 min while active (see below). |

Choices are stored in `<userData>/consent.json` (choices only, no data):
`{ version: 1, acceptedAt, activity, keyboard, apps, screenshots, userId }`. `userId` makes
sure one account's consent is never applied to another account on the same computer.

**Settings** (from the status window) shows the same toggles and permission statuses. **Save**
re-sends `PUT /consent` and reconfigures the trackers live. **Withdraw consent and stop
tracking** stops all trackers (a final snapshot of already-consented data is sent), deletes any
screenshot not yet uploaded, discards anything still unsent, calls `DELETE /consent`, and
returns to the wizard. If the server cannot be told, tracking still stops locally and the
DELETE is retried.

The agent re-reads `GET /consent` at sign-in and every 10 minutes. The server can only
**narrow** what this computer collects (or withdraw consent); it can never turn on something
the person did not accept on this computer.

## OS permissions

`src/main/permissions.js` reports `{ kind, status, canRequest, settingsUrl? }` per kind.

| Kind | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Keyboard count (`uiohook-napi`) | *Input Monitoring*. macOS has no status API, so it shows "Not confirmed yet" until the hook is running; **Grant** opens System Settings > Privacy & Security > Input Monitoring. Reopen the agent after allowing. | none | none (X11) |
| App names (`get-windows`) | none: called with `accessibilityPermission:false` and `screenRecordingPermission:false`, owner name only | none | none (X11 only) |
| Screenshots | *Screen Recording* (`systemPreferences.getMediaAccessStatus('screen')`). **Grant** triggers the macOS prompt; if still not granted it opens System Settings > Privacy & Security > Screen Recording. | none | none, but **Wayland may block or blank screen capture**; empty images are skipped |
| Notifications | `Notification.isSupported()`; macOS asks on the first notification | same | same |

## Screenshots (opt-in)

Handled only by `src/main/screenshotTracker.js` and `src/services/screenshotService.js`.

- Runs only when the person enabled screenshots **and** screen capture is granted.
- Every `SCREENSHOT_INTERVAL_SECONDS` (default 300). Skipped while paused, idle, the screen is
  locked, or consent/permission is missing. The first capture happens one interval after start.
- Captures the **primary display only**, scaled to at most 1280 px wide (aspect kept), JPEG
  quality 60 (re-encoded at 40 if over 2 MB).
- A silent "Screenshot captured" notification appears for every capture. The tray tooltip
  shows that screenshots are on, and the status window shows "Last screenshot HH:MM" with a
  **Delete it** button.
- Images are kept **in memory only** and are **never written to disk**. Each one is uploaded
  immediately; if that fails it waits in memory (max 12, oldest dropped) and is retried with
  backoff. Unsent images are discarded on quit, sign-out, withdrawal, or when screenshots are
  turned off.
- If the server answers `403` (screenshots consent off server-side) the agent turns screenshots
  off locally, discards queued images and tells the person.

Server endpoints used:

| Method | Path | Body / response |
| --- | --- | --- |
| `GET` | `/consent` | -> `{ consent: { activity, keyboard, apps, screenshots, acceptedAt, version }, screenshotIntervalMinutes }` |
| `PUT` | `/consent` | `{ activity: true, keyboard, apps, screenshots, version: 1 }` -> `{ consent }` |
| `DELETE` | `/consent` | -> `204` |
| `POST` | `/screenshots` | raw JPEG (`Content-Type: image/jpeg`, `X-Captured-At: <ISO>`, <= 2 MB) -> `201 { screenshot: { id, capturedAt } }`; `403` if consent is off |
| `DELETE` | `/screenshots/:id` | -> `204` |

## What is collected (when enabled)

| Data | How | Sent as |
| --- | --- | --- |
| Active / idle seconds | `powerMonitor.getSystemIdleTime()` once per second; locked screen counts as idle | `activeSeconds`, `idleSeconds` |
| Mouse movement count | cursor position polled once per second, counter increments when it moved | `mouseEvents` |
| Key press count | `keydown` events counted via optional `uiohook-napi`; the event is never inspected | `keyboardEvents` |
| Foreground app name + seconds | optional `get-windows`, **owner app name only** (e.g. `Code`) | `applications[]` |
| Time on the selected task | active seconds while a task is selected | `taskId` on snapshots, `PATCH /tasks/:id {actualMinutesDelta}` |
| Screenshot (opt-in, off by default) | primary display JPEG every 5 min, see above | `POST /screenshots` |

## What is never collected

- Which keys are pressed, key codes, or any typed text
- Window titles, document/file names, or URLs
- Screen recordings, camera or microphone
- Screenshots, unless the person explicitly turned them on
- Anything the person turned off in the consent screen
- Anything at all before consent, while tracking is **paused**, or while signed out

Tracking is always visible: the tray icon (green = tracking, blue = idle, amber = paused,
grey = signed out) and its tooltip show the state, and the status window has a
Pause/Resume button. Closing the window keeps the agent in the tray; use **Quit** from the
tray menu to exit (a final snapshot is uploaded on quit).

## Optional native modules

`uiohook-napi` (keyboard counts) and `get-windows` (active app name) are
`optionalDependencies`. If either fails to install or load, the agent logs a warning and
keeps running: keyboard counts are reported as `0` and application usage is skipped. The
status window marks those items "currently unavailable".

Platform notes:

- **macOS**: keyboard counting needs *Input Monitoring* permission for the app (or your
  terminal in dev). The app tracker requests neither accessibility nor screen recording
  permission, because titles are never read. Screenshots (if enabled) need *Screen Recording*.
- **Linux**: `get-windows` needs X11 (Wayland is not supported by the module).
- Native modules must match Electron's ABI; if they fail to load after install, run
  `npx electron-builder install-app-deps` inside `desktop-agent/`.

## Upload format

`POST {AGENT_API_URL}/activity/snapshots`

```json
{
  "snapshots": [
    { "capturedAt": "2026-10-01T09:15:00.000Z", "intervalSeconds": 60, "activeSeconds": 52,
      "idleSeconds": 8, "mouseEvents": 41, "keyboardEvents": 133, "taskId": "t1" }
  ],
  "applications": [
    { "application": "Code", "durationSeconds": 45, "capturedAt": "2026-10-01T09:15:00.000Z" }
  ]
}
```

The snapshot format does not change with consent: a disabled keyboard count is sent as
`keyboardEvents: 0` and disabled app names simply produce no `applications` records.

If the server is unreachable, snapshots stay queued in memory (up to 500, oldest dropped
first) and are retried with backoff. The JWT is kept in memory and, when the OS supports
it, persisted encrypted with Electron `safeStorage`; it is never written in plain text.

## Layout

```
src/main/       Electron main process: lifecycle, tray, IPC, trackers,
                consentStore (consent.json), permissions (OS permission status/requests),
                screenshotTracker (opt-in capture)
src/renderer/   React UI (Vite): login, onboarding wizard, status, settings
src/services/   apiService (HTTP client), activityService (buffer + upload),
                screenshotService (in-memory screenshot upload queue)
src/utils/      pure helpers
```

## Starting and pausing from the website

The agent records only while the employee's tracking state on the server is **active**:

- **Signing in on the WorkPlus website starts tracking**; signing out there stops it. Until then the status window says "Waiting for you to sign in on the WorkPlus website".
- **Pause / Resume** works in the website's top bar and in this agent (window or tray). Each side shows the other's change within about 15 seconds.
- Resuming from the agent isn't possible while the employee is signed out of the website.
- The agent checks the state every 15 seconds (`GET /tracking`). If the server can't be reached, it keeps doing what it was doing.

## Operating system support

The agent checks what the computer can actually do (`src/main/platform.js`). Anything unsupported is shown in the setup screen as **Not available on this computer**, with the reason, and is never collected.

| Feature | macOS 12+ | Windows 10/11 | Linux (X11 / Xorg) | Linux (Wayland) |
| --- | --- | --- | --- | --- |
| Active / idle time | ✅ | ✅ | ✅ | ⚠️ may under-count idle time |
| Mouse movement count | ✅ | ✅ | ✅ | ⚠️ only over WorkPlus's own window |
| Keyboard count | ✅ after **Input Monitoring** | ✅ | ✅ | ❌ blocked by Wayland |
| App names | ✅ | ✅ | ✅ | ❌ blocked by Wayland |
| Screenshots | ✅ after **Screen Recording** | ✅ | ✅ | ❌ Wayland asks every time |
| Notifications | ✅ | ✅ (installed app) | ✅ | ✅ |
| Tray icon | ✅ menu bar | ✅ system tray | ⚠️ GNOME needs the AppIndicator extension | ⚠️ same |
| Start at login | ✅ Login Items | ✅ | ✅ `~/.config/autostart` | ✅ |
| Installer | `.dmg`, `.zip` (Apple Silicon + Intel) | `.exe` (x64 + ARM64) | `.AppImage`, `.deb` (x64 + ARM64) | same |

**Per-OS notes**
- **macOS:** after granting Screen Recording or Input Monitoring, macOS asks you to quit and reopen the app. Permissions are tied to the app's signature, so sign release builds; otherwise people must grant them again after every update.
- **Windows:** notifications need the installed app (the installer registers the app ID). Some antivirus tools flag keyboard-count hooks; the agent counts key presses only, never which key.
- **Linux:** on Ubuntu or Fedora, pick **"Ubuntu on Xorg" / "GNOME on Xorg"** on the login screen to enable keyboard counts, app names and screenshots. Without a visible tray icon, closing the window minimises it to the taskbar instead of hiding it, so tracking is never invisible. The login token is stored encrypted only when a keyring (GNOME Keyring / KWallet) is available; otherwise you sign in again after restarting the agent.

## Building installers

To build an installer **and** offer it on the website's Download page, use `npm run agent:publish -- --server <address>` from the repository root (see the main README). It also works around electron-builder not finding the hoisted `electron` package by passing `electronVersion`.

Native modules are compiled per OS and CPU, so build each installer on its own OS:

```bash
npm run dist -w @tracker/desktop-agent   # outputs to desktop-agent/release/
```

Or use the **Build desktop agent** GitHub Actions workflow (`.github/workflows/release-agent.yml`), which builds macOS, Windows and Linux installers in parallel.
