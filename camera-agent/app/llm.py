"""Thin wrapper around the Anthropic Messages API: structured JSON output with retries.

Same policy as analysis-agent/app/llm.py (kept as a copy so this agent installs on its own).

SDK usage follows the claude-api skill docs:
- ``client.beta.messages.create(..., betas=[...], fallbacks=...)`` for server-side refusal
  fallbacks (python/claude-api/README.md "Refusal Fallbacks"; the ``"default"`` scalar form
  with the ``server-side-fallback-2026-07-01`` header from shared/model-migration.md
  "Migrating to Claude Opus 5 -> New API features").
- ``output_config={"effort": ..., "format": {"type": "json_schema", ...}}`` for structured
  output (python/claude-api/tool-use.md "Structured Outputs -> Raw Schema"). The
  ``messages.parse`` helper is only documented on the non-beta namespace, so the raw-schema
  form is used here to stay compatible with ``fallbacks``.
- Typed errors ``RateLimitError`` / ``APIStatusError`` / ``APIConnectionError``
  (python/claude-api/README.md "Error Handling" and "Retry with Exponential Backoff").
"""

from __future__ import annotations

import json
import logging
import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import anthropic

from app.config import Settings

log = logging.getLogger(__name__)

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class ClaudeError(RuntimeError):
    """Claude could not produce a usable answer (after retries)."""


@dataclass(frozen=True)
class StructuredResult:
    """Parsed JSON from Claude, or ``refused=True`` when the model declined."""

    data: dict[str, Any] | None
    refused: bool = False


def make_client() -> anthropic.Anthropic:
    """Create the SDK client. Credentials are resolved by the SDK from the environment.

    SDK-level retries are disabled so ``create_structured`` is the single retry policy.
    """
    return anthropic.Anthropic(max_retries=0)


def _backoff(attempt: int, error: Exception) -> float:
    """Seconds to wait before the next attempt (honours retry-after on 429)."""
    if isinstance(error, anthropic.RateLimitError):
        retry_after = error.response.headers.get("retry-after")
        if retry_after and retry_after.isdigit():
            return min(float(retry_after), 60.0)
    return min(2.0**attempt + random.uniform(0, 1), 30.0)


def _request(
    client: Any, settings: Settings, *, system: str, content: Any, schema: dict[str, Any],
    effort: str, max_tokens: int,
) -> Any:
    """One Messages API call with structured output and (optionally) refusal fallbacks."""
    kwargs: dict[str, Any] = {
        "model": settings.model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": content}],
        "output_config": {"effort": effort, "format": {"type": "json_schema", "schema": schema}},
    }
    if settings.refusal_fallback:
        # Server-side fallback re-runs a policy-declined request on Anthropic's recommended
        # model inside the same call. Claude API only; disable via REFUSAL_FALLBACK=false
        # on Bedrock / Vertex / Foundry.
        kwargs["betas"] = [FALLBACK_BETA]
        kwargs["fallbacks"] = "default"
    return client.beta.messages.create(**kwargs)


def _extract_json(response: Any) -> dict[str, Any]:
    """Read the JSON text block guaranteed by ``output_config.format``."""
    if response.stop_reason == "max_tokens":
        raise ClaudeError("response truncated at max_tokens")
    text = next((b.text for b in response.content if getattr(b, "type", None) == "text"), None)
    if text is None:
        raise ClaudeError("response contained no text block")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ClaudeError("response was not valid JSON") from exc
    if not isinstance(data, dict):
        raise ClaudeError("response JSON was not an object")
    return data


def create_structured(
    client: Any,
    settings: Settings,
    *,
    system: str,
    content: Any,
    schema: dict[str, Any],
    effort: str,
    max_tokens: int,
    sleep: Callable[[float], None] = time.sleep,
) -> StructuredResult:
    """Call Claude with retries on 429 / 5xx / network errors; 4xx errors fail fast."""
    last_error: Exception | None = None
    for attempt in range(settings.claude_attempts):
        try:
            response = _request(
                client, settings, system=system, content=content, schema=schema,
                effort=effort, max_tokens=max_tokens,
            )
        except anthropic.RateLimitError as exc:
            last_error = exc
        except anthropic.APIStatusError as exc:
            if exc.status_code < 500:
                raise ClaudeError(f"Claude API error {exc.status_code}") from exc
            last_error = exc
        except anthropic.APIConnectionError as exc:
            last_error = exc
        else:
            if response.stop_reason == "refusal":
                return StructuredResult(data=None, refused=True)
            return StructuredResult(data=_extract_json(response))
        if attempt + 1 < settings.claude_attempts:
            delay = _backoff(attempt, last_error)
            log.warning("Claude call failed (%s); retry %d in %.1fs",
                        type(last_error).__name__, attempt + 1, delay)
            sleep(delay)
    raise ClaudeError(f"Claude call failed after retries: {type(last_error).__name__}") from last_error
