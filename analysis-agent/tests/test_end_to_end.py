"""Full pipeline against the mocked server and a scripted Anthropic client."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import date

from app.main import build_parser, next_run_at, run_for_date
from tests.conftest import FakeAnthropic, FakeServer, refusal_response, text_response

DAY = date(2026, 9, 30)
PERF = {"activeSeconds": 3600, "idleSeconds": 600, "productiveAppSeconds": 3000,
        "tasksAssigned": 2, "tasksCompleted": 2, "onTimeTasks": 2, "productivityScore": 90}


def pending_shot(shot_id: str, employee: str, hour: int) -> dict:
    return {"id": shot_id, "employeeId": employee, "capturedAt": f"2026-09-30T{hour:02d}:00:00Z"}


def day_shot(shot_id: str, hour: int) -> dict:
    return {"id": shot_id, "capturedAt": f"2026-09-30T{hour:02d}:00:00Z", "status": "pending",
            "analysis": None}


def build_server() -> FakeServer:
    pending = [pending_shot("a1", "emp-a", 9), pending_shot("a2", "emp-a", 10),
               pending_shot("b1", "emp-b", 9), pending_shot("missing", "emp-b", 11)]
    days = {
        "emp-a": {"employee": {"id": "emp-a", "name": "A"}, "intervalMinutes": 5,
                  "performance": PERF, "screenshots": [day_shot("a1", 9), day_shot("a2", 10)]},
        "emp-b": {"employee": {"id": "emp-b", "name": "B"}, "intervalMinutes": 5,
                  "performance": PERF,
                  "screenshots": [day_shot("b1", 9), day_shot("missing", 11)]},
    }
    return FakeServer(pending, days)


def reply(kwargs: dict):
    """Image requests -> classification; text requests -> day summary."""
    content = kwargs["messages"][0]["content"]
    if isinstance(content, str):
        return text_response({"summary": "Nice steady day.", "highlights": ["Focused"],
                              "suggestions": []})
    return text_response({"category": "coding", "activity": "editing code in an IDE",
                          "productive": True, "confidence": 0.9})


def test_end_to_end(settings) -> None:
    server = build_server()
    image_calls: list[int] = []

    def scripted(kwargs: dict):
        if not isinstance(kwargs["messages"][0]["content"], str):
            image_calls.append(1)
            if len(image_calls) == 3:  # b1 (one worker, so order is a1, a2, b1)
                return refusal_response()
        return reply(kwargs)

    fake = FakeAnthropic(scripted)
    with server.client() as client:
        report = run_for_date(replace(settings, max_concurrency=1), client, fake, DAY,
                              sleep=lambda _: None)

    assert report.screenshots == 4
    assert report.analyzed == 3 and report.failed == 1
    assert server.patches["missing"] == {"status": "failed"}
    statuses = {k: v["status"] for k, v in server.patches.items()}
    assert statuses == {"a1": "analyzed", "a2": "analyzed", "b1": "analyzed", "missing": "failed"}
    assert server.patches["b1"]["analysis"]["category"] == "unclassified"

    puts = {p["employeeId"]: p for p in server.puts}
    assert set(puts) == {"emp-a", "emp-b"}
    assert puts["emp-a"]["categoryMinutes"] == {"coding": 10}
    assert puts["emp-a"]["productiveMinutes"] == 10
    assert puts["emp-a"]["summary"].startswith("AI-generated summary: ")
    assert puts["emp-b"]["categoryMinutes"] == {"unclassified": 5}
    assert puts["emp-b"]["analyzedCount"] == 1 and puts["emp-b"]["screenshotCount"] == 2
    assert report.analyses_saved == 2

    # Every request carried the service key; no image bytes went into any PUT/PATCH body.
    assert all(r.headers["X-Service-Key"] == "test-key" for r in server.requests)
    for body in [*server.patches.values(), *server.puts]:
        assert "fake-jpeg" not in json.dumps(body)


def test_dry_run_writes_nothing(settings) -> None:
    server = build_server()
    fake = FakeAnthropic(reply)
    with server.client() as client:
        report = run_for_date(replace(settings, dry_run=True), client, fake, DAY,
                              sleep=lambda _: None)
    assert server.patches == {} and server.puts == []
    assert report.analyzed == 3 and report.analyses_saved == 2
    methods = {r.method for r in server.requests}
    assert methods == {"GET"}


def test_cli_parser_and_schedule_math() -> None:
    from datetime import datetime

    args = build_parser().parse_args(["run", "--date", "2026-09-30"])
    assert args.date == DAY
    assert build_parser().parse_args(["schedule", "--at", "23:30"]).at == "23:30"
    assert next_run_at(datetime(2026, 9, 30, 22, 0), "23:30") == datetime(2026, 9, 30, 23, 30)
    assert next_run_at(datetime(2026, 9, 30, 23, 45), "23:30") == datetime(2026, 10, 1, 23, 30)
