"""Prompt text and JSON schemas sent to Claude."""

from __future__ import annotations

import json
from typing import Any

CATEGORIES: list[str] = [
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

CLASSIFICATION_PROMPT = f"""You are classifying a single screenshot of a work computer screen. \
The user of this computer has explicitly consented to periodic screenshots being taken for \
their own activity tracking.

Return ONLY a JSON object with exactly these fields:
- "category": one of {json.dumps(CATEGORIES)}
- "activity": a short, generic label of at most 8 words describing the kind of activity, \
for example "editing code in an IDE" or "reading a document".
- "productive": true if the screen shows work-related activity, otherwise false.
- "confidence": a number from 0 to 1 for how sure you are about the category.

Strict privacy rules for "activity": it MUST NOT contain any names of people, email \
addresses, message or chat contents, numbers, URLs, file names, or any other text read \
from the screen. Describe the type of activity only, never its content.

Use "idle_or_locked" for lock screens, screensavers, or an empty desktop. Use "other" when \
no category fits."""

CLASSIFICATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": CATEGORIES},
        "activity": {"type": "string"},
        "productive": {"type": "boolean"},
        "confidence": {"type": "number"},
    },
    "required": ["category", "activity", "productive", "confidence"],
    "additionalProperties": False,
}

DAY_SUMMARY_PROMPT = """You write a short, supportive end-of-day summary for an employee's \
own activity dashboard. You receive only aggregated data: minutes per screen activity \
category, a timeline of generic activity labels with times, that day's activity metrics and, \
when the person turned on camera checks, minutes per generic camera state (for example \
"working_at_computer", "on_a_call", "away_from_desk") with a timeline of those states.

Return a JSON object with:
- "summary": 2-4 sentences in a supportive, non-judgmental tone. Do not add a label or \
prefix; the application labels it as AI-generated.
- "highlights": up to 4 short positive observations grounded in the data.
- "suggestions": up to 4 short, practical, kind suggestions.

Camera states describe presence and posture only. Treat time away from the desk, breaks and \
eating as normal parts of a working day, never as misconduct, and use them only to comment on \
work rhythm (for example focus blocks or break patterns). If camera and screen data disagree, \
say nothing about it rather than guessing.

Do not speculate beyond the data, do not guess personal details, and do not invent numbers."""

DAY_SUMMARY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "highlights": {"type": "array", "items": {"type": "string"}},
        "suggestions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "highlights", "suggestions"],
    "additionalProperties": False,
}
