"""httpx client for the Node server, signed in as the employee themselves (never a service key)."""

from __future__ import annotations

from typing import Any, Literal

import httpx

from app.schemas import CameraConsent, Observation, Tracking


class SignedOut(RuntimeError):
    """The sign-in expired or the account was deactivated; sign in again."""


class ServerClient:
    """Typed wrapper around /api/auth, /api/tracking and /api/camera. Holds the token in memory."""

    def __init__(
        self, base_url: str, transport: httpx.BaseTransport | None = None, timeout: float = 15.0,
    ) -> None:
        self._http = httpx.Client(base_url=base_url, transport=transport, timeout=timeout)

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> ServerClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _json(self, response: httpx.Response) -> Any:
        if response.status_code == 401:
            raise SignedOut("Your sign-in has expired. Run the camera agent again to sign in.")
        response.raise_for_status()
        return response.json() if response.content else None

    def login(self, email: str, password: str) -> str:
        """Signs in and returns the person's name. Only employee accounts can use the agent."""
        response = self._http.post("/api/auth/login", json={"email": email, "password": password})
        if response.status_code == 401:
            raise SignedOut("Invalid email or password")
        data = self._json(response)
        if data["user"].get("role") != "employee":
            raise SignedOut("The camera agent is for employee accounts only")
        self._http.headers["Authorization"] = f"Bearer {data['token']}"
        return data["user"].get("name", "")

    def get_consent(self) -> CameraConsent:
        return CameraConsent.model_validate(self._json(self._http.get("/api/camera/consent"))["consent"])

    def give_consent(self, mode: Literal["local", "vision"]) -> CameraConsent:
        data = self._json(self._http.put("/api/camera/consent", json={"agreed": True, "mode": mode}))
        return CameraConsent.model_validate(data["consent"])

    def withdraw_consent(self) -> None:
        self._json(self._http.delete("/api/camera/consent"))

    def tracking_state(self) -> str:
        """'active', 'paused' or 'stopped'; set from the website or the desktop agent."""
        return Tracking.model_validate(self._json(self._http.get("/api/tracking"))["tracking"]).state

    def post_observation(self, observation: Observation) -> httpx.Response:
        """Sends the label. Returns the response so the caller can handle 403 / 409."""
        body = observation.model_dump(by_alias=True, mode="json")
        response = self._http.post("/api/camera/observations", json=body)
        if response.status_code == 401:
            raise SignedOut("Your sign-in has expired. Run the camera agent again to sign in.")
        return response
