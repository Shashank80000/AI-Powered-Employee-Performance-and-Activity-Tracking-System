"""Camera-agent labels in the whole-day analysis."""

from __future__ import annotations

import json
from datetime import date

from app.day_analyzer import TEMPLATE_MODEL, analyze_day, camera_summary
from app.main import run_for_date
from app.schemas import DayData
from tests.conftest import FakeAnthropic, FakeServer, text_response

DAY = date(2026, 9, 30)


def observation(hour: int, minute: int, state: str) -> dict:
    return {"observedAt": f"2026-09-30T{hour:02d}:{minute:02d}:00Z", "state": state,
            "activity": "generic label"}


def make_day(observations: list[dict], screenshots: list[dict] | None = None) -> DayData:
    return DayData.model_validate({
        "employee": {"id": "emp-1", "name": "Asha Rao"}, "intervalMinutes": 5,
        "performance": None, "screenshots": screenshots or [],
        "cameraIntervalMinutes": 10, "cameraObservations": observations,
    })


OBSERVATIONS = [observation(9, 0, "working_at_computer"), observation(9, 10, "working_at_computer"),
                observation(9, 20, "on_a_call"), observation(9, 30, "away_from_desk"),
                observation(9, 40, "camera_blocked")]


def test_camera_summary_math() -> None:
    summary = camera_summary(make_day(OBSERVATIONS))
    assert summary is not None
    assert summary.observation_count == 5
    assert summary.state_minutes == {"away_from_desk": 10, "camera_blocked": 10,
                                     "on_a_call": 10, "working_at_computer": 20}
    assert summary.at_desk_minutes == 30  # blocked counts as unknown, not at the desk
    assert summary.away_minutes == 10


def test_no_camera_data_means_no_camera_section() -> None:
    assert camera_summary(make_day([])) is None
    fake = FakeAnthropic([])
    analysis = analyze_day(fake, _settings(), "emp-1", DAY, make_day([]))
    assert analysis.camera is None and fake.calls == []


def test_camera_only_day_gets_a_claude_summary_with_state_changes() -> None:
    fake = FakeAnthropic([text_response({"summary": "Good focus block in the morning.",
                                         "highlights": [], "suggestions": []})])
    analysis = analyze_day(fake, _settings(), "emp-1", DAY, make_day(OBSERVATIONS),
                           sleep=lambda _: None)
    assert analysis.camera is not None and analysis.camera.at_desk_minutes == 30
    sent = fake.calls[0]["messages"][0]["content"]
    payload = json.loads(sent.split("\n", 1)[1])
    # Repeated states collapse into one change; no names reach Claude.
    assert [c["state"] for c in payload["camera"]["stateChanges"]] == [
        "working_at_computer", "on_a_call", "away_from_desk", "camera_blocked"]
    assert "Asha" not in sent and "generic label" not in sent
    body = analysis.model_dump(by_alias=True, mode="json")
    assert body["camera"]["atDeskMinutes"] == 30


def test_template_mentions_camera_when_claude_fails() -> None:
    fake = FakeAnthropic([text_response("not json")] * 3)
    analysis = analyze_day(fake, _settings(), "emp-1", DAY, make_day(OBSERVATIONS),
                           sleep=lambda _: None)
    assert analysis.model == TEMPLATE_MODEL
    assert "0.5 h at the desk" in analysis.summary


def test_pipeline_analyzes_employees_with_only_camera_data(settings) -> None:
    day = make_day(OBSERVATIONS).model_dump(by_alias=True, mode="json")
    server = FakeServer(pending=[], days={"emp-cam": day}, camera_employees=["emp-cam"])
    fake = FakeAnthropic([text_response({"summary": "Steady.", "highlights": [], "suggestions": []})])
    with server.client() as client:
        report = run_for_date(settings, client, fake, DAY, sleep=lambda _: None)
    assert report.employees == ["emp-cam"] and report.analyses_saved == 1
    assert server.puts[0]["camera"]["observationCount"] == 5


def _settings():
    from app.config import Settings
    return Settings(server_url="http://server.test", service_api_key="k", max_concurrency=1)
