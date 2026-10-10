# API

## Server (`http://localhost:4000/api`)

Every route except `/health` and `/auth/login` needs `Authorization: Bearer <token>`. Errors look like `{ "error": { "message": "...", "details": [...] } }`.

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| GET | `/health` | public | Service and database status |
| POST | `/auth/login` | public | `{ email, password }` → `{ token, user }` |
| GET | `/auth/me` | any | Current user, with `mustChangePassword` (true after an admin set a temporary password) |
| POST | `/auth/password` | any | `{ currentPassword, newPassword }`: change own password; clears `mustChangePassword`. Passwords need 8+ characters with a letter and a number |
| GET | `/auth/demo` | public | `{ enabled, roles }`: whether one-click demo sign-in is available |
| POST | `/auth/demo` | public | `{ role: admin\|manager\|employee }`: sign in as the seeded demo account. 404 unless `DEMO_MODE=true` |
| GET | `/employees` | admin, manager | Employees in scope |
| POST | `/employees` | admin | Create an employee account |
| GET | `/employees/managers` | admin | Active manager accounts, for assignment |
| GET | `/employees/me` | employee | Own profile, including `managerName` |
| GET | `/employees/:id` | any (scoped) | One employee |
| PATCH | `/employees/:id` | admin, manager | `{ designation?, department?, status?: active\|on-leave }`; admins also `name` and `manager` (an active manager, or `null`). 409 while deactivated |
| DELETE | `/employees/:id` | admin | Deactivate (account can no longer sign in; existing sessions stop working) |
| POST | `/employees/:id/reactivate` | admin | Let a deactivated employee sign in again |
| GET | `/users/managers` | admin | Every manager, active or not, with `teamSize` and `lastLoginAt` |
| POST | `/users/managers` | admin | `{ name, email, password }`: create a manager (asked to change the password at first sign-in) |
| PATCH | `/users/managers/:id` | admin | `{ name?, isActive? }`. Deactivating is refused (409) while the manager still has active employees |
| POST | `/users/:id/password` | admin | `{ password }`: temporary password for a manager or employee (not admins) |
| GET | `/tasks?assignedTo=me\|<id>&status=` | any (scoped) | List tasks, each with `history` (comments and review steps) |
| POST | `/tasks` | admin, manager | Create a task |
| PATCH | `/tasks/:id` | any (scoped) | Employees: `{ status?: todo\|in-progress\|review, note?, actualMinutesDelta? }` (`review` records a submission with the note; only managers mark work `done`; 409 once done). Managers: any field |
| POST | `/tasks/:id/comments` | any (scoped) | `{ text }`: add a comment to the task's history |
| POST | `/tasks/:id/review` | admin, manager | `{ decision: approve\|changes, comment? }` on a task in `review`: approve → `done`; changes (comment required) → `in-progress` |
| DELETE | `/tasks/:id` | admin, manager | Delete a task |
| POST | `/activity/snapshots` | employee | Desktop agent upload (see below) |
| GET | `/activity?employeeId=&period=` | any (scoped) | Raw snapshots, newest first (max 500) |
| GET | `/activity/summary?employeeId=&period=` | any (scoped) | Totals and top applications |
| GET | `/performance/dashboard?period=day\|week\|month` | any (scoped) | Everything the dashboard shows |
| GET | `/performance/employees/:id?period=` | any (scoped) | Daily scores for one employee |
| POST | `/performance/recalculate` | admin | `{ days }` – rebuild daily records |
| GET | `/tracking` | employee | `{ state: active\|paused\|stopped, changedBy, changedAt, agentConnected, consentGiven }`. With `X-Client: agent`, also records that the agent checked in |
| PUT | `/tracking` | employee | `{ state, source: web\|agent }`. The website sends `active` at sign-in and `stopped` at sign-out |
| GET | `/consent` | employee | The person's sharing choices + screenshot interval |
| PUT | `/consent` | employee | `{ activity: true, keyboard, apps, screenshots, managerViewScreenshots, version: 2 }` – save choices. `screenshots: true` requires `managerViewScreenshots: true` |
| DELETE | `/consent` | employee | Withdraw consent; deletes all of the person's screenshots and camera observations |
| POST | `/screenshots` | employee | Raw `image/jpeg` body (≤ 2 MB), header `X-Captured-At`. 403 without screenshot consent |
| GET | `/screenshots?date=` | employee | The person's own screenshots for a day, with `views` (who opened each, when) |
| GET | `/screenshots/:id/image` | employee | Own image only. 410 once deleted |
| GET | `/screenshots/team?employeeId=&date=` | manager (own team), admin | One employee's screenshots for a day (consent v2+ only) |
| GET | `/screenshots/team/:id/image` | manager (own team), admin | Open an image. **Each call is logged** and shown to the employee |
| DELETE | `/screenshots/:id` | employee | Delete own screenshot |
| GET | `/analysis/daily?employeeId=&date=` | any (scoped) | Whole-day analysis (labels only, no images), including `camera` totals |
| GET | `/downloads` | public | Desktop agent installers on the Download page: `{ version, installers: [{ file, platform, arch, format, label, preferred, bytes, url }] }` (newest version only) |
| GET | `/downloads/:file` | public | One installer file (only names from the listing) |
| GET | `/camera/consent` | employee | Camera-check consent, interval and retention |
| PUT | `/camera/consent` | employee | `{ agreed: true, mode: "local"\|"vision" }` – turn camera checks on (sent by camera-agent after the person types I AGREE) |
| DELETE | `/camera/consent` | employee | Turn camera checks off; deletes all of the person's camera observations |
| POST | `/camera/observations` | employee | `{ observedAt, state, activity?, confidence?, source: "local"\|"vision" }`. A label only, never an image. 403 without camera consent (or `vision` under `local` consent), 409 while tracking is paused |
| GET | `/camera/observations?date=` | employee | Own camera observations for a day, with minutes per state |
| GET | `/camera/team?employeeId=&date=` | manager (own team), admin | One employee's camera observations and totals for a day |
| GET | `/reports?employeeId=` | any (scoped) | Stored reports |
| GET | `/reports/:id` | any (scoped) | One report |
| POST | `/reports` | admin, manager | `{ employeeId, period: week\|month }` – generate a report |

