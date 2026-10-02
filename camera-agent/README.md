# WorkPlus Camera Agent

An opt-in agent that the **employee runs on their own computer**. While tracking is active it
turns on the webcam about every 5 minutes, takes one frame, turns the camera off again, and
reports **a generic label** of what is happening, such as "at the computer", "on a call" or
"away from desk". The labels feed the whole-day analysis written by
[analysis-agent](../analysis-agent/README.md), which shows them on the dashboard as
**At the desk (camera)**.

## Two modes

| | `local` (default) | `vision` |
|---|---|---|
| How a frame is labelled | OpenCV face detection on this computer | Claude vision (Anthropic API) |
| Where the frame goes | Nowhere. It stays in memory on this computer | Sent to the Claude API for one request |
| States | `present_at_desk`, `away_from_desk`, `camera_blocked` | `working_at_computer`, `reading_or_writing`, `on_a_call`, `talking_with_someone`, `using_phone`, `eating_or_drinking`, `taking_a_break`, `away_from_desk`, `camera_blocked`, `other` (`unclassified` on refusal) |
| Consent needed | `local` | `vision` |

The stricter of `CAMERA_MODE` and the consented mode is used. The server refuses `vision`
labels from someone who consented to `local` only.

## Privacy guarantees

- **Separate, explicit consent.** `consent` prints exactly what happens, who can see the labels
  (you, your manager, administrators) and how long they are kept. Nothing happens until you
  type `I AGREE`. Screenshot consent does not cover the camera.
- **No images are stored anywhere.** Frames are never written to disk, never uploaded to the
  WorkPlus server and never logged. The server only accepts
  `{observedAt, state, activity, confidence, source}`.
- **Generic labels only.** The vision prompt forbids identifying anyone or describing faces,
  bodies, clothing, emotions, health, the room, other people or any visible text. The agent also
  strips anything that looks like text, numbers or URLs, and caps labels at 8 words. A dark or
  covered frame is labelled `camera_blocked` and is never sent to Claude.
- **Follows tracking.** No frame is taken unless tracking is `active` (website or desktop agent).
  The server also rejects observations timed during a pause.
- **Easy to stop.** `withdraw` turns checks off and deletes every camera label. Withdrawing
  all consent in the desktop agent does the same. Labels expire after 30 days
  (`CAMERA_RETENTION_DAYS` in `server/.env`).
- The summary prompt treats breaks and time away as a normal part of the day, never as misconduct.

## Setup

Requires Python 3.10+ and a webcam. On macOS, the first check asks for camera permission
for your terminal app (System Settings > Privacy & Security > Camera).

```bash
cd camera-agent
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # then edit; load it with: set -a; source .env; set +a
```

`opencv-python-headless` is pinned below 5, because OpenCV 5 removed the Haar face cascades
used by local mode.

## Running

You sign in with your own WorkPlus employee account each time. The password is asked for
and never stored.

```bash
python -m app.main consent --mode local   # read, then type I AGREE (or --mode vision)
python -m app.main status                 # on/off, mode, interval, tracking state
python -m app.main once                   # one check now; prints e.g. "recorded -> present_at_desk"
python -m app.main run                    # a check every CAMERA_INTERVAL_MINUTES until Ctrl+C
python -m app.main withdraw               # turn off and delete all camera labels
```

`DRY_RUN=true` labels frames and prints the result without sending anything to the server.
The sign-in lasts as long as the server's `JWT_EXPIRES_IN` (3 days by default). After that,
`run` stops and asks you to start it again.

## Limits

- Local mode only knows whether a face is visible. Turning far away from the camera can read as
  `away_from_desk`.
- Each observation counts for one interval in the day totals, so the minutes are estimates.

## Tests

```bash
python -m pytest -q
```

The tests use a fake webcam frame, a mocked server and a scripted Anthropic client. They need
no camera, no network and no OpenCV.
