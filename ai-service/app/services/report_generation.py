"""Deterministic, template-based performance report generation.

Everything here is rule-based so the same input always yields the same
report, and every sentence can be traced back to a metric. No external
LLM is called.
"""

from __future__ import annotations

from app.models.productivity_model import ProductivityModel
from app.schemas import (
    AnalysisRequest,
    Anomaly,
    Breakdown,
    DailyScore,
    ReportResponse,
    TrendDirection,
)
from app.services.anomaly_detection import find_anomalies
from app.services.productivity_analysis import analyze_productivity
from app.services.trend_analysis import direction, score_slope
from app.utils.data_processing import prepare_days, totals

DISCLAIMER = "AI-generated from aggregated activity metrics. Review before acting on it."

STRONG_FACTOR = 0.75
WEAK_FACTOR = 0.60

FACTOR_LABELS: dict[str, str] = {
    "active_ratio": "active time share",
    "productive_ratio": "time in productive apps",
    "completion_rate": "task completion rate",
    "on_time_rate": "on-time delivery rate",
}

FACTOR_ADVICE: dict[str, str] = {
    "active_ratio": "Idle time is high relative to active time; check whether workload, "
    "blockers or meeting load explain it before drawing conclusions.",
    "productive_ratio": "A modest share of active time is spent in productive apps; consider "
    "agreeing focus blocks or revisiting which tools are classified as productive.",
    "completion_rate": "Several assigned tasks remain open; review task scope and priorities "
    "together in the next one-to-one.",
    "on_time_rate": "Some tasks were completed late; discuss estimates and deadlines to see "
    "whether they are realistic.",
}

TREND_WORDS: dict[TrendDirection, str] = {
    "up": "improving",
    "down": "declining",
    "flat": "stable",
}


def score_band(score: float) -> str:
    """Describe a 0-100 score in words."""
    if score >= 80:
        return "strong"
    if score >= 60:
        return "solid"
    if score >= 40:
        return "moderate"
    return "low"


def build_summary(
    name: str,
    score: float,
    trend: TrendDirection,
    slope: float,
    day_count: int,
    period: str,
    anomaly_count: int,
) -> str:
    """Compose the one-paragraph natural-language summary."""
    parts = [
        f"{name} achieved a {score_band(score)} productivity score of {score:.1f}/100 "
        f"across {day_count} tracked day{'s' if day_count != 1 else ''}{period}.",
        f"Performance is {TREND_WORDS[trend]} ({slope:+.1f} points per day).",
    ]
    if anomaly_count:
        parts.append(
            f"{anomaly_count} unusual data point{'s were' if anomaly_count != 1 else ' was'} "
            "detected and should be reviewed in context."
        )
    else:
        parts.append("No unusual days were detected.")
    return " ".join(parts)


def build_highlights(
    breakdown: Breakdown, scores: list[DailyScore], completed: int, assigned: int
) -> list[str]:
    """List positive, factual observations."""
    highlights = [
        f"Strong {FACTOR_LABELS[name]} at {value:.0%}."
        for name, value in breakdown.model_dump().items()
        if value >= STRONG_FACTOR
    ]
    if assigned:
        highlights.append(f"Completed {completed} of {assigned} assigned tasks.")
    if len(scores) > 1:
        best = max(scores, key=lambda s: s.score)
        highlights.append(f"Best day was {best.date.isoformat()} with a score of {best.score:.1f}.")
    return highlights or ["Not enough activity yet to highlight specific strengths."]


def build_recommendations(
    breakdown: Breakdown, used_factors: list[str], trend: TrendDirection, anomalies: list[Anomaly]
) -> list[str]:
    """Suggest supportive next steps based on weak factors, trend and anomalies."""
    values = breakdown.model_dump()
    recommendations = [
        FACTOR_ADVICE[name] for name in used_factors if values[name] < WEAK_FACTOR
    ]
    if trend == "down":
        recommendations.append(
            "Scores are trending down; schedule a supportive check-in to understand any blockers."
        )
    if anomalies:
        dates = sorted({a.date.isoformat() for a in anomalies})
        recommendations.append(
            f"Review the unusual day(s) ({', '.join(dates)}) with the employee before acting."
        )
    return recommendations or ["Keep current working patterns; no specific action is needed."]


def period_label(request: AnalysisRequest) -> str:
    """Render ' (start to end)' from the request or the data's own dates."""
    days = sorted(d.date for d in request.days)
    start = request.period_start or days[0]
    end = request.period_end or days[-1]
    return f" ({start.isoformat()} to {end.isoformat()})"


def generate_report(request: AnalysisRequest) -> ReportResponse:
    """Build the complete report for one employee."""
    days = prepare_days(request.days)
    productivity = analyze_productivity(request)
    slope = score_slope(productivity.daily_scores)
    trend = direction(slope)
    anomalies = find_anomalies(days)
    sums = totals(days)
    used_factors = ProductivityModel().score(sums).used_factors

    summary = build_summary(
        name=request.employee_name or f"Employee {request.employee_id}",
        score=productivity.score,
        trend=trend,
        slope=slope,
        day_count=len(days),
        period=period_label(request),
        anomaly_count=len(anomalies),
    )
    # LLM HOOK: to add an LLM later, pass ONLY the aggregated values computed
    # above (score, breakdown, trend, slope, anomalies) - never raw activity -
    # to a provider here and use its text in place of `summary`, falling back
    # to this template output if the call fails. Keep the disclaimer.

    return ReportResponse(
        employee_id=request.employee_id,
        score=productivity.score,
        trend=trend,
        summary=summary,
        highlights=build_highlights(
            productivity.breakdown,
            productivity.daily_scores,
            sums.tasks_completed,
            sums.tasks_assigned,
        ),
        recommendations=build_recommendations(
            productivity.breakdown, used_factors, trend, anomalies
        ),
        anomalies=anomalies,
        disclaimer=DISCLAIMER,
    )
