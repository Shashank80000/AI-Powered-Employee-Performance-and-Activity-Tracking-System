"""Environment-driven settings for the camera agent."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

DEFAULT_MODEL = "claude-opus-5-5"
DEFAULT_SERVER_URL = "http://localhost:4000"

Mode = Literal["local", "vision"]


class ConfigError(RuntimeError):
    """Raised when an environment variable is invalid."""


def _flag(value: str | None, default: bool) -> bool:
    """Parse a boolean-ish env value ("1", "true", "yes", "on")."""
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, value: str | None, default: int, minimum: int) -> int:
    if value is None or value.strip() == "":
        return default
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer") from exc
    if parsed < minimum:
        raise ConfigError(f"{name} must be >= {minimum}")
    return parsed


@dataclass(frozen=True)
class Settings:
    """Runtime configuration. Anthropic credentials are resolved by the SDK itself."""

    server_url: str = DEFAULT_SERVER_URL
    email: str = ""
    # "local": on-device face detection only, nothing but a label leaves the machine.
    # "vision": the frame is sent to Claude to label the activity. Needs matching consent.
    mode: Mode = "local"
    camera_index: int = 0
    model: str = DEFAULT_MODEL
    dry_run: bool = False
    refusal_fallback: bool = True
    claude_attempts: int = 3

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Settings:
        """Build settings from environment variables (or an explicit mapping)."""
        env = dict(os.environ if env is None else env)
        mode = env.get("CAMERA_MODE", "").strip().lower() or "local"
        if mode not in ("local", "vision"):
            raise ConfigError('CAMERA_MODE must be "local" or "vision"')
        return cls(
            server_url=env.get("SERVER_URL", DEFAULT_SERVER_URL).rstrip("/"),
            email=env.get("WORKPLUS_EMAIL", "").strip(),
            mode=mode,  # type: ignore[arg-type]
            camera_index=_int("CAMERA_INDEX", env.get("CAMERA_INDEX"), 0, 0),
            model=env.get("CAMERA_MODEL", "").strip() or DEFAULT_MODEL,
            dry_run=_flag(env.get("DRY_RUN"), False),
            refusal_fallback=_flag(env.get("REFUSAL_FALLBACK"), True),
        )
