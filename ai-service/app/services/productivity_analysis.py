"""Productivity scoring for a period and for each day."""

from __future__ import annotations

from app.models.productivity_model import ProductivityModel
from app.schemas import (
    AnalysisRequest,
    Breakdown,
    DailyMetrics,
    DailyScore,
    ProductivityResponse,
)
from app.utils.data_processing import day_totals, prepare_days, totals

_model = ProductivityModel()


def daily_scores(days: list[DailyMetrics], model: ProductivityModel = _model) -> list[DailyScore]:
    """Score each (already prepared) day independently."""
    return [DailyScore(date=day.date, score=model.score(day_totals(day)).score) for day in days]


def analyze_productivity(
    request: AnalysisRequest, model: ProductivityModel = _model
) -> ProductivityResponse:
    """Score the whole period from summed metrics, plus per-day scores."""
    days = prepare_days(request.days)
    result = model.score(totals(days))
    return ProductivityResponse(
        employee_id=request.employee_id,
        score=result.score,
        breakdown=Breakdown(**result.breakdown),
        daily_scores=daily_scores(days, model),
    )
