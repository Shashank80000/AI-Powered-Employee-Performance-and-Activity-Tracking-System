"""Shared fakes: a scripted Anthropic client, fake frames and a mocked Node server.

No test opens a webcam or makes a real network or Anthropic API call.
"""

from __future__ import annotations

import json
import threading
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from app.camera import Frame
from app.config import Settings
from app.server_client import ServerClient

JPEG = b"\xff\xd8\xff\xe0fake-webcam-bytes"


class FakeGray:
    """Stands in for a grayscale numpy frame: only mean() and std() are used."""

    def __init__(self, mean: float = 120.0, std: float = 40.0) -> None:
        self._mean, self._std = mean, std

    def mean(self) -> float:
        return self._mean

    def std(self) -> float:
        return self._std


def frame(mean: float = 120.0, std: float = 40.0) -> Frame:
    return Frame(jpeg=JPEG, gray=FakeGray(mean, std))


def text_response(payload: dict[str, Any] | str, stop_reason: str = "end_turn") -> SimpleNamespace:
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="text", text=text)])


def refusal_response() -> SimpleNamespace:
    return SimpleNamespace(stop_reason="refusal", content=[])


class FakeAnthropic:
    """Mimics ``client.beta.messages.create``; replies from a queue."""

    def __init__(self, replies: list[Any]) -> None:
        self.calls: list[dict[str, Any]] = []
        self._replies = replies
        self._lock = threading.Lock()
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs: Any) -> Any:
        with self._lock:
            self.calls.append(kwargs)
            reply = self._replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


@pytest.fixture
def settings() -> Settings:
    return Settings(server_url="http://server.test", mode="vision")


class FakeServer:
    """In-memory implementation of the endpoints the camera agent uses."""

    def __init__(self, tracking: str = "active", consent_mode: str | None = "vision",
                 observation_status: int = 201) -> None:
        self.tracking = tracking
        self.consent_mode = consent_mode
        self.observation_status = observation_status
        self.observations: list[dict] = []
        self.requests: list[httpx.Request] = []

    def _consent(self) -> dict:
        return {"given": self.consent_mode is not None, "mode": self.consent_mode,
                "intervalMinutes": 5, "retentionDays": 30}

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path, method = request.url.path, request.method
        if path == "/api/auth/login":
            body = json.loads(request.content)
            if body["password"] != "secret":
                return httpx.Response(401, json={"message": "Invalid email or password"})
            role = "manager" if body["email"].startswith("manager") else "employee"
            return httpx.Response(200, json={"token": "jwt", "user": {"name": "A", "role": role}})
        if request.headers.get("Authorization") != "Bearer jwt":
            return httpx.Response(401)
        if path == "/api/tracking":
            return httpx.Response(200, json={"tracking": {"state": self.tracking}})
        if path == "/api/camera/consent" and method == "GET":
            return httpx.Response(200, json={"consent": self._consent()})
        if path == "/api/camera/consent" and method == "PUT":
            self.consent_mode = json.loads(request.content)["mode"]
            return httpx.Response(200, json={"consent": self._consent()})
        if path == "/api/camera/consent" and method == "DELETE":
            self.consent_mode = None
            return httpx.Response(204)
        if path == "/api/camera/observations" and method == "POST":
            if self.observation_status < 300:
                self.observations.append(json.loads(request.content))
            return httpx.Response(self.observation_status, json={})
        return httpx.Response(404)

    def client(self, signed_in: bool = True) -> ServerClient:
        client = ServerClient("http://server.test", transport=httpx.MockTransport(self.handler))
        if signed_in:
            client.login("akash@workplus.dev", "secret")
        return client
