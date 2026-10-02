"""Pydantic models for the server's camera API and for Claude's structured output.

Privacy: no model here carries image bytes. An observation is a time and a generic label.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

# Mirrors server/src/utils/cameraStates.js.
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
VisionState = Literal[
    "working_at_computer",
    "reading_or_writing",
    "on_a_call",
    "talking_with_someone",
    "using_phone",
    "eating_or_drinking",
    "taking_a_break",
    "away_from_desk",
    "camera_blocked",
    "other",
]


class CamelModel(BaseModel):
    """Base model that serialises and accepts camelCase field names."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class Observation(CamelModel):
    """Body for POST /api/camera/observations."""

    observed_at: datetime
    state: CameraState
    activity: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: Literal["local", "vision"]


class CameraConsent(CamelModel):
    """Response body (``consent``) of GET/PUT /api/camera/consent."""

    given: bool = False
    mode: Literal["local", "vision"] | None = None
    interval_minutes: int = Field(default=5, ge=1)
    retention_days: int = 30


class Tracking(CamelModel):
    state: Literal["stopped", "active", "paused"] = "stopped"


class VisionOutput(BaseModel):
    """Exactly what the observation prompt asks Claude to return."""

    model_config = ConfigDict(extra="forbid")

    state: VisionState
    activity: str
    confidence: float

    @field_validator("confidence")
    @classmethod
    def _clamp(cls, value: float) -> float:
        return min(1.0, max(0.0, value))
