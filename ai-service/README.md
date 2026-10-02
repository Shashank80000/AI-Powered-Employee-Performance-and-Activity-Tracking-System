# WorkPlus AI Service

Python FastAPI service that provides the AI/ML layer of the **AI-Powered Employee
Performance and Activity Tracking System**. The Node/Express API (`server/`) calls it
over HTTP; it is not exposed to browsers directly.

## Privacy rule

This service only ever receives **aggregated numeric daily metrics** (seconds and task
counts). It never receives raw keystrokes, window titles, URLs or screenshots, and the
request schema has no fields for them. Every report carries a disclaimer and is meant to
be reviewed by a person before anyone acts on it.

## What it does

| Component | Approach |
|-----------|----------|
| Productivity score | Transparent weighted model (no training): active ratio 30%, productive-app ratio 30%, task completion 25%, on-time delivery 15%. Factors with no data are excluded and their weight is redistributed. |
| Trends | Least-squares slope of daily scores (points per day; `flat` when \|slope\| <= 0.5) plus a 3-day trailing moving average. |
| Anomalies | Z-score detector (population std, threshold 2.0) over `activeSeconds`, `idleSeconds` and daily `score`. Returns nothing for fewer than 3 points or zero variance. |
| Report | Deterministic templates for summary, highlights and recommendations. No external LLM; see the `LLM HOOK` comment in `app/services/report_generation.py`. |

Only the Python standard library (`statistics`) is used for maths.

## Setup

Requires Python 3.10+ (tested on 3.14).

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs

## Test

```bash
pytest
```

## Endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET | `/health` | `{"status":"ok","service":"ai-service"}` |
| POST | `/api/ai/productivity` | `employeeId`, `score` (0-100, 1 decimal), `breakdown` (`activeRatio`, `productiveRatio`, `completionRate`, `onTimeRate`, 0-1), `dailyScores` (`date`, `score`) |
| POST | `/api/ai/trends` | `employeeId`, `slope`, `direction` (`up`/`down`/`flat`), `movingAverage` (`date`, `value`) |
| POST | `/api/ai/anomalies` | `employeeId`, `anomalies` (`date`, `metric`, `value`, `zScore`) |
| POST | `/api/ai/report` | `employeeId`, `score`, `trend`, `summary`, `highlights`, `recommendations`, `anomalies`, `generatedBy`, `disclaimer` |

Invalid input returns `422` (FastAPI's default validation error).

### Request body (all POST routes)

```json
{
  "employeeId": "emp-1",
  "employeeName": "Asha Rao",
  "periodStart": "2026-09-01",
  "periodEnd": "2026-09-03",
  "days": [
    {
      "date": "2026-09-01",
      "activeSeconds": 21600,
      "idleSeconds": 7200,
      "productiveAppSeconds": 18000,
      "tasksCompleted": 4,
      "tasksAssigned": 5,
      "onTimeTasks": 3
    }
  ]
}
```

`employeeName`, `periodStart` and `periodEnd` are optional; `days` needs at least one item
and every metric must be an integer `>= 0`. Days are sorted by date, duplicate dates are
summed, productive time is capped at active time and on-time tasks at completed tasks.

Example:

```bash
curl -s -X POST http://localhost:8000/api/ai/report \
  -H 'Content-Type: application/json' \
  -d '{"employeeId":"emp-1","days":[{"date":"2026-09-01","activeSeconds":21600,"idleSeconds":7200,"productiveAppSeconds":18000,"tasksCompleted":4,"tasksAssigned":5,"onTimeTasks":3}]}'
```

## Layout

```text
app/
  main.py                       FastAPI app and /health
  schemas.py                    Pydantic request/response models (camelCase JSON)
  models/productivity_model.py  Weighted scoring model
  models/anomaly_model.py       Z-score anomaly detector
  services/                     Productivity, trend, anomaly and report logic
  routes/ai_routes.py           /api/ai/* routes
  utils/data_processing.py      Cleaning, safe ratios, sorting
tests/test_ai_routes.py         pytest + TestClient
```
