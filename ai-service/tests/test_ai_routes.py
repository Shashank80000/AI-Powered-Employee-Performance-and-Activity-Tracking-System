"""API tests for the AI service using FastAPI's TestClient."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.anomaly_model import ZScoreAnomalyDetector
from app.services.report_generation import DISCLAIMER

client = TestClient(app)


def make_day(
    day: int,
    active: int = 6 * 3600,
    idle: int = 2 * 3600,
    productive: int = 5 * 3600,
    completed: int = 4,
    assigned: int = 5,
    on_time: int = 3,
) -> dict:
    """Build one camelCase DailyMetrics payload for 2026-09-(day)."""
    return {
        "date": (date(2026, 9, 1) + timedelta(days=day - 1)).isoformat(),
        "activeSeconds": active,
        "idleSeconds": idle,
        "productiveAppSeconds": productive,
        "tasksCompleted": completed,
        "tasksAssigned": assigned,
        "onTimeTasks": on_time,
    }


def payload(days: list[dict], **extra) -> dict:
    return {"employeeId": "emp-1", "employeeName": "Asha Rao", "days": days, **extra}


# ------------------------------------------------------------------ health


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ai-service"}


# ------------------------------------------------------------ productivity


def test_productivity_score_and_breakdown() -> None:
    response = client.post("/api/ai/productivity", json=payload([make_day(1)]))
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"employeeId", "score", "breakdown", "dailyScores"}
    assert body["employeeId"] == "emp-1"
    assert body["breakdown"] == {
        "activeRatio": 0.75,
        "productiveRatio": 0.8333,
        "completionRate": 0.8,
        "onTimeRate": 0.75,
    }
    # 0.3*0.75 + 0.3*0.8333 + 0.25*0.8 + 0.15*0.75 = 0.7875 -> 78.8
    assert body["score"] == 78.8
    assert body["dailyScores"] == [{"date": "2026-09-01", "score": 78.8}]


def test_productivity_handles_zero_denominators() -> None:
    day = make_day(1, active=0, idle=0, productive=0, completed=0, assigned=0, on_time=0)
    body = client.post("/api/ai/productivity", json=payload([day])).json()
    assert body["score"] == 0.0
    assert all(v == 0.0 for v in body["breakdown"].values())


def test_productivity_redistributes_missing_task_weight() -> None:
    day = make_day(1, active=3600, idle=0, productive=3600, completed=0, assigned=0, on_time=0)
    body = client.post("/api/ai/productivity", json=payload([day])).json()
    assert body["score"] == 100.0


def test_productivity_sorts_days_and_clamps_values() -> None:
    days = [make_day(3), make_day(1, productive=99 * 3600, on_time=99), make_day(2)]
    body = client.post("/api/ai/productivity", json=payload(days)).json()
    assert [d["date"] for d in body["dailyScores"]] == ["2026-09-01", "2026-09-02", "2026-09-03"]
    assert 0 <= body["score"] <= 100
    assert all(0 <= v <= 1 for v in body["breakdown"].values())


# ------------------------------------------------------------------ trends


def test_trends_up() -> None:
    days = [make_day(i, completed=i, assigned=5, on_time=i) for i in range(1, 6)]
    body = client.post("/api/ai/trends", json=payload(days)).json()
    assert set(body) == {"employeeId", "slope", "direction", "movingAverage"}
    assert body["direction"] == "up"
    assert body["slope"] > 0
    assert len(body["movingAverage"]) == 5
    assert set(body["movingAverage"][0]) == {"date", "value"}


def test_trends_down() -> None:
    days = [make_day(i, completed=6 - i, assigned=5, on_time=6 - i) for i in range(1, 6)]
    body = client.post("/api/ai/trends", json=payload(days)).json()
    assert body["direction"] == "down"
    assert body["slope"] < 0


def test_trends_flat_and_single_day() -> None:
    flat = client.post("/api/ai/trends", json=payload([make_day(i) for i in range(1, 5)])).json()
    assert flat["direction"] == "flat"
    assert flat["slope"] == 0.0
    single = client.post("/api/ai/trends", json=payload([make_day(1)])).json()
    assert single["direction"] == "flat"
    assert single["movingAverage"] == [{"date": "2026-09-01", "value": 78.8}]


def test_moving_average_is_three_day_trailing() -> None:
    days = [make_day(i, active=3600, idle=0, productive=3600 * (i % 2), completed=0, assigned=0)
            for i in range(1, 5)]
    # daily scores: 100, 50, 100, 50
    body = client.post("/api/ai/trends", json=payload(days)).json()
    assert [p["value"] for p in body["movingAverage"]] == [100.0, 75.0, 83.33, 66.67]


# --------------------------------------------------------------- anomalies


def test_anomalies_detects_spike() -> None:
    days = [make_day(i) for i in range(1, 8)]
    days[5] = make_day(6, active=3600, idle=7 * 3600, productive=600)
    body = client.post("/api/ai/anomalies", json=payload(days)).json()
    assert set(body) == {"employeeId", "anomalies"}
    metrics = {a["metric"] for a in body["anomalies"]}
    assert metrics == {"activeSeconds", "idleSeconds", "score"}
    for anomaly in body["anomalies"]:
        assert set(anomaly) == {"date", "metric", "value", "zScore"}
        assert anomaly["date"] == "2026-09-06"
        assert abs(anomaly["zScore"]) >= 2.0


def test_anomalies_none_for_constant_or_short_series() -> None:
    constant = client.post("/api/ai/anomalies", json=payload([make_day(i) for i in range(1, 8)]))
    assert constant.json()["anomalies"] == []
    short = client.post("/api/ai/anomalies", json=payload([make_day(1), make_day(2, active=1)]))
    assert short.json()["anomalies"] == []


def test_detector_threshold_is_configurable() -> None:
    values = [10.0, 10.0, 10.0, 10.0, 10.0, 20.0]
    assert ZScoreAnomalyDetector(threshold=3.0).detect(values) == []
    assert len(ZScoreAnomalyDetector(threshold=2.0).detect(values)) == 1
    with pytest.raises(ValueError):
        ZScoreAnomalyDetector(threshold=0)


# ------------------------------------------------------------------ report


def test_report_contract() -> None:
    days = [make_day(i) for i in range(1, 8)]
    days[5] = make_day(6, active=3600, idle=7 * 3600, productive=600)
    body = client.post(
        "/api/ai/report",
        json=payload(days, periodStart="2026-09-01", periodEnd="2026-09-07"),
    ).json()
    assert set(body) == {
        "employeeId", "score", "trend", "summary", "highlights",
        "recommendations", "anomalies", "generatedBy", "disclaimer",
    }
    assert body["generatedBy"] == "ai-service"
    assert body["disclaimer"] == DISCLAIMER
    assert body["trend"] in {"up", "down", "flat"}
    assert "Asha Rao" in body["summary"]
    assert "2026-09-01 to 2026-09-07" in body["summary"]
    assert body["highlights"] and body["recommendations"]
    assert body["anomalies"]
    assert any("2026-09-06" in r for r in body["recommendations"])


def test_report_is_deterministic_and_handles_missing_name() -> None:
    request = {"employeeId": "emp-9", "days": [make_day(1), make_day(2)]}
    first = client.post("/api/ai/report", json=request).json()
    second = client.post("/api/ai/report", json=request).json()
    assert first == second
    assert "Employee emp-9" in first["summary"]
    assert first["anomalies"] == []


# -------------------------------------------------------------- validation


@pytest.mark.parametrize("route", ["productivity", "trends", "anomalies", "report"])
@pytest.mark.parametrize(
    "body",
    [
        {"employeeId": "emp-1", "days": []},
        {"days": [make_day(1)]},
        {"employeeId": "emp-1", "days": [{**make_day(1), "activeSeconds": -5}]},
        {"employeeId": "emp-1", "days": [{**make_day(1), "date": "not-a-date"}]},
        {"employeeId": "emp-1", "days": [{"date": "2026-09-01"}]},
    ],
)
def test_invalid_input_returns_422(route: str, body: dict) -> None:
    assert client.post(f"/api/ai/{route}", json=body).status_code == 422
