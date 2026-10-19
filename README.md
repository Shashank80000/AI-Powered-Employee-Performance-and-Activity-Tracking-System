# AI Employee Performance Tracker (WorkPlus)

A privacy-conscious employee performance and activity tracking system, built as the HMR Institute minor project **AI-Powered Employee Performance and Activity Tracking System**.

## Project structure

```text
.
├── client/          React dashboard for admins, managers and employees
├── server/          Node.js + Express API with MongoDB
├── desktop-agent/   Electron app that records activity counts on employee machines
├── ai-service/      Python FastAPI service for scoring, trends, anomalies and reports
├── analysis-agent/  Python daily job: classifies consented screenshots with Claude and writes a whole-day analysis
├── camera-agent/    Python, opt-in webcam checks on the employee's machine, reported as generic labels (never images)
├── docs/            Architecture, database, API docs, research paper, screenshots
├── .github/         CI on Windows, macOS and Linux; installer builds; PR template
└── package.json     npm workspaces for the three JavaScript apps
```

See [docs/architecture](docs/architecture/README.md) for how the parts fit together.

## Requirements

- Node.js 22+ and npm 10+
- MongoDB 7+ running locally, or a MongoDB Atlas connection string
- Python 3.11+ (only for the AI service)

## Run locally

```bash
# 1. Install JavaScript dependencies for client, server and desktop-agent
npm install

# 2. Configure the server
cp server/.env.example server/.env    # then set MONGODB_URI and a long random JWT_SECRET

# 3. Optional: load demo data. It deletes existing data, so it asks you to type the database name first
#    (or set SEED_CONFIRM=<database name>), and it refuses to run when NODE_ENV=production.
npm run seed

# 4. Start the API (port 4000) and dashboard (port 5173)
npm run dev
```

Open http://localhost:5173 and either click **Explore as Administrator / Manager / Employee** (no password; a banner on every page suggests what to try and lets you switch roles), or sign in with a demo account. The password for all of them is `Password@123`.

The one-click buttons appear only when `DEMO_MODE=true` in `server/.env`. They sign people in without a password, so the server ignores `DEMO_MODE` whenever `NODE_ENV=production`. Run `npm run seed` to reset the demo data at any time.

| Role | Email |
| --- | --- |
| Admin | admin@workplus.dev |
| Manager | manager@workplus.dev |
| Employee | akash@workplus.dev (also shashank@, riya@, mohit@) |

**Creating an administrator account:** anyone can click **Create admin account** on the home page (or go to `/register`, also linked from the sign-in page). They enter an organization name, their name, email and password (at least 8 characters with a letter and a number), are signed in, and land on the admin dashboard. Each registration creates a **separate organization**: its administrator sees and manages only that organization's managers, employees, tasks, reports, screenshots and AI assistant answers, never anyone else's. Accounts that existed before registration was added form the original organization and keep all their data. An email can be registered only once, and each network address can register at most 10 accounts an hour.

**Forgotten administrator password:** there is no email reset. On a computer whose `server/.env` (or environment) points at the database, run:

```bash
npm run admin:reset-password -- admin@company.com
```

It asks for the new password twice without showing it, changes only that administrator (it refuses manager and employee accounts, which an administrator resets on the website), and ends every existing sign-in of that account. Without a terminal, pipe the password in on stdin: `printf '%s\n' "$NEW_PASSWORD" | npm run admin:reset-password -- admin@company.com`. On Render, run it from the service's **Shell** tab inside `server/` as `npm run admin:reset-password -- admin@company.com`.

**How it's used:** an administrator creates managers (**Managers**) and employees (**Employees**, choosing each person's manager). New accounts get a temporary password and must choose their own at first sign-in, on the website or in the desktop agent (the server refuses everything else until they do). Managers assign tasks to their team; employees start them and submit them for review; managers approve the work or send it back with feedback. The in-app **Help** page (also public at `/help`) is the full user guide, with a permission table and troubleshooting.

### AI assistant

The **AI assistant** page (every role) answers questions about tasks, deadlines and sign-in activity. The server calculates every number from the records, Claude only interprets them, and statements the records don't support are removed. Set `ANTHROPIC_API_KEY` in `server/.env` to use Claude; without it, answers come from fixed rules. See [docs/ai-agent.md](docs/ai-agent.md) and the [evaluation report](docs/evaluation/ai-agent-evaluation.md).

### AI service (optional)

Without it, reports fall back to a basic summary.

