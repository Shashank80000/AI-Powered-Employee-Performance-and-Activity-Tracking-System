"""Per-screenshot classification with Claude vision.

Image bytes are only held in memory, base64-encoded into the request, and never logged.
"""

from __future__ import annotations

import base64
import re
from collections.abc import Callable
from typing import Any

from pydantic import ValidationError

from app.config import Settings
from app.llm import ClaudeError, create_structured
from app.prompts import CLASSIFICATION_PROMPT, CLASSIFICATION_SCHEMA
from app.schemas import ClassificationOutput, ScreenshotAnalysis

MAX_ACTIVITY_WORDS = 8
CLASSIFY_MAX_TOKENS = 2048

UNCLASSIFIED = ScreenshotAnalysis(
    category="unclassified", activity="unclassified", productive=False, confidence=0.0
)

# Tokens that look like on-screen text: digits, emails, URLs, paths, file names.
_LEAKY_TOKEN = re.compile(r"\d|@|https?:|www\.|/|\\|\.[a-z0-9]{1,5}$", re.IGNORECASE)


def build_image_content(image: bytes) -> list[dict[str, Any]]:
    """User content: a base64 JPEG block followed by the instruction text."""
    data = base64.standard_b64encode(image).decode("utf-8")
    return [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": data}},
        {"type": "text", "text": "Classify this screenshot."},
    ]


def sanitize_activity(text: str) -> str:
    """Defence in depth: drop anything resembling on-screen text and cap at 8 words."""
    words = [w for w in text.replace('"', " ").split() if not _LEAKY_TOKEN.search(w)]
    cleaned = " ".join(words[:MAX_ACTIVITY_WORDS]).strip(" .,;:-")
    return cleaned or "unspecified activity"


def parse_classification(data: dict[str, Any]) -> ScreenshotAnalysis:
    """Validate Claude's JSON and convert it into the stored analysis shape."""
    try:
        output = ClassificationOutput.model_validate(data)
    except ValidationError as exc:
        raise ClaudeError("classification did not match the schema") from exc
    return ScreenshotAnalysis(
        category=output.category,
        activity=sanitize_activity(output.activity),
        productive=output.productive,
        confidence=output.confidence,
    )


def classify_image(
    client: Any, settings: Settings, image: bytes, sleep: Callable[[float], None] | None = None
) -> ScreenshotAnalysis:
    """Classify one screenshot; a refusal becomes category "unclassified"."""
    extra = {"sleep": sleep} if sleep else {}
    result = create_structured(
        client,
        settings,
        system=CLASSIFICATION_PROMPT,
        content=build_image_content(image),
        schema=CLASSIFICATION_SCHEMA,
        effort="low",
        max_tokens=CLASSIFY_MAX_TOKENS,
        **extra,
    )
    if result.refused or result.data is None:
        return UNCLASSIFIED
    return parse_classification(result.data)
