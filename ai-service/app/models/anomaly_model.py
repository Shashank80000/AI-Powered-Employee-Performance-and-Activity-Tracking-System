"""Z-score based anomaly detector (standard library only)."""

from __future__ import annotations

import statistics
from dataclasses import dataclass

DEFAULT_THRESHOLD = 2.0
MIN_POINTS = 3


@dataclass(frozen=True)
class Outlier:
    """Index of an anomalous value in the input series and its z-score."""

    index: int
    value: float
    z_score: float


class ZScoreAnomalyDetector:
    """Flags values whose |z-score| is at or above a threshold.

    Uses the population standard deviation of the series. Returns no
    anomalies when there are fewer than `min_points` values or when every
    value is identical (std == 0), since a z-score is undefined then.

    Note: with population std the largest possible |z| in n points is
    (n - 1) / sqrt(n), so a threshold of 2.0 needs at least 6 points to fire.
    """

    def __init__(self, threshold: float = DEFAULT_THRESHOLD, min_points: int = MIN_POINTS) -> None:
        if threshold <= 0:
            raise ValueError("threshold must be positive")
        self.threshold = threshold
        self.min_points = max(min_points, 2)

    def z_scores(self, values: list[float]) -> list[float]:
        """Return the z-score of each value (all 0.0 if undefined)."""
        if len(values) < self.min_points:
            return [0.0] * len(values)
        mean = statistics.fmean(values)
        std = statistics.pstdev(values, mu=mean)
        if std == 0:
            return [0.0] * len(values)
        return [(value - mean) / std for value in values]

    def detect(self, values: list[float]) -> list[Outlier]:
        """Return every value whose |z-score| >= threshold."""
        return [
            Outlier(index=i, value=values[i], z_score=round(z, 2))
            for i, z in enumerate(self.z_scores(values))
            if abs(z) >= self.threshold
        ]
