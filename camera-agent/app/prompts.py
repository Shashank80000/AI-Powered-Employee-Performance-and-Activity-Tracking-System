"""Prompt text and JSON schema sent to Claude in vision mode."""

from __future__ import annotations

import json
from typing import Any

# Everything Claude may answer with. The agent adds "unclassified" for refusals.
VISION_STATES: list[str] = [
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

OBSERVATION_PROMPT = f"""You are labelling a single webcam frame from a work computer. The \
person who uses this computer has explicitly agreed to periodic webcam checks so that their \
own work rhythm (time at the desk, calls, breaks) can be summarised for them and their manager.

Return ONLY a JSON object with exactly these fields:
- "state": one of {json.dumps(VISION_STATES)}
- "activity": a short, generic label of at most 8 words, for example "typing at the computer" \
or "on a video call with headset".
- "confidence": a number from 0 to 1 for how sure you are about the state.

How to choose "state":
- "working_at_computer": facing the screen, typing, using the mouse or reading the screen.
- "reading_or_writing": reading paper documents or writing by hand.
- "on_a_call": wearing a headset or clearly speaking on a call or video meeting.
- "talking_with_someone": talking with another person who is physically present.
- "using_phone": looking at or using a mobile phone.
- "eating_or_drinking", "taking_a_break": as named; a break includes stretching or resting.
- "away_from_desk": nobody is in front of the computer.
- "camera_blocked": the frame is black, covered, or too dark or blurred to tell.
- "other": none of the above fits.

Strict privacy rules. The labels describe the kind of activity only. "activity" MUST NOT:
- identify or name anyone, or guess identity, age, gender, ethnicity, religion or health;
- describe faces, bodies, clothing, emotions, mood or attractiveness;
- describe the room, belongings, other people beyond "a colleague", or anything visible on \
screens or papers, including any text, numbers or brands.
If another person is visible, never describe them beyond "talking_with_someone"."""

OBSERVATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "state": {"type": "string", "enum": VISION_STATES},
        "activity": {"type": "string"},
        "confidence": {"type": "number"},
    },
    "required": ["state", "activity", "confidence"],
    "additionalProperties": False,
}
