"""Environment-driven settings for the analysis agent."""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_MODEL = "claude-opus-5-5"
DEFAULT_SERVER_URL = "http://localhost:4000"


class ConfigError(RuntimeError):
    """Raised when a required environment variable is missing or invalid."""


def _flag(value: str | None, default: bool) -> bool:
    """Parse a boolean-ish env value ("1", "true", "yes", "on")."""
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _positive_int(name: str, value: str | None, default: int) -> int:
    if value is None or value.strip() == "":
        return default
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer") from exc
    if parsed < 1:
        raise ConfigError(f"{name} must be >= 1")
    return parsed


@dataclass(frozen=True)
class Settings:
    """Runtime configuration. Anthropic credentials are resolved by the SDK itself."""

    server_url: str
    service_api_key: str
    model: str = DEFAULT_MODEL
    max_concurrency: int = 4
    dry_run: bool = False
    refusal_fallback: bool = True
    claude_attempts: int = 3

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Settings:
        """Build settings from environment variables (or an explicit mapping)."""
        env = dict(os.environ if env is None else env)
        key = env.get("SERVICE_API_KEY", "").strip()
        if not key:
            raise ConfigError("SERVICE_API_KEY is required")
        return cls(
            server_url=env.get("SERVER_URL", DEFAULT_SERVER_URL).rstrip("/"),
            service_api_key=key,
            model=env.get("ANALYSIS_MODEL", "").strip() or DEFAULT_MODEL,
            max_concurrency=_positive_int("MAX_CONCURRENCY", env.get("MAX_CONCURRENCY"), 4),
            dry_run=_flag(env.get("DRY_RUN"), False),
            refusal_fallback=_flag(env.get("REFUSAL_FALLBACK"), True),
        )
