"""Pydantic models for the server's internal API and for Claude's structured outputs.

Fields are snake_case in Python and camelCase on the wire (via an alias generator),
matching the Node server's JSON.

Privacy: no model here carries image bytes, window titles or on-screen text. A
screenshot is represented only by its id, owner, timestamp and a generic category, and a
camera observation only by its time and a generic state label.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

ModelCategory = Literal[
    "coding",
    "documents",
    "design",
    "communication",
    "meeting",
    "research",
    "admin",
    "entertainment",
    "social_media",
    "idle_or_locked",
    "other",
]
# "unclassified" is never produced by the model; the agent uses it for refusals.
Category = Literal[
    "coding",
    "documents",
    "design",
    "communication",
    "meeting",
    "research",
    "admin",
    "entertainment",
    "social_media",
    "idle_or_locked",
    "other",
    "unclassified",
]
ScreenshotStatus = Literal["pending", "analyzed", "failed"]
# Generic webcam labels reported by camera-agent (mirrors server/src/utils/cameraStates.js).
CameraState = Literal[
    "working_at_computer",
    "reading_or_writing",
    "on_a_call",
    "talking_with_someone",
    "using_phone",
    "eating_or_drinking",
    "taking_a_break",
    "present_at_desk",
    "away_from_desk",
    "camera_blocked",
    "other",
    "unclassified",
]


class CamelModel(BaseModel):
    """Base model that serialises and accepts camelCase field names."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


# ------------------------------------------------------------ server: screenshots


class ScreenshotRef(CamelModel):
    """One pending screenshot from GET /api/internal/screenshots."""

    id: str
    employee_id: str
    captured_at: datetime


class ScreenshotList(CamelModel):
    screenshots: list[ScreenshotRef] = Field(default_factory=list)


class ScreenshotAnalysis(CamelModel):
    """Generic classification stored on a screenshot record."""

    category: Category
    activity: str
    productive: bool
    confidence: float = Field(ge=0.0, le=1.0)


class ScreenshotUpdate(CamelModel):
    """Body for PATCH /api/internal/screenshots/{id}."""

    status: Literal["analyzed", "failed"]
    analysis: ScreenshotAnalysis | None = None


# ------------------------------------------------------------------ server: day


class Employee(CamelModel):
    id: str
    name: str = ""


class Performance(CamelModel):
    """That day's aggregated activity metrics (no raw activity data)."""

    active_seconds: int = 0
    idle_seconds: int = 0
    productive_app_seconds: int = 0
    tasks_assigned: int = 0
    tasks_completed: int = 0
    on_time_tasks: int = 0
    productivity_score: float | None = None


class DayScreenshot(CamelModel):
    id: str
    captured_at: datetime
    status: ScreenshotStatus
    analysis: ScreenshotAnalysis | None = None


class CameraObservation(CamelModel):
    """One camera-agent label. The server never has the frame it came from."""

    observed_at: datetime
    state: CameraState
    activity: str | None = None


class DayData(CamelModel):
    """Response of GET /api/internal/day/{employeeId}."""

    employee: Employee
    interval_minutes: int = Field(default=5, ge=1)
    performance: Performance | None = None
    screenshots: list[DayScreenshot] = Field(default_factory=list)
    camera_interval_minutes: int = Field(default=5, ge=1)
    camera_observations: list[CameraObservation] = Field(default_factory=list)


class CameraEmployees(CamelModel):
    """Response of GET /api/internal/camera/employees."""

    employee_ids: list[str] = Field(default_factory=list)


class TimelineEntry(CamelModel):
    captured_at: datetime
    category: Category
    activity: str


class CameraSummary(CamelModel):
    """Day totals from camera labels."""

    observation_count: int
    state_minutes: dict[str, int]
    at_desk_minutes: int
    away_minutes: int


class DailyAnalysis(CamelModel):
    """Body for PUT /api/internal/daily-analyses."""

    employee_id: str
    date: date
    screenshot_count: int
    analyzed_count: int
    category_minutes: dict[str, int]
    productive_minutes: int
    timeline: list[TimelineEntry]
    camera: CameraSummary | None = None
    summary: str
    highlights: list[str] = Field(max_length=4)
    suggestions: list[str] = Field(max_length=4)
    model: str
    generated_at: datetime


# ------------------------------------------------------------ Claude outputs


class ClassificationOutput(BaseModel):
    """Exactly what the classification prompt asks Claude to return."""

    model_config = ConfigDict(extra="forbid")

    category: ModelCategory
    activity: str
    productive: bool
    confidence: float

    @field_validator("confidence")
    @classmethod
    def _clamp(cls, value: float) -> float:
        return min(1.0, max(0.0, value))


class DaySummaryOutput(BaseModel):
    """Day summary returned by Claude (or built from the template)."""

    model_config = ConfigDict(extra="forbid")

    summary: str
    highlights: list[str]
    suggestions: list[str]

    @field_validator("highlights", "suggestions")
    @classmethod
    def _cap(cls, items: list[str]) -> list[str]:
        return [item.strip() for item in items if item.strip()][:4]
