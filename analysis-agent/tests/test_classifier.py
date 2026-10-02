"""Classification parsing, refusal handling, request shape and retries."""

from __future__ import annotations

import base64

import anthropic
import httpx2
import pytest

from app.classifier import UNCLASSIFIED, classify_image, parse_classification, sanitize_activity
from app.llm import FALLBACK_BETA, ClaudeError
from tests.conftest import JPEG, FakeAnthropic, refusal_response, text_response

GOOD = {"category": "coding", "activity": "editing code in an IDE", "productive": True,
        "confidence": 0.92}


def no_sleep(_: float) -> None:
    return None


def test_parse_valid_classification() -> None:
    result = parse_classification(GOOD)
    assert result.category == "coding"
    assert result.activity == "editing code in an IDE"
    assert result.productive is True
    assert result.confidence == pytest.approx(0.92)


def test_parse_rejects_unknown_category_and_extra_fields() -> None:
    with pytest.raises(ClaudeError):
        parse_classification({**GOOD, "category": "gaming"})
    with pytest.raises(ClaudeError):
        parse_classification({**GOOD, "windowTitle": "secret"})


def test_parse_clamps_confidence() -> None:
    assert parse_classification({**GOOD, "confidence": 1.7}).confidence == 1.0


def test_sanitize_strips_screen_text_and_caps_words() -> None:
    raw = "replying to bob@corp.com about invoice 4411 at https://x.io in report.pdf now please ok"
    cleaned = sanitize_activity(raw)
    assert "@" not in cleaned and "4411" not in cleaned and "http" not in cleaned
    assert "report.pdf" not in cleaned
    assert len(cleaned.split()) <= 8


def test_classify_request_shape(settings) -> None:
    fake = FakeAnthropic([text_response(GOOD)])
    result = classify_image(fake, settings, JPEG, no_sleep)
    assert result.category == "coding"
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["output_config"]["effort"] == "low"
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["betas"] == [FALLBACK_BETA] and call["fallbacks"] == "default"
    image = call["messages"][0]["content"][0]
    assert image["source"]["media_type"] == "image/jpeg"
    assert base64.standard_b64decode(image["source"]["data"]) == JPEG


def test_fallback_can_be_disabled(settings) -> None:
    from dataclasses import replace

    fake = FakeAnthropic([text_response(GOOD)])
    classify_image(fake, replace(settings, refusal_fallback=False), JPEG, no_sleep)
    assert "fallbacks" not in fake.calls[0] and "betas" not in fake.calls[0]


def test_refusal_becomes_unclassified(settings) -> None:
    fake = FakeAnthropic([refusal_response()])
    assert classify_image(fake, settings, JPEG, no_sleep) == UNCLASSIFIED
    assert len(fake.calls) == 1  # refusals are not retried


def test_retries_rate_limit_and_connection_errors(settings) -> None:
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    rate_limited = anthropic.RateLimitError(
        "rate limited", response=httpx2.Response(429, request=request, headers={"retry-after": "1"}),
        body=None,
    )
    fake = FakeAnthropic([rate_limited, anthropic.APIConnectionError(request=request),
                          text_response(GOOD)])
    assert classify_image(fake, settings, JPEG, no_sleep).category == "coding"
    assert len(fake.calls) == 3


def test_client_error_is_not_retried(settings) -> None:
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    bad = anthropic.BadRequestError("bad", response=httpx2.Response(400, request=request), body=None)
    fake = FakeAnthropic([bad, text_response(GOOD)])
    with pytest.raises(ClaudeError):
        classify_image(fake, settings, JPEG, no_sleep)
    assert len(fake.calls) == 1


def test_invalid_json_raises(settings) -> None:
    fake = FakeAnthropic([text_response("not json")])
    with pytest.raises(ClaudeError):
        classify_image(fake, settings, JPEG, no_sleep)