### Snapshot upload

```json
{
  "snapshots": [
    { "capturedAt": "2026-10-01T10:00:00Z", "intervalSeconds": 60, "activeSeconds": 52, "idleSeconds": 8,
      "mouseEvents": 140, "keyboardEvents": 210, "taskId": "optional task id" }
  ],
  "applications": [{ "application": "Code", "durationSeconds": 48, "capturedAt": "2026-10-01T10:00:00Z" }]
}
```

`activeSeconds + idleSeconds` may not exceed `intervalSeconds`, and `capturedAt` may not be in the future.

### Internal API (analysis-agent only)

All routes need the header `X-Service-Key: <SERVICE_API_KEY>`; they are disabled when the key isn't configured.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/internal/screenshots?date=&status=pending` | Screenshots waiting for analysis |
| GET | `/internal/screenshots/:id/image` | Image bytes |
| PATCH | `/internal/screenshots/:id` | `{ status: "analyzed", analysis: {...} }` or `{ status: "failed" }` |
| GET | `/internal/day/:employeeId?date=` | Employee name, interval, the day's performance metrics, screenshot labels and camera labels |
| GET | `/internal/camera/employees?date=` | Ids of employees with camera observations that day |
| PUT | `/internal/daily-analyses` | Upsert the day's analysis |

## AI service (`http://localhost:8000`)

Called only by the server. All POST bodies are `{ employeeId, employeeName?, periodStart?, periodEnd?, days: [DailyMetrics] }`, where DailyMetrics is `{ date, activeSeconds, idleSeconds, productiveAppSeconds, tasksCompleted, tasksAssigned, onTimeTasks }`.

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/health` | `{ status, service }` |
| POST | `/api/ai/productivity` | `score`, `breakdown`, `dailyScores` |
| POST | `/api/ai/trends` | `slope`, `direction`, `movingAverage` |
| POST | `/api/ai/anomalies` | `anomalies[]` (z-score ≥ 2) |
| POST | `/api/ai/report` | `score`, `trend`, `summary`, `highlights`, `recommendations`, `anomalies`, `disclaimer` |

Interactive docs: `http://localhost:8000/docs`.
