"""Local and vision labelling, refusals and the privacy sanitizer."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.labeller import label_local, label_vision, sanitize_activity
from app.llm import ClaudeError
from app.prompts import OBSERVATION_SCHEMA
from tests.conftest import FakeAnthropic, frame, refusal_response, text_response

AT = datetime(2026, 9, 30, 9, 0, tzinfo=timezone.utc)


class Faces:
    def __init__(self, count: int) -> None:
        self.count, self.calls = count, 0

    def face_count(self, gray) -> int:
        self.calls += 1
        return self.count


def test_local_face_means_present() -> None:
    obs = label_local(frame(), Faces(1), AT)
    assert (obs.state, obs.source) == ("present_at_desk", "local")


def test_local_no_face_means_away() -> None:
    assert label_local(frame(), Faces(0), AT).state == "away_from_desk"


def test_local_dark_frame_is_blocked_without_running_detection() -> None:
    faces = Faces(1)
    assert label_local(frame(mean=5), faces, AT).state == "camera_blocked"
    assert label_local(frame(std=1), faces, AT).state == "camera_blocked"
    assert faces.calls == 0


def test_vision_labels_frame(settings) -> None:
    fake = FakeAnthropic([text_response({"state": "on_a_call", "activity": "on a video call",
                                         "confidence": 1.4})])
    obs = label_vision(fake, settings, frame(), AT)
    assert (obs.state, obs.activity, obs.confidence, obs.source) == (
        "on_a_call", "on a video call", 1.0, "vision")
    call = fake.calls[0]
    assert call["messages"][0]["content"][0]["type"] == "image"
    assert call["output_config"]["format"]["schema"] == OBSERVATION_SCHEMA


def test_vision_never_sends_a_blocked_frame(settings) -> None:
    fake = FakeAnthropic([])
    assert label_vision(fake, settings, frame(mean=2), AT).state == "camera_blocked"
    assert fake.calls == []


def test_vision_refusal_is_unclassified(settings) -> None:
    obs = label_vision(FakeAnthropic([refusal_response()]), settings, frame(), AT)
    assert (obs.state, obs.confidence) == ("unclassified", 0.0)


def test_vision_rejects_unknown_state(settings) -> None:
    fake = FakeAnthropic([text_response({"state": "sleeping", "activity": "x", "confidence": 1})])
    with pytest.raises(ClaudeError):
        label_vision(fake, settings, frame(), AT)


def test_sanitizer_strips_scene_text() -> None:
    assert sanitize_activity('reading report.pdf from john@x.com at 10:30 on www.site') == (
        "reading from at on")
    assert sanitize_activity("one two three four five six seven eight nine") == (
        "one two three four five six seven eight")
    assert sanitize_activity("12345") == "unspecified activity"
