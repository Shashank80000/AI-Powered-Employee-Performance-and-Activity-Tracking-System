"""Whole-day analysis per employee: category minutes, camera totals, timeline and a summary.

Only aggregated text is sent to Claude for the summary - never images or names.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from collections.abc import Callable
from datetime import date, datetime, timezone
from typing import Any

from pydantic import ValidationError

from app.config import Settings
from app.llm import ClaudeError, create_structured
from app.prompts import DAY_SUMMARY_PROMPT, DAY_SUMMARY_SCHEMA
from app.schemas import (
    CameraObservation,
    CameraSummary,
    DailyAnalysis,
    DayData,
    DayScreenshot,
    DaySummaryOutput,
    Performance,
    TimelineEntry,
)

log = logging.getLogger(__name__)

AI_LABEL = "AI-generated summary: "
TEMPLATE_LABEL = "Automatic summary: "
TEMPLATE_MODEL = "rule-based-template"
SUMMARY_MAX_TOKENS = 4096

# Camera states that mean the person is at the desk (mirrors server/src/utils/cameraStates.js).
NOT_AT_DESK = {"away_from_desk", "camera_blocked", "unclassified"}


def analyzed_screenshots(day: DayData) -> list[DayScreenshot]:
    """Analyzed screenshots in capture order."""
    shots = [s for s in day.screenshots if s.status == "analyzed" and s.analysis is not None]
    return sorted(shots, key=lambda s: s.captured_at)


def category_minutes(shots: list[DayScreenshot], interval_minutes: int) -> dict[str, int]:
    """Analyzed screenshots per category x capture interval."""
    counts = Counter(s.analysis.category for s in shots if s.analysis)
    return {cat: n * interval_minutes for cat, n in sorted(counts.items())}


def productive_minutes(shots: list[DayScreenshot], interval_minutes: int) -> int:
    return sum(interval_minutes for s in shots if s.analysis and s.analysis.productive)


def build_timeline(shots: list[DayScreenshot]) -> list[TimelineEntry]:
    return [
        TimelineEntry(captured_at=s.captured_at, category=s.analysis.category,
                      activity=s.analysis.activity)
        for s in shots
        if s.analysis
    ]


def camera_summary(day: DayData) -> CameraSummary | None:
    """Minutes per camera state plus at-desk / away totals; None without observations."""
    observations = day.camera_observations
    if not observations:
        return None
    interval = day.camera_interval_minutes
    counts = Counter(o.state for o in observations)
    return CameraSummary(
        observation_count=len(observations),
        state_minutes={state: n * interval for state, n in sorted(counts.items())},
        at_desk_minutes=sum(n for state, n in counts.items() if state not in NOT_AT_DESK) * interval,
        away_minutes=counts.get("away_from_desk", 0) * interval,
    )


def _camera_timeline(observations: list[CameraObservation]) -> list[dict[str, str]]:
    """State changes only, so long unchanged stretches don't bloat the prompt."""
    entries: list[dict[str, str]] = []
    for o in sorted(observations, key=lambda o: o.observed_at):
        if not entries or entries[-1]["state"] != o.state:
            entries.append({"time": o.observed_at.strftime("%H:%M"), "state": o.state})
    return entries


def _hours(seconds: int) -> str:
    return f"{seconds / 3600:.1f} h"


def _camera_sentence(camera: CameraSummary | None) -> str:
    if camera is None:
        return ""
    return (f" Camera checks recorded about {camera.at_desk_minutes / 60:.1f} h at the desk and "
            f"{camera.away_minutes / 60:.1f} h away.")


