"""The check cycle, consent rules and the CLI parser against a mocked server."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from app.camera import CameraError
from app.config import ConfigError, Settings
from app.main import build_parser, consent_text
from app.observer import ConsentWithdrawn, check_once, effective_mode, run_forever
from app.schemas import CameraConsent, Observation
from app.server_client import SignedOut
from tests.conftest import FakeServer, frame

AT = datetime(2026, 9, 30, 9, 0, tzinfo=timezone.utc)


def label(_frame, at) -> Observation:
    return Observation(observed_at=at, state="working_at_computer", activity="typing",
                       confidence=0.8, source="vision")


def test_records_label_and_never_sends_image_bytes() -> None:
    server = FakeServer()
    with server.client() as client:
        result = check_once(client, frame, label, now=lambda: AT)
    assert result.outcome == "recorded"
    assert server.observations == [{"observedAt": "2026-09-30T09:00:00Z",
                                    "state": "working_at_computer", "activity": "typing",
                                    "confidence": 0.8, "source": "vision"}]
    for request in server.requests:
        assert b"fake-webcam" not in request.content


def test_no_capture_while_tracking_is_paused() -> None:
    captured = []
    server = FakeServer(tracking="paused")
    with server.client() as client:
        result = check_once(client, lambda: captured.append(1) or frame(), label)
    assert result.outcome == "not_tracking" and captured == [] and server.observations == []


def test_camera_error_is_reported_not_raised() -> None:
    def broken():
        raise CameraError("busy")

    with FakeServer().client() as client:
        assert check_once(client, broken, label).outcome == "camera_error"


def test_dry_run_posts_nothing() -> None:
    server = FakeServer()
    with server.client() as client:
        result = check_once(client, frame, label, dry_run=True)
    assert result.outcome == "dry_run" and server.observations == []


def test_withdrawn_consent_stops_the_agent() -> None:
    with FakeServer(observation_status=403).client() as client, pytest.raises(ConsentWithdrawn):
        check_once(client, frame, label)


def test_paused_meanwhile_is_rejected_quietly() -> None:
    with FakeServer(observation_status=409).client() as client:
        assert check_once(client, frame, label).outcome == "rejected"


def test_run_forever_sleeps_one_interval_between_checks() -> None:
    sleeps: list[float] = []
    server = FakeServer()
    with server.client() as client:
        assert run_forever(client, frame, label, 5, sleep=sleeps.append, max_checks=3) == 3
    assert sleeps == [300, 300] and len(server.observations) == 3


def test_effective_mode_uses_the_stricter_choice() -> None:
    vision = CameraConsent(given=True, mode="vision")
    local = CameraConsent(given=True, mode="local")
    assert effective_mode("vision", vision) == "vision"
    assert effective_mode("vision", local) == "local"
    assert effective_mode("local", vision) == "local"
    with pytest.raises(ConsentWithdrawn):
        effective_mode("local", CameraConsent(given=False))


def test_consent_and_withdraw_round_trip() -> None:
    server = FakeServer(consent_mode=None)
    with server.client() as client:
        assert client.give_consent("local").mode == "local"
        put = next(r for r in server.requests if r.method == "PUT")
        assert json.loads(put.content) == {"agreed": True, "mode": "local"}
        client.withdraw_consent()
        assert client.get_consent().given is False


def test_sign_in_rules() -> None:
    server = FakeServer()
    with server.client(signed_in=False) as client:
        with pytest.raises(SignedOut):
            client.login("akash@workplus.dev", "wrong")
        with pytest.raises(SignedOut, match="employee accounts only"):
            client.login("manager@workplus.dev", "secret")
    with server.client(signed_in=False) as client, pytest.raises(SignedOut):
        client.tracking_state()


def test_consent_text_explains_each_mode() -> None:
    assert "never leaves this computer" in consent_text("local", 5, 30)
    vision = consent_text("vision", 10, 7)
    assert "Claude API" in vision and "10 minutes" in vision and "7 days" in vision


def test_config_and_parser() -> None:
    assert Settings.from_env({}).mode == "local"
    assert Settings.from_env({"CAMERA_MODE": "vision", "CAMERA_INDEX": "1"}).camera_index == 1
    with pytest.raises(ConfigError):
        Settings.from_env({"CAMERA_MODE": "spy"})
    assert build_parser().parse_args(["consent", "--mode", "vision"]).mode == "vision"