```bash
cd ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Analysis agent (optional, for screenshots)

Needs an Anthropic API key and the same `SERVICE_API_KEY` as `server/.env`. See [analysis-agent/README.md](analysis-agent/README.md).

### Camera agent (optional, opt-in webcam checks)

Runs on the employee's own computer and is signed in as them. Each check produces a label such as "at the desk", "on a call" or "away", which feeds the daily analysis. No image is ever stored. See [camera-agent/README.md](camera-agent/README.md).

```bash
cd camera-agent && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
python -m app.main consent     # read what it does, type I AGREE
python -m app.main run
```

### Desktop agent (optional)

```bash
npm run dev:agent
```

In real use, employees don't run it from source: they **download it from the website** (see below). Sign in with an employee account. On first launch it walks the person through choosing what to share and granting OS permissions. It runs on macOS, Windows and Linux; see the [OS support table](desktop-agent/README.md#operating-system-support) for what each system allows. See [desktop-agent/README.md](desktop-agent/README.md) for what it collects and for packaging installers.

## How employees get the desktop agent

1. **Publish the installers** (administrator, once per release). Pass the address that *employees' computers* use to reach the API, so the agent connects there with no setup:

   ```bash
   npm run agent:publish -- --server https://workplus.example.com
   ```

   This builds the installer for the OS you run it on (with that address built in) and copies it to `server/storage/downloads` (or `DOWNLOADS_DIR`). Native modules mean each OS must be built on that OS. To cover all three from a Mac, run `scripts/cross-build-docker.sh <same address> <out folder>` (needs Docker; builds Linux `.AppImage`/`.deb` and a Windows `.zip`), then `npm run agent:publish -- --from <out folder>`. For a Windows `.exe` installer, run `agent:publish` on a Windows PC, or use the **Build desktop agent** GitHub workflow and publish its artifacts with `--from`.
2. **Each employee opens `/download`** on the website (linked from the home page and from the dashboard's "Desktop agent not running" badge). The page detects Windows, macOS or Linux and offers the matching installer. All formats are listed below it, with first-launch tips.
3. They install it, accept the monitoring notice and sign in with the work email and temporary password from the administrator. The agent asks them to choose their own password, then what to share.
4. Tracking starts. The agent records activity every minute and uploads it every few minutes, under the account it signed in with (the server takes the person from the sign-in, never from the data). It appears on their own dashboard and their manager's; other employees can't see it.

The download endpoints (`GET /api/downloads`, `GET /api/downloads/:file`) are public and only serve installer files from that folder.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API and dashboard together |
| `npm run dev:lan` | Same, but the dashboard is also reachable from other computers on your network (`http://<this computer's IP>:5173`) |
| `npm run dev:server` / `dev:client` / `dev:agent` | One app on its own |
| `npm run seed` | Reset the database with demo data (asks for the database name; refused in production) |
| `npx newman@6 run docs/postman/WorkPlus.postman_collection.json -e docs/postman/WorkPlus.local.postman_environment.json` | Run the Postman collection (323 requests, every route and permission rule) against a local API with demo data at `http://localhost:4111/api`; edit `baseUrl` in the environment file for another address. The same files import into Postman |
| `npm run admin:reset-password -- <email>` | Set a new password for an administrator who can't sign in |
| `npm run build` | Production build of the dashboard (`client/dist`) |
| `npm test` | Server unit tests (AI service: `pytest` inside `ai-service/`). Add `TEST_MONGODB_URI=mongodb://127.0.0.1:27017/workplus_test` to also run the end-to-end admin → manager → employee workflow test, which empties that database |
| `npm run agent:publish -- --server <address>` | Build the desktop agent installer for this OS and publish it on the website's Download page |
| `npm run evaluate:agent -w @tracker/server` | Evaluate the AI assistant and write `docs/evaluation/ai-agent-evaluation.md` (see [docs/ai-agent.md](docs/ai-agent.md)) |
| `npm run analyze` | Run the analysis agent for today (inside its activated virtualenv) |

Every push runs these tests on Windows, macOS and Linux via GitHub Actions (`.github/workflows/ci.yml`).

## Privacy rules

These are part of the product contract:

