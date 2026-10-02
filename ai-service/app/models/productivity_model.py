"""Transparent weighted productivity scoring model.

No training is needed: the score is a weighted average of four ratios, each
in [0, 1], scaled to 0-100. Weights are explicit so that managers and
employees can see exactly how a score was produced.

Factors with no underlying data (e.g. no tasks assigned) are excluded and
their weight is redistributed across the remaining factors, so an employee
is never penalised for missing data.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.utils.data_processing import MetricTotals, safe_ratio


@dataclass(frozen=True)
class ScoringWeights:
    """Relative weight of each factor. They need not sum to 1."""

    active_ratio: float = 0.30
    productive_ratio: float = 0.30
    completion_rate: float = 0.25
    on_time_rate: float = 0.15


@dataclass(frozen=True)
class ScoreResult:
    """A 0-100 score plus the ratios it was computed from."""

    score: float
    breakdown: dict[str, float]
    used_factors: list[str] = field(default_factory=list)


class ProductivityModel:
    """Weighted scoring of aggregated activity and task metrics."""

    def __init__(self, weights: ScoringWeights | None = None) -> None:
        self.weights = weights or ScoringWeights()

    @staticmethod
    def factors(metrics: MetricTotals) -> dict[str, tuple[float, bool]]:
        """Return {factor: (ratio, has_data)} for the given metrics."""
        tracked = metrics.active_seconds + metrics.idle_seconds
        return {
            "active_ratio": (safe_ratio(metrics.active_seconds, tracked), tracked > 0),
            "productive_ratio": (
                safe_ratio(metrics.productive_app_seconds, metrics.active_seconds),
                metrics.active_seconds > 0,
            ),
            "completion_rate": (
                safe_ratio(metrics.tasks_completed, metrics.tasks_assigned),
                metrics.tasks_assigned > 0,
            ),
            "on_time_rate": (
                safe_ratio(metrics.on_time_tasks, metrics.tasks_completed),
                metrics.tasks_completed > 0,
            ),
        }

    def score(self, metrics: MetricTotals) -> ScoreResult:
        """Compute the 0-100 score (1 decimal) and per-factor breakdown."""
        factors = self.factors(metrics)
        used = [name for name, (_, has_data) in factors.items() if has_data]
        total_weight = sum(getattr(self.weights, name) for name in used)

        weighted = sum(getattr(self.weights, name) * factors[name][0] for name in used)
        score = 100 * safe_ratio(weighted, total_weight)

        breakdown = {name: round(ratio, 4) for name, (ratio, _) in factors.items()}
        return ScoreResult(score=round(score, 1), breakdown=breakdown, used_factors=used)
