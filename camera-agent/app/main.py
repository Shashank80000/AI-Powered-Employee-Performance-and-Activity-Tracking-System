"""CLI for the camera agent, run by the employee on their own computer.

    python -m app.main consent [--mode local|vision]   # read what it does, then agree
    python -m app.main status
    python -m app.main once                             # one check, prints the label
    python -m app.main run                              # check every few minutes
    python -m app.main withdraw                         # stop, and delete all observations
"""

from __future__ import annotations

import argparse
import getpass
import logging
import sys
from collections.abc import Callable
from datetime import datetime

import httpx

from app.camera import CameraError, Frame, LocalDetector, capture_frame
from app.config import ConfigError, Settings
from app.labeller import label_local, label_vision
from app.llm import make_client
from app.observer import ConsentWithdrawn, check_once, effective_mode, run_forever
from app.schemas import Observation
from app.server_client import ServerClient, SignedOut

log = logging.getLogger("camera-agent")

AGREEMENT = "I AGREE"


def consent_text(mode: str, interval: int, retention: int) -> str:
    where = (
        "Each frame is checked ON THIS COMPUTER for whether someone is at the desk. The frame "
        "never leaves this computer."
        if mode == "local" else
        "Each frame is sent to Anthropic's Claude API, which returns a generic label such as "
        "\"on a call\" or \"away from desk\". Anthropic processes the frame to produce the label; "
        "WorkPlus never receives or stores it."
    )
    return f"""
Camera checks ({mode} mode)

While tracking is active, this agent turns on your webcam about every {interval} minutes,
takes one frame, and turns the camera off again. {where}

What is stored: only the time and a generic label (for example "working at computer").
No image, face or recording is ever saved, on this computer or on the server.
Who can see it: you, your manager and administrators. It feeds your daily analysis.
How long: labels are deleted after {retention} days.
Pausing tracking on the website or in the desktop agent also pauses camera checks.
You can turn this off at any time with: python -m app.main withdraw
(which also deletes every camera label recorded so far).
"""


def _sign_in(server: ServerClient, settings: Settings, email: str | None) -> None:
    address = email or settings.email or input("WorkPlus email: ").strip()
    name = server.login(address, getpass.getpass("Password: "))
    log.info("Signed in as %s", name or address)


def _labeller(settings: Settings, mode: str) -> Callable[[Frame, datetime], Observation]:
    if mode == "vision":
        client = make_client()
        return lambda frame, at: label_vision(client, settings, frame, at)
    detector = LocalDetector()
    return lambda frame, at: label_local(frame, detector, at)


def cmd_consent(server: ServerClient, settings: Settings, mode: str) -> int:
    current = server.get_consent()
    print(consent_text(mode, current.interval_minutes, current.retention_days))
    if input(f'Type "{AGREEMENT}" to turn camera checks on: ').strip().upper() != AGREEMENT:
        print("Not turned on. Nothing was changed.")
        return 1
    saved = server.give_consent(mode)  # type: ignore[arg-type]
    print(f"Camera checks are on ({saved.mode} mode). Start them with: python -m app.main run")
    return 0


def cmd_status(server: ServerClient) -> int:
    consent = server.get_consent()
    if consent.given:
        print(f"Camera checks: on ({consent.mode} mode), every {consent.interval_minutes} min. "
              f"Tracking: {server.tracking_state()}.")
    else:
        print("Camera checks: off.")
    return 0


def cmd_withdraw(server: ServerClient) -> int:
    server.withdraw_consent()
    print("Camera checks are off and every camera label recorded so far has been deleted.")
    return 0


def cmd_check(server: ServerClient, settings: Settings, loop: bool) -> int:
    consent = server.get_consent()
    mode = effective_mode(settings.mode, consent)
    if settings.mode == "vision" and mode == "local":
        log.warning("Your consent covers on-device checks only, so local mode is used")
    label = _labeller(settings, mode)

    def capture() -> Frame:
        return capture_frame(settings.camera_index)

    if loop:
        log.info("Checking every %d min in %s mode. Press Ctrl+C to stop.",
                 consent.interval_minutes, mode)
        run_forever(server, capture, label, consent.interval_minutes, settings.dry_run)
        return 0
    result = check_once(server, capture, label, settings.dry_run)
    shown = f" -> {result.observation.state} ({result.observation.activity})" if result.observation else ""
    print(f"{result.outcome}{shown}")
    return 0 if result.outcome in ("recorded", "dry_run", "not_tracking") else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.main",
        description="WorkPlus camera agent: consented webcam checks reported as generic labels.",
    )
    parser.add_argument("--email", help="WorkPlus email (default: WORKPLUS_EMAIL or a prompt)")
    sub = parser.add_subparsers(dest="command", required=True)
    consent = sub.add_parser("consent", help="read what camera checks do and turn them on")
    consent.add_argument("--mode", choices=["local", "vision"], default=None,
                         help="default: CAMERA_MODE, or local")
    sub.add_parser("status", help="show whether camera checks are on")
    sub.add_parser("once", help="run one check now and print the label")
    sub.add_parser("run", help="run checks every few minutes until stopped")
    sub.add_parser("withdraw", help="turn camera checks off and delete all camera labels")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    try:
        settings = Settings.from_env()
    except ConfigError as exc:
        log.error("%s", exc)
        return 2

    try:
        with ServerClient(settings.server_url) as server:
            _sign_in(server, settings, args.email)
            if args.command == "consent":
                return cmd_consent(server, settings, args.mode or settings.mode)
            if args.command == "status":
                return cmd_status(server)
            if args.command == "withdraw":
                return cmd_withdraw(server)
            return cmd_check(server, settings, loop=args.command == "run")
    except (SignedOut, ConsentWithdrawn, CameraError) as exc:
        log.error("%s", exc)
        return 1
    except httpx.HTTPError as exc:
        log.error("Could not reach the server at %s (%s)", settings.server_url, type(exc).__name__)
        return 1
    except KeyboardInterrupt:
        log.info("Stopped")
        return 0


if __name__ == "__main__":
    sys.exit(main())
