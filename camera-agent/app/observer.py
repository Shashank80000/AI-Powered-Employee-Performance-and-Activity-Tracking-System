"""One webcam check: tracking active? -> capture -> label -> report. And the loop around it."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

import httpx

from app.camera import CameraError, Frame
from app.llm import ClaudeError
from app.schemas import CameraConsent, Observation
from app.server_client import ServerClient

log = logging.getLogger("camera-agent")

Outcome = Literal["recorded", "dry_run", "not_tracking", "camera_error", "label_error",
                  "rejected", "consent_withdrawn"]


class ConsentWithdrawn(RuntimeError):
    """Camera consent is off on the server (withdrawn from the website or another device)."""


@dataclass(frozen=True)
class CheckResult:
    outcome: Outcome
    observation: Observation | None = None


def effective_mode(wanted: str, consent: CameraConsent) -> str:
    """The stricter of the configured mode and what the person consented to."""
    if not consent.given:
        raise ConsentWithdrawn("Camera checks are not turned on. Run: python -m app.main consent")
    return "vision" if wanted == "vision" and consent.mode == "vision" else "local"


def check_once(
    server: ServerClient,
    capture: Callable[[], Frame],
    label: Callable[[Frame, datetime], Observation],
    dry_run: bool = False,
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
) -> CheckResult:
    """Run one check. The frame is dropped before this returns, whatever happens."""
    if server.tracking_state() != "active":
        return CheckResult("not_tracking")
    observed_at = now()
    try:
        frame = capture()
    except CameraError as exc:
        log.warning("Camera unavailable: %s", exc)
        return CheckResult("camera_error")
    try:
        observation = label(frame, observed_at)
    except (ClaudeError, httpx.HTTPError) as exc:
        log.warning("Could not label the frame: %s", type(exc).__name__)
        return CheckResult("label_error")
    finally:
        del frame  # bytes live only for the duration of this check

    if dry_run:
        return CheckResult("dry_run", observation)
    response = server.post_observation(observation)
    if response.status_code == 403:
        raise ConsentWithdrawn("Camera consent was withdrawn, so checks have stopped.")
    if response.status_code >= 400:
        # 409: tracking was paused in the meantime. Not an error worth retrying.
        log.info("Server did not store the observation (%s)", response.status_code)
        return CheckResult("rejected", observation)
    return CheckResult("recorded", observation)


def run_forever(
    server: ServerClient,
    capture: Callable[[], Frame],
    label: Callable[[Frame, datetime], Observation],
    interval_minutes: int,
    dry_run: bool = False,
    sleep: Callable[[float], None] = time.sleep,
    max_checks: int | None = None,
) -> int:
    """Check every ``interval_minutes`` until stopped. Returns the number of checks run."""
    checks = 0
    while max_checks is None or checks < max_checks:
        try:
            result = check_once(server, capture, label, dry_run)
        except httpx.HTTPError as exc:
            log.warning("Server unreachable (%s); will try again", type(exc).__name__)
        else:
            if result.observation is not None:
                log.info("%s: %s", result.outcome, result.observation.state)
            elif result.outcome == "not_tracking":
                log.info("Tracking is paused or stopped; no check taken")
        checks += 1
        if max_checks is None or checks < max_checks:
            sleep(interval_minutes * 60)
    return checks
