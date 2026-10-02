"""AI analysis endpoints under /api/ai (called by the Node/Express server)."""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas import (
    AnalysisRequest,
    AnomalyResponse,
    ProductivityResponse,
    ReportResponse,
    TrendResponse,
)
from app.services.anomaly_detection import analyze_anomalies
from app.services.productivity_analysis import analyze_productivity
from app.services.report_generation import generate_report
from app.services.trend_analysis import analyze_trends

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/productivity", response_model=ProductivityResponse)
def productivity(request: AnalysisRequest) -> ProductivityResponse:
    """Weighted 0-100 productivity score with per-factor breakdown."""
    return analyze_productivity(request)


@router.post("/trends", response_model=TrendResponse)
def trends(request: AnalysisRequest) -> TrendResponse:
    """Slope, direction and 3-day moving average of daily scores."""
    return analyze_trends(request)


@router.post("/anomalies", response_model=AnomalyResponse)
def anomalies(request: AnalysisRequest) -> AnomalyResponse:
    """Z-score anomalies in active time, idle time and daily score."""
    return analyze_anomalies(request)


@router.post("/report", response_model=ReportResponse)
def report(request: AnalysisRequest) -> ReportResponse:
    """Template-based natural-language performance report."""
    return generate_report(request)
