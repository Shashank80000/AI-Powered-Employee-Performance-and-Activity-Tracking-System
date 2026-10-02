"""categoryMinutes math, template path and Claude summary handling."""

from __future__ import annotations

from datetime import date, datetime, timezone

from app.day_analyzer import (
    AI_LABEL,
    TEMPLATE_MODEL,
    analyze_day,
    analyzed_screenshots,
    category_minutes,
    productive_minutes,
    summary_input,
)
from app.schemas import DayData
from tests.conftest import FakeAnthropic, refusal_response, text_response

DAY = date(2026, 9, 30)
PERF = {"activeSeconds": 21600, "idleSeconds": 7200, "productiveAppSeconds": 18000,
        "tasksAssigned": 5, "tasksCompleted": 4, "onTimeTasks": 3, "productivityScore": 78.5}


def shot(i: int, category: str | None, productive: bool = True, status: str = "analyzed") -> dict:
    analysis = None if category is None else {
        "category": category, "activity": f"{category} work", "productive": productive,
        "confidence": 0.9}
    return {"id": f"s{i}", "capturedAt": f"2026-09-30T{9 + i:02d}:00:00Z", "status": status,
            "analysis": analysis}


def make_day(screens: list[dict], performance: dict | None = PERF, interval: int = 5) -> DayData:
    return DayData.model_validate({"employee": {"id": "emp-1", "name": "Asha Rao"},
                                   "intervalMinutes": interval, "performance": performance,
                                   "screenshots": screens})


def test_category_minutes_math() -> None:
    day = make_day([shot(0, "coding"), shot(1, "coding"), shot(2, "meeting"),
                    shot(3, "social_media", productive=False), shot(4, None, status="failed"),
                    shot(5, "unclassified", productive=False)], interval=10)
    shots = analyzed_screenshots(day)
    assert category_minutes(shots, day.interval_minutes) == {
        "coding": 20, "meeting": 10, "social_media": 10, "unclassified": 10}
    assert productive_minutes(shots, day.interval_minutes) == 30


def test_zero_screenshots_uses_template_without_claude(settings) -> None:
    fake = FakeAnthropic([])
    result = analyze_day(fake, settings, "emp-1", DAY, make_day([shot(0, None, status="failed")]))
    assert fake.calls == []
    assert result.model == TEMPLATE_MODEL
    assert result.analyzed_count == 0 and result.screenshot_count == 1
    assert result.category_minutes == {} and result.productive_minutes == 0
    assert "6.0 h active" in result.summary and "4 of 5" in result.summary
    assert result.highlights and len(result.highlights) <= 4


def test_zero_screenshots_and_no_metrics(settings) -> None:
    result = analyze_day(FakeAnthropic([]), settings, "emp-1", DAY, make_day([], performance=None))
    assert "no activity metrics" in result.summary
    assert result.timeline == []


def test_claude_summary_text_only_and_labelled(settings) -> None:
    fake = FakeAnthropic([text_response({
        "summary": "A focused day with plenty of coding.",
        "highlights": ["a", "b", "c", "d", "e"], "suggestions": ["Take a break."]})])
    now = datetime(2026, 9, 30, 23, 30, tzinfo=timezone.utc)
    result = analyze_day(fake, settings, "emp-1", DAY,
                         make_day([shot(0, "coding"), shot(1, "research")]), now=now)
    call = fake.calls[0]
    assert call["output_config"]["effort"] == "medium"
    assert isinstance(call["messages"][0]["content"], str)  # no image blocks
    assert "Asha" not in call["messages"][0]["content"]  # no names sent
    assert result.summary.startswith(AI_LABEL)
    assert len(result.highlights) == 4
    assert result.model == "claude-opus-5-5"
    body = result.model_dump(by_alias=True, mode="json")
    assert body["categoryMinutes"] == {"coding": 5, "research": 5}
    assert body["timeline"][0]["capturedAt"].startswith("2026-09-30T09:00")
    assert set(body) >= {"employeeId", "screenshotCount", "analyzedCount", "productiveMinutes",
                         "generatedAt"}


def test_summary_refusal_falls_back_to_template(settings) -> None:
    result = analyze_day(FakeAnthropic([refusal_response()]), settings, "emp-1", DAY,
                         make_day([shot(0, "coding")]))
    assert result.model == TEMPLATE_MODEL
    assert result.category_minutes == {"coding": 5}


def test_summary_input_contains_aggregates_only() -> None:
    day = make_day([shot(0, "coding")])
    shots = analyzed_screenshots(day)
    from app.day_analyzer import build_timeline

    text = summary_input(category_minutes(shots, 5), 5, build_timeline(shots), day.performance)
    assert '"categoryMinutes"' in text and '"09:00"' in text and "activeSeconds" in text
