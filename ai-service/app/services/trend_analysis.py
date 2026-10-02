"""Trend analysis over daily productivity scores."""

from __future__ import annotations

import statistics
from datetime import date

from app.schemas import (
    AnalysisRequest,
    DailyScore,
    MovingAveragePoint,
    TrendDirection,
    TrendResponse,
)
from app.services.productivity_analysis import daily_scores
from app.utils.data_processing import prepare_days

FLAT_THRESHOLD = 0.5  # score points per day below which a trend counts as flat
MOVING_AVERAGE_WINDOW = 3


def least_squares_slope(points: list[tuple[float, float]]) -> float:
    """Least-squares slope of (x, y) points; 0.0 if fewer than 2 distinct x values."""
    if len({x for x, _ in points}) < 2:
        return 0.0
    xs, ys = zip(*points)
    return statistics.linear_regression(xs, ys).slope


def score_slope(scores: list[DailyScore]) -> float:
    """Slope in score points per calendar day (gaps between dates are respected)."""
    if not scores:
        return 0.0
    start: date = scores[0].date
    return least_squares_slope([((s.date - start).days, s.score) for s in scores])


def direction(slope: float, flat_threshold: float = FLAT_THRESHOLD) -> TrendDirection:
    """Classify a slope as up, down or flat."""
    if slope > flat_threshold:
        return "up"
    if slope < -flat_threshold:
        return "down"
    return "flat"


def moving_average(
    scores: list[DailyScore], window: int = MOVING_AVERAGE_WINDOW
) -> list[MovingAveragePoint]:
    """Trailing moving average; the first points use as many days as are available."""
    points = []
    for i, current in enumerate(scores):
        window_scores = [s.score for s in scores[max(0, i - window + 1) : i + 1]]
        points.append(MovingAveragePoint(date=current.date, value=round(statistics.fmean(window_scores), 2)))
    return points


def analyze_trends(request: AnalysisRequest) -> TrendResponse:
    """Compute slope, direction and 3-day moving average of daily scores."""
    scores = daily_scores(prepare_days(request.days))
    slope = score_slope(scores)
    return TrendResponse(
        employee_id=request.employee_id,
        slope=round(slope, 2),
        direction=direction(slope),
        moving_average=moving_average(scores),
    )
