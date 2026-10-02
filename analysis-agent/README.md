# WorkPlus Analysis Agent

A small Python job that runs once a day (or on demand) next to the Node server. For a given
date it:

1. Fetches every **pending** screenshot for that date from the server's internal API.
2. Classifies each screenshot with Claude vision into one generic category
   (`coding`, `documents`, `design`, `communication`, `meeting`, `research`, `admin`,
   `entertainment`, `social_media`, `idle_or_locked`, `other`).
3. Reports the classification back (`PATCH /api/internal/screenshots/{id}`). The server
   keeps the image until its 3-day retention ends.
4. For each employee, builds a whole-day analysis (minutes per category, productive
   minutes, a timeline of generic labels, plus that day's activity metrics), asks Claude
   for a short supportive summary, and stores it (`PUT /api/internal/daily-analyses`).

If the person turned on camera checks in `camera-agent`, the day analysis also gets `camera`
totals (minutes per camera state, at-desk and away minutes), and the summary prompt receives
those totals plus the times the state changed. Camera labels come from the server; this agent never sees
webcam frames. Employees with camera observations but no screenshots are analyzed too.

`categoryMinutes` = analyzed screenshots per category x `intervalMinutes`. If an employee
has no analyzed screenshots, the agent still writes an analysis built from the day's
activity metrics with a deterministic template, without calling Claude.

## Privacy guarantees

- Every person has consented to screenshots in the desktop agent. The classification
  prompt tells the model it is looking at a consenting user's work screen.
- Images are **never written to disk** by this agent. Bytes are held in memory for a
  single request and are **never logged** (logs contain screenshot ids and counts only).
- The model returns only `{category, activity, productive, confidence}`. The `activity`
  label is generic (at most 8 words) and is instructed to contain no names, email
  addresses, message contents, numbers, URLs, file names or other on-screen text. The
  agent also strips any word that looks like such text before storing it.
- The day summary request sends **only aggregated text** (category minutes, timeline
  labels and times, activity metrics). No images, and no employee names.
- The server deletes every screenshot 3 days after capture (`SCREENSHOT_RETENTION_DAYS` in
  `server/.env`), analysed or not. Run this agent at least daily so screenshots are labelled
  before they expire; anything missed in that window is simply deleted.
- Summaries are labelled `AI-generated summary:` (template ones `Automatic summary:`) and
  are meant to be supportive, not disciplinary.
- If Claude declines a screenshot (`stop_reason == "refusal"`), it is stored as category
  `unclassified`. Failed screenshots are marked `failed` so the server can clean them up.

## Setup

Requires Python 3.10+.

```bash
cd analysis-agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # then edit; load it with: set -a; source .env; set +a
```

| Variable | Default | Notes |
|----------|---------|-------|
| `SERVER_URL` | `http://localhost:4000` | Node server base URL |
| `SERVICE_API_KEY` | (required) | Sent as `X-Service-Key` on every request |
| `ANTHROPIC_API_KEY` | | Or `ANTHROPIC_AUTH_TOKEN` / an `ant auth login` profile; resolved by the SDK |
| `ANALYSIS_MODEL` | `claude-opus-5-5` | Any Claude model id |
| `REFUSAL_FALLBACK` | `true` | Server-side refusal fallback (Claude API only). Set `false` on Bedrock / Vertex / Foundry |
| `MAX_CONCURRENCY` | `4` | Parallel screenshot / employee workers |
| `DRY_RUN` | `false` | Calls Claude but writes nothing back to the server |

## Running

```bash
python -m app.main run                       # today (local time)
python -m app.main run --date 2026-09-30     # a specific date
python -m app.main run --employee emp-123    # also analyze an employee with no pending shots
python -m app.main schedule --at 23:30       # loop forever, run daily at 23:30 local time
```

`run` exits non-zero if any screenshot or day analysis failed.

### Cron instead of `schedule`

```cron
30 23 * * * cd /path/to/analysis-agent && set -a && . ./.env && set +a && .venv/bin/python -m app.main run >> analysis.log 2>&1
```

## Tests

```bash
pytest
```

Tests mock the server with `httpx.MockTransport` and replace the Anthropic client with a
scripted fake. They make **no** real network or API calls.

## How Claude is called

- `client.beta.messages.create(...)` with `output_config={"effort": ..., "format": {"type": "json_schema", ...}}`
  for structured JSON, plus `betas=["server-side-fallback-2026-07-01"], fallbacks="default"`
  so a policy decline is retried server-side on Anthropic's recommended model.
- Effort `low` for per-image classification, `medium` for the day summary.
- Images are sent as base64 `image/jpeg` content blocks.
- Retries with backoff on `RateLimitError`, 5xx `APIStatusError` and `APIConnectionError`;
  other 4xx errors fail fast. A screenshot that still fails is marked `failed`; a day
  summary that fails falls back to the template.

## Cost

Claude calls per day = (screenshots per employee x employees) + (one summary per employee
with at least one analyzed screenshot). At a 5-minute interval, an 8-hour day is about 96
screenshots per person, so 20 employees is roughly 1,900 image calls plus 20 summary calls
every day. Image calls dominate the cost.

Ways to reduce it:

- Set a cheaper model via `ANALYSIS_MODEL` (for example `claude-sonnet-5-5` or
  `claude-haiku-4-5`). Check classification quality on a sample first.
- This job is not urgent, so the **Message Batches API** (about 50% cheaper, results
  within 24 hours) is a good fit for the classification step. Note that the server-side
  `fallbacks` parameter is not accepted on the Batches API, so refusals there would only
  map to `unclassified`.
- Increase the desktop agent's screenshot interval.