1. **Consent first.** The installer shows a monitoring notice (`desktop-agent/build/license_en.txt`), including that the manager can view screenshots, and the person must click **I Agree** to install (Windows installer and macOS disk image). When the person opens the desktop agent for the first time, it explains what can be collected and lets them choose. Nothing is tracked until they agree, and the server rejects any data they didn't agree to. They can change or withdraw consent at any time.
2. **Tracking can be controlled from the website.** Signing in to the desktop agent or on the dashboard starts tracking; signing out of the dashboard stops it, and **Start tracking** in the agent resumes it. The employee can **Pause / Resume** from the dashboard's top bar or from the agent, and both stay in step. The server ignores anything recorded while tracking is paused or stopped.
3. **Real OS permissions.** The agent asks the operating system for each permission it needs (e.g. Screen Recording and Input Monitoring on macOS) and only for what the person enabled.
4. Store activity counts and durations, never keystroke content, window titles or URLs.
5. **Screenshots are optional and off by default.** When the person turns them on, one is taken every 5 minutes (never while paused, idle or locked), with a notification each time. The person's **manager (own team only) and admins can view screenshots**. Turning screenshots on requires a separate, explicit checkbox: "I agree that my manager and administrators can view my screenshots" (stored as `managerViewScreenshots`; the server refuses screenshots without it). **Every view is recorded**, and the person sees who opened each screenshot and when. The person can delete any screenshot, and turning screenshots off deletes all of them. The analysis agent labels each one by category. **Every screenshot is deleted automatically 3 days after it was taken** (`SCREENSHOT_RETENTION_DAYS`). Screenshots taken under the earlier terms (version 1, "managers never see screenshots") are never shown to managers.
6. Raw activity expires after 90 days; daily aggregates (performance records, daily analyses) are kept, including after screenshots are turned off or consent is withdrawn. A daily analysis keeps its short per-screenshot activity labels, never the images.
7. Every API route except sign-in, first-run setup, demo sign-in, health and installer downloads is protected by JWT and role-based scoping. Changing or resetting a password, or deactivating an account, ends its existing sessions. Managers see only their team; employees see only themselves.
8. AI output is labelled as AI-generated. Reports use aggregated daily metrics only; daily analyses use the category label and a short activity description of each consented screenshot, never stored images.

## Deployment

The API and AI service go on **Render** (`render.yaml`), the dashboard on **Vercel** (`client/vercel.json`), and the database on **MongoDB Atlas**.

1. **Atlas**: under Network Access, allow `0.0.0.0/0` (Render's IP addresses change). Copy the connection string.
2. **Render**: New → **Blueprint** → pick this repo. It creates `workplus-api` and `workplus-ai` and asks for:
   - `MONGODB_URI`: the Atlas connection string
   - `CLIENT_ORIGIN`: leave as `https://placeholder.vercel.app` for now
   - `AI_SERVICE_URL`: the `workplus-ai` URL, e.g. `https://workplus-ai.onrender.com` (fill in after it deploys)

   `JWT_SECRET` and `SERVICE_API_KEY` are generated. Set `APP_TIMEZONE` to where people work (for example `Asia/Kolkata`): every "day" in dashboards, screenshots and daily analyses runs midnight to midnight there. It defaults to `UTC`. After changing it on a database that already has data, sign in as an administrator and call `POST /api/performance/recalculate` with `{"days": 90}` once, so past daily records are rebuilt under the new zone. `DEMO_MODE` has no effect in production (`NODE_ENV=production`), so passwordless demo sign-in can't be turned on there. Check `https://<workplus-api>.onrender.com/api/health` shows `"database":"connected"`.
   Then open the site and click **Create admin account** to register your administrator (see above). Nothing is created automatically, and the seed never runs on deploy.
3. **Vercel**: Add New → Project → this repo, **Root Directory `client`**, environment variable `VITE_API_URL=https://<workplus-api>.onrender.com` (no `/api`, no trailing slash). Deploy.
4. **Connect them**: on Render, set `CLIENT_ORIGIN` to the Vercel URL (no trailing slash).
5. **Demo data** (optional, only for a demo database): run `npm run seed` locally with `server/.env` pointing at that database (`NODE_ENV=development`). It deletes everything there, so it asks you to type the database name first. Never point it at a database with real data.

Every push to `main` redeploys both. Notes:

- Render's free plan sleeps after 15 minutes idle; the first request then takes 30–50 seconds.
- Its disk is wiped on every deploy, so screenshots are lost. For real use, add a Render Disk and set `SCREENSHOT_DIR` to a folder on it. Installers don't need the disk: `DOWNLOADS_GITHUB_REPO` (set in `render.yaml`) makes the server offer the ones attached to the repository's latest GitHub Release.
- After changing `VITE_API_URL`, redeploy on Vercel (it is built into the dashboard).
- **desktop-agent**: push a tag matching `desktop-agent/package.json`'s version (e.g. `git tag v0.1.0 && git push origin v0.1.0`). The **Build desktop agent** workflow builds every installer with the API address built in (repository variable `AGENT_SERVER_URL`, or the Render URL by default) and attaches them to a GitHub Release; they then appear on the website's `/download` page.
