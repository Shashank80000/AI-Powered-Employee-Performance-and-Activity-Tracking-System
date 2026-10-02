"""Pydantic request/response models.

Fields are snake_case in Python and camelCase on the wire (via an alias
generator), so the Node server always sends and receives camelCase JSON.

Privacy: these models only describe aggregated numeric daily metrics.
There is intentionally no field for keystrokes, window titles or screenshots.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

TrendDirection = Literal["up", "down", "flat"]
AnomalyMetric = Literal["activeSeconds", "idleSeconds", "score"]


class CamelModel(BaseModel):
    """Base model that serialises and accepts camelCase field names."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )


# ---------------------------------------------------------------- requests


class DailyMetrics(CamelModel):
    """Aggregated activity metrics for one employee on one day."""

    date: date
    active_seconds: int = Field(ge=0)
    idle_seconds: int = Field(ge=0)
    productive_app_seconds: int = Field(ge=0)
    tasks_completed: int = Field(ge=0)
    tasks_assigned: int = Field(ge=0)
    on_time_tasks: int = Field(ge=0)


class AnalysisRequest(CamelModel):
    """Common request body for every POST /api/ai/* route."""

    employee_id: str = Field(min_length=1)
    employee_name: str | None = None
    period_start: date | None = None
    period_end: date | None = None
    days: list[DailyMetrics] = Field(min_length=1)


# --------------------------------------------------------------- responses


class Breakdown(CamelModel):
    """Per-factor ratios (0-1) that feed the productivity score."""

    active_ratio: float
    productive_ratio: float
    completion_rate: float
    on_time_rate: float


class DailyScore(CamelModel):
    date: date
    score: float


class MovingAveragePoint(CamelModel):
    date: date
    value: float


class Anomaly(CamelModel):
    date: date
    metric: AnomalyMetric
    value: float
    z_score: float


class ProductivityResponse(CamelModel):
    employee_id: str
    score: float
    breakdown: Breakdown
    daily_scores: list[DailyScore]


class TrendResponse(CamelModel):
    employee_id: str
    slope: float
    direction: TrendDirection
    moving_average: list[MovingAveragePoint]


class AnomalyResponse(CamelModel):
    employee_id: str
    anomalies: list[Anomaly]


class ReportResponse(CamelModel):
    employee_id: str
    score: float
    trend: TrendDirection
    summary: str
    highlights: list[str]
    recommendations: list[str]
    anomalies: list[Anomaly]
    generated_by: Literal["ai-service"] = "ai-service"
    disclaimer: str


class HealthResponse(BaseModel):
    status: str
    service: str
