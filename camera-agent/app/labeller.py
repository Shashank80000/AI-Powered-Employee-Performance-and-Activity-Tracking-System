"""Turns one frame into an Observation, either on-device ("local") or with Claude ("vision").

Image bytes are only held in memory, base64-encoded into the request, and never logged.
"""

from __future__ import annotations

import base64
import re
from collections.abc import Callable
from datetime import datetime
from typing import Any, Protocol

from pydantic import ValidationError

from app.camera import Frame, is_blocked
from app.config import Settings
from app.llm import ClaudeError, create_structured
from app.prompts import OBSERVATION_PROMPT, OBSERVATION_SCHEMA
from app.schemas import Observation, VisionOutput

MAX_ACTIVITY_WORDS = 8
OBSERVE_MAX_TOKENS = 1024

# Tokens that look like text read from the scene: digits, emails, URLs, paths, file names.
_LEAKY_TOKEN = re.compile(r"\d|@|https?:|www\.|/|\\|\.[a-z0-9]{1,5}$", re.IGNORECASE)


class FaceCounter(Protocol):
    def face_count(self, gray: Any) -> int: ...


def sanitize_activity(text: str) -> str:
    """Defence in depth: drop anything resembling scene text and cap at 8 words."""
    words = [w for w in text.replace('"', " ").split() if not _LEAKY_TOKEN.search(w)]
    cleaned = " ".join(words[:MAX_ACTIVITY_WORDS]).strip(" .,;:-")
    return cleaned or "unspecified activity"


def label_local(frame: Frame, detector: FaceCounter, observed_at: datetime) -> Observation:
    """Presence from face detection. Says nothing about what the person is doing."""
    if is_blocked(frame.gray):
        state, activity, confidence = "camera_blocked", "camera covered or too dark", 0.9
    elif detector.face_count(frame.gray) > 0:
        state, activity, confidence = "present_at_desk", "someone at the desk", 0.7
    else:
        # Haar cascades miss heads turned far away, so this is a best guess.
        state, activity, confidence = "away_from_desk", "nobody detected at the desk", 0.6
    return Observation(observed_at=observed_at, state=state, activity=activity,
                       confidence=confidence, source="local")


def build_image_content(jpeg: bytes) -> list[dict[str, Any]]:
    """User content: a base64 JPEG block followed by the instruction text."""
    data = base64.standard_b64encode(jpeg).decode("utf-8")
    return [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": data}},
        {"type": "text", "text": "Label this webcam frame."},
    ]


def label_vision(
    client: Any, settings: Settings, frame: Frame, observed_at: datetime,
    sleep: Callable[[float], None] | None = None,
) -> Observation:
    """Activity label from Claude; a refusal becomes state "unclassified"."""
    if is_blocked(frame.gray):
        # Nothing to see, so don't send the frame at all.
        return Observation(observed_at=observed_at, state="camera_blocked",
                           activity="camera covered or too dark", confidence=0.9, source="vision")
    extra = {"sleep": sleep} if sleep else {}
    result = create_structured(
        client, settings, system=OBSERVATION_PROMPT, content=build_image_content(frame.jpeg),
        schema=OBSERVATION_SCHEMA, effort="low", max_tokens=OBSERVE_MAX_TOKENS, **extra,
    )
    if result.refused or result.data is None:
        return Observation(observed_at=observed_at, state="unclassified",
                           activity="unclassified", confidence=0.0, source="vision")
    try:
        output = VisionOutput.model_validate(result.data)
    except ValidationError as exc:
        raise ClaudeError("observation did not match the schema") from exc
    return Observation(observed_at=observed_at, state=output.state,
                       activity=sanitize_activity(output.activity),
                       confidence=output.confidence, source="vision")