def template_summary(
    performance: Performance | None, camera: CameraSummary | None = None
) -> DaySummaryOutput:
    """Deterministic summary from activity metrics alone (no Claude call)."""
    if performance is None and camera is not None:
        return DaySummaryOutput(
            summary=TEMPLATE_LABEL + "No screenshots were analyzed and no activity metrics were "
            "recorded for this day." + _camera_sentence(camera),
            highlights=[],
            suggestions=["Check that the desktop agent is running and signed in."],
        )
    if performance is None:
        return DaySummaryOutput(
            summary=TEMPLATE_LABEL + "No screenshots were analyzed and no activity metrics "
            "were recorded for this day.",
            highlights=[],
            suggestions=["Check that the desktop agent is running and signed in."],
        )
    p = performance
    tracked = p.active_seconds + p.idle_seconds
    sentences = [f"{_hours(p.active_seconds)} active and {_hours(p.idle_seconds)} idle time "
                 "were recorded; no screenshots were analyzed."]
    if p.tasks_assigned:
        sentences.append(f"{p.tasks_completed} of {p.tasks_assigned} assigned tasks were completed.")
    if p.productivity_score is not None:
        sentences.append(f"The productivity score for the day was {p.productivity_score:.0f}.")
    highlights: list[str] = []
    if p.tasks_completed:
        highlights.append(f"Completed {p.tasks_completed} task(s).")
    if p.on_time_tasks:
        highlights.append(f"{p.on_time_tasks} task(s) delivered on time.")
    if p.active_seconds and p.productive_app_seconds >= p.active_seconds / 2:
        highlights.append("Most active time was spent in productive apps.")
    suggestions: list[str] = []
    if tracked and p.idle_seconds / tracked > 0.4:
        suggestions.append("Idle time was high; short planned breaks can help keep focus.")
    if p.tasks_assigned > p.tasks_completed:
        suggestions.append("Consider prioritising the remaining open tasks tomorrow.")
    return DaySummaryOutput(
        summary=TEMPLATE_LABEL + " ".join(sentences) + _camera_sentence(camera),
        highlights=highlights,
        suggestions=suggestions,
    )


def summary_input(
    minutes: dict[str, int], productive: int, timeline: list[TimelineEntry],
    performance: Performance | None,
    camera: CameraSummary | None = None,
    camera_observations: list[CameraObservation] | None = None,
) -> str:
    """Aggregated, name-free text sent to Claude for the day summary."""
    payload = {
        "categoryMinutes": minutes,
        "productiveMinutes": productive,
        "timeline": [
            {"time": t.captured_at.strftime("%H:%M"), "category": t.category, "activity": t.activity}
            for t in timeline
        ],
        "performance": performance.model_dump(by_alias=True) if performance else None,
        "camera": None if camera is None else {
            "stateMinutes": camera.state_minutes,
            "atDeskMinutes": camera.at_desk_minutes,
            "awayMinutes": camera.away_minutes,
            "stateChanges": _camera_timeline(camera_observations or []),
        },
    }
    return "Day data:\n" + json.dumps(payload, indent=1, sort_keys=True)


def _label(summary: str) -> str:
    text = summary.strip()
    return text if text.lower().startswith("ai-generated") else AI_LABEL + text


def claude_summary(
    client: Any, settings: Settings, text: str, sleep: Callable[[float], None] | None = None
) -> DaySummaryOutput | None:
    """Ask Claude for the summary; None on refusal or failure (caller falls back)."""
    extra = {"sleep": sleep} if sleep else {}
    try:
        result = create_structured(
            client, settings, system=DAY_SUMMARY_PROMPT, content=text,
            schema=DAY_SUMMARY_SCHEMA, effort="medium", max_tokens=SUMMARY_MAX_TOKENS, **extra,
        )
        if result.refused or result.data is None:
            return None
        output = DaySummaryOutput.model_validate(result.data)
    except (ClaudeError, ValidationError) as exc:
        log.warning("Day summary failed (%s); using template", type(exc).__name__)
        return None
    return output.model_copy(update={"summary": _label(output.summary)})


def analyze_day(
    client: Any,
    settings: Settings,
    employee_id: str,
    day_date: date,
    day: DayData,
    now: datetime | None = None,
    sleep: Callable[[float], None] | None = None,
) -> DailyAnalysis:
    """Build the DailyAnalysis document for one employee and date."""
    shots = analyzed_screenshots(day)
    minutes = category_minutes(shots, day.interval_minutes)
    productive = productive_minutes(shots, day.interval_minutes)
    timeline = build_timeline(shots)
    camera = camera_summary(day)

    output: DaySummaryOutput | None = None
    model = TEMPLATE_MODEL
    if shots or camera:
        text = summary_input(minutes, productive, timeline, day.performance, camera,
                             day.camera_observations)
        output = claude_summary(client, settings, text, sleep)
        if output is not None:
            model = settings.model
    if output is None:
        output = template_summary(day.performance, camera)

    return DailyAnalysis(
        employee_id=employee_id,
        date=day_date,
        screenshot_count=len(day.screenshots),
        analyzed_count=len(shots),
        category_minutes=minutes,
        productive_minutes=productive,
        timeline=timeline,
        camera=camera,
        summary=output.summary,
        highlights=output.highlights,
        suggestions=output.suggestions,
        model=model,
        generated_at=now or datetime.now(timezone.utc),
    )
