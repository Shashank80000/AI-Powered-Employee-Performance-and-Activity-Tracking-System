"""Detect unusual days in active time, idle time and daily score."""

from __future__ import annotations

from app.models.anomaly_model import ZScoreAnomalyDetector
from app.schemas import AnalysisRequest, Anomaly, AnomalyMetric, AnomalyResponse, DailyMetrics
from app.services.productivity_analysis import daily_scores
from app.utils.data_processing import prepare_days


def metric_series(days: list[DailyMetrics]) -> dict[AnomalyMetric, list[float]]:
    """Build the numeric series that are checked for anomalies."""
    return {
        "activeSeconds": [float(d.active_seconds) for d in days],
        "idleSeconds": [float(d.idle_seconds) for d in days],
        "score": [s.score for s in daily_scores(days)],
    }


def find_anomalies(
    days: list[DailyMetrics], detector: ZScoreAnomalyDetector | None = None
) -> list[Anomaly]:
    """Return anomalies across all checked metrics, ordered by date then metric."""
    detector = detector or ZScoreAnomalyDetector()
    anomalies = [
        Anomaly(date=days[o.index].date, metric=metric, value=o.value, z_score=o.z_score)
        for metric, values in metric_series(days).items()
        for o in detector.detect(values)
    ]
    return sorted(anomalies, key=lambda a: (a.date, a.metric))


def analyze_anomalies(request: AnalysisRequest, threshold: float = 2.0) -> AnomalyResponse:
    """Run z-score anomaly detection for the request's days."""
    days = prepare_days(request.days)
    return AnomalyResponse(
        employee_id=request.employee_id,
        anomalies=find_anomalies(days, ZScoreAnomalyDetector(threshold=threshold)),
    )
