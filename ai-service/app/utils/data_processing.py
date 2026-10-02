"""Validation and cleaning helpers for aggregated daily metrics."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from app.schemas import DailyMetrics


@dataclass(frozen=True)
class MetricTotals:
    """Summed metrics over any number of days."""

    active_seconds: int = 0
    idle_seconds: int = 0
    productive_app_seconds: int = 0
    tasks_completed: int = 0
    tasks_assigned: int = 0
    on_time_tasks: int = 0


def safe_ratio(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Return numerator/denominator clamped to [0, 1]; `default` if denominator <= 0."""
    if denominator <= 0:
        return default
    return min(max(numerator / denominator, 0.0), 1.0)


def sort_by_date(days: Iterable[DailyMetrics]) -> list[DailyMetrics]:
    """Return the days in ascending date order."""
    return sorted(days, key=lambda day: day.date)


def clean_day(day: DailyMetrics) -> DailyMetrics:
    """Fix internally inconsistent values on a single day.

    - productive app time cannot exceed active time
    - on-time tasks cannot exceed completed tasks
    """
    return day.model_copy(
        update={
            "productive_app_seconds": min(day.productive_app_seconds, day.active_seconds),
            "on_time_tasks": min(day.on_time_tasks, day.tasks_completed),
        }
    )


def merge_days(first: DailyMetrics, second: DailyMetrics) -> DailyMetrics:
    """Combine two records for the same date by summing their metrics."""
    return DailyMetrics(
        date=first.date,
        active_seconds=first.active_seconds + second.active_seconds,
        idle_seconds=first.idle_seconds + second.idle_seconds,
        productive_app_seconds=first.productive_app_seconds + second.productive_app_seconds,
        tasks_completed=first.tasks_completed + second.tasks_completed,
        tasks_assigned=first.tasks_assigned + second.tasks_assigned,
        on_time_tasks=first.on_time_tasks + second.on_time_tasks,
    )


def prepare_days(days: Iterable[DailyMetrics]) -> list[DailyMetrics]:
    """Merge duplicate dates, clean each day and sort ascending by date."""
    by_date: dict[date, DailyMetrics] = {}
    for day in days:
        existing = by_date.get(day.date)
        by_date[day.date] = merge_days(existing, day) if existing else day
    return sort_by_date(clean_day(day) for day in by_date.values())


def totals(days: Iterable[DailyMetrics]) -> MetricTotals:
    """Sum every metric across the given days."""
    days = list(days)
    return MetricTotals(
        active_seconds=sum(d.active_seconds for d in days),
        idle_seconds=sum(d.idle_seconds for d in days),
        productive_app_seconds=sum(d.productive_app_seconds for d in days),
        tasks_completed=sum(d.tasks_completed for d in days),
        tasks_assigned=sum(d.tasks_assigned for d in days),
        on_time_tasks=sum(d.on_time_tasks for d in days),
    )


def day_totals(day: DailyMetrics) -> MetricTotals:
    """Convert a single day into MetricTotals."""
    return totals([day])
