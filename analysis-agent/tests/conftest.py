"""Shared fakes: a scripted Anthropic client and a mocked Node server (httpx.MockTransport).

No test makes a real network or Anthropic API call.
"""

from __future__ import annotations

import json
import threading
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from app.config import Settings
from app.server_client import ServerClient

SERVICE_KEY = "test-key"
JPEG = b"\xff\xd8\xff\xe0fake-jpeg-bytes"


def text_response(payload: dict[str, Any] | str, stop_reason: str = "end_turn") -> SimpleNamespace:
    """A Messages API response with one JSON text block."""
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="text", text=text)])


def refusal_response() -> SimpleNamespace:
    return SimpleNamespace(stop_reason="refusal", content=[],
                           stop_details=SimpleNamespace(category="other", explanation=""))


class FakeAnthropic:
    """Mimics ``client.beta.messages.create``; replies via a callable or a queue."""

    def __init__(self, reply: Any) -> None:
        self.calls: list[dict[str, Any]] = []
        self._reply = reply
        self._lock = threading.Lock()
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs: Any) -> Any:
        with self._lock:
            self.calls.append(kwargs)
            reply = self._reply(kwargs) if callable(self._reply) else self._reply.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


@pytest.fixture
def settings() -> Settings:
    return Settings(server_url="http://server.test", service_api_key=SERVICE_KEY,
                    max_concurrency=2)


class FakeServer:
    """In-memory implementation of the internal API contract."""

    def __init__(self, pending: list[dict], days: dict[str, dict],
                 camera_employees: list[str] | None = None) -> None:
        self.pending = pending
        self.days = days
        self.camera_employees = camera_employees or []
        self.patches: dict[str, dict] = {}
        self.puts: list[dict] = []
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.headers.get("X-Service-Key") != SERVICE_KEY:
            return httpx.Response(401, json={"error": "unauthorized"})
        path, method = request.url.path, request.method
        if method == "GET" and path == "/api/internal/screenshots":
            assert request.url.params["status"] == "pending"
            return httpx.Response(200, json={"screenshots": self.pending})
        if method == "GET" and path.endswith("/image"):
            shot_id = path.split("/")[-2]
            if shot_id == "missing":
                return httpx.Response(404)
            return httpx.Response(200, content=JPEG, headers={"content-type": "image/jpeg"})
        if method == "PATCH" and path.startswith("/api/internal/screenshots/"):
            self.patches[path.split("/")[-1]] = json.loads(request.content)
            return httpx.Response(200, json={"ok": True})
        if method == "GET" and path == "/api/internal/camera/employees":
            return httpx.Response(200, json={"employeeIds": self.camera_employees})
        if method == "GET" and path.startswith("/api/internal/day/"):
            return httpx.Response(200, json=self._day(path.split("/")[-1]))
        if method == "PUT" and path == "/api/internal/daily-analyses":
            body = json.loads(request.content)
            self.puts.append(body)
            return httpx.Response(200, json={"dailyAnalysis": body})
        return httpx.Response(404)

    def _day(self, employee_id: str) -> dict:
        """Reflect PATCHed analyses, like the real server would."""
        day = json.loads(json.dumps(self.days[employee_id]))
        for shot in day["screenshots"]:
            patch = self.patches.get(shot["id"])
            if patch:
                shot["status"] = patch["status"]
                shot["analysis"] = patch.get("analysis")
        return day

    def client(self) -> ServerClient:
        return ServerClient("http://server.test", SERVICE_KEY,
                            transport=httpx.MockTransport(self.handler))
