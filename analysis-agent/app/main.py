"""CLI and daily pipeline: classify pending screenshots, then analyze each employee's day
(screenshot categories, camera-agent labels and activity metrics).

    python -m app.main run [--date YYYY-MM-DD] [--employee ID ...]
    python -m app.main schedule --at 23:30
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from app.classifier import classify_image
from app.config import ConfigError, Settings
from app.day_analyzer import analyze_day
from app.llm import ClaudeError, make_client
from app.schemas import DayData, ScreenshotAnalysis, ScreenshotRef
from app.server_client import ServerClient

log = logging.getLogger("analysis-agent")


@dataclass
class RunReport:
    """Counts only - no image data or on-screen content."""

    date: date
    screenshots: int = 0
    analyzed: int = 0
    failed: int = 0
    analyses_saved: int = 0
    analyses_failed: int = 0
    employees: list[str] = field(default_factory=list)


def _classify_one(
    ref: ScreenshotRef, server: ServerClient, claude: Any, settings: Settings,
    sleep: Callable[[float], None] | None,
) -> ScreenshotAnalysis | None:
    """Fetch, classify and report one screenshot. Returns None when it failed."""
    try:
        image = server.fetch_image(ref.id)
        analysis = classify_image(claude, settings, image, sleep)
        del image  # bytes live only for the duration of this call
    except (ClaudeError, httpx.HTTPError) as exc:
        log.warning("Screenshot %s failed: %s", ref.id, type(exc).__name__)
        if not settings.dry_run:
            try:
                server.report_failure(ref.id)
            except httpx.HTTPError:
                log.error("Could not mark screenshot %s as failed", ref.id)
        return None
    if not settings.dry_run:
        try:
            server.report_analysis(ref.id, analysis)
        except httpx.HTTPError as exc:
            log.error("Could not report screenshot %s: %s", ref.id, type(exc).__name__)
            return None
    return analysis


def _overlay(day: DayData, results: dict[str, ScreenshotAnalysis]) -> DayData:
    """Apply this run's results to the day data (needed in DRY_RUN, harmless otherwise)."""
    shots = [
        s.model_copy(update={"status": "analyzed", "analysis": results[s.id]})
        if s.id in results else s
        for s in day.screenshots
    ]
    return day.model_copy(update={"screenshots": shots})


def run_for_date(
    settings: Settings,
    server: ServerClient,
    claude: Any,
    day_date: date,
    extra_employees: list[str] | None = None,
    sleep: Callable[[float], None] | None = None,
) -> RunReport:
    """Run the full pipeline for one date."""
    report = RunReport(date=day_date)
    pending = server.list_pending(day_date)
    report.screenshots = len(pending)
    log.info("%s: %d pending screenshot(s)", day_date, len(pending))

    results: dict[str, ScreenshotAnalysis] = {}
    with ThreadPoolExecutor(max_workers=settings.max_concurrency) as pool:
        outcomes = pool.map(
            lambda ref: (ref.id, _classify_one(ref, server, claude, settings, sleep)), pending
        )
        for shot_id, analysis in outcomes:
            if analysis is None:
                report.failed += 1
            else:
                results[shot_id] = analysis
                report.analyzed += 1

    camera_employees = server.list_camera_employees(day_date)
    employees = sorted(
        {ref.employee_id for ref in pending} | set(camera_employees) | set(extra_employees or [])
    )
    report.employees = employees

    def analyze(employee_id: str) -> bool:
        try:
            day = _overlay(server.get_day(employee_id, day_date), results)
            analysis = analyze_day(claude, settings, employee_id, day_date, day, sleep=sleep)
            if settings.dry_run:
                log.info("DRY_RUN: would save analysis for %s (%d analyzed)",
                         employee_id, analysis.analyzed_count)
            else:
                server.put_daily_analysis(analysis)
            return True
        except httpx.HTTPError as exc:
            log.error("Day analysis for %s failed: %s", employee_id, type(exc).__name__)
            return False

    with ThreadPoolExecutor(max_workers=settings.max_concurrency) as pool:
        for ok in pool.map(analyze, employees):
            if ok:
                report.analyses_saved += 1
            else:
                report.analyses_failed += 1

    log.info("%s done: %d analyzed, %d failed, %d day analyses saved, %d failed", day_date,
             report.analyzed, report.failed, report.analyses_saved, report.analyses_failed)
    return report


def next_run_at(now: datetime, at: str) -> datetime:
    """Next local datetime matching HH:MM strictly after ``now``."""
    hour, minute = (int(part) for part in at.split(":"))
    candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    return candidate if candidate > now else candidate + timedelta(days=1)


def _parse_time(value: str) -> str:
    try:
        datetime.strptime(value, "%H:%M")
    except ValueError as exc:
        raise argparse.ArgumentTypeError("expected HH:MM (24h)") from exc
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.main",
        description="Daily analysis agent: classifies consented screenshots with Claude and "
        "stores per-employee day analyses on the server.",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="analyze one date now")
    run.add_argument("--date", type=date.fromisoformat, default=None,
                     help="YYYY-MM-DD (default: today, local time)")
    run.add_argument("--employee", action="append", default=[],
                     help="also analyze this employee id (repeatable)")
    schedule = sub.add_parser("schedule", help="run every day at a local time, forever")
    schedule.add_argument("--at", type=_parse_time, default="23:30",
                          help="local time HH:MM (default 23:30)")
    return parser


def _run_once(settings: Settings, day_date: date, employees: list[str]) -> RunReport:
    with ServerClient(settings.server_url, settings.service_api_key) as server:
        return run_for_date(settings, server, make_client(), day_date, employees)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    try:
        settings = Settings.from_env()
    except ConfigError as exc:
        log.error("%s", exc)
        return 2

    if args.command == "run":
        report = _run_once(settings, args.date or date.today(), args.employee)
        return 0 if report.failed == 0 and report.analyses_failed == 0 else 1

    while True:
        target = next_run_at(datetime.now(), args.at)
        log.info("Next run at %s", target.isoformat(timespec="minutes"))
        while (remaining := (target - datetime.now()).total_seconds()) > 0:
            time.sleep(min(remaining, 60))
        try:
            _run_once(settings, target.date(), [])
        except Exception:  # keep the scheduler alive; details exclude any image data
            log.exception("Scheduled run failed")


if __name__ == "__main__":
    sys.exit(main())
