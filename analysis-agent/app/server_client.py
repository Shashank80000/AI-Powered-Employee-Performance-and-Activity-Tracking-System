"""httpx client for the Node server's internal API (authenticated by X-Service-Key)."""

from __future__ import annotations

from datetime import date
from typing import Any

import httpx

from app.schemas import (
    CameraEmployees,
    DailyAnalysis,
    DayData,
    ScreenshotAnalysis,
    ScreenshotList,
    ScreenshotRef,
    ScreenshotUpdate,
)


class ServerClient:
    """Typed wrapper around /api/internal/*. Image bytes are returned, never stored."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        transport: httpx.BaseTransport | None = None,
        timeout: float = 30.0,
    ) -> None:
        self._http = httpx.Client(
            base_url=base_url,
            headers={"X-Service-Key": api_key},
            transport=transport,
            timeout=timeout,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> ServerClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _json(self, response: httpx.Response) -> Any:
        response.raise_for_status()
        return response.json()

    def list_pending(self, day: date) -> list[ScreenshotRef]:
        """Pending screenshots captured on ``day``."""
        params = {"date": day.isoformat(), "status": "pending"}
        data = self._json(self._http.get("/api/internal/screenshots", params=params))
        return ScreenshotList.model_validate(data).screenshots

    def fetch_image(self, screenshot_id: str) -> bytes:
        """Raw JPEG bytes, kept in memory only."""
        response = self._http.get(f"/api/internal/screenshots/{screenshot_id}/image")
        response.raise_for_status()
        return response.content

    def _patch(self, screenshot_id: str, update: ScreenshotUpdate) -> None:
        body = update.model_dump(by_alias=True, mode="json", exclude_none=True)
        self._json(self._http.patch(f"/api/internal/screenshots/{screenshot_id}", json=body))

    def report_analysis(self, screenshot_id: str, analysis: ScreenshotAnalysis) -> None:
        """Mark analyzed; the server stores the label (the image is kept until retention ends)."""
        self._patch(screenshot_id, ScreenshotUpdate(status="analyzed", analysis=analysis))

    def report_failure(self, screenshot_id: str) -> None:
        self._patch(screenshot_id, ScreenshotUpdate(status="failed"))

    def get_day(self, employee_id: str, day: date) -> DayData:
        data = self._json(
            self._http.get(f"/api/internal/day/{employee_id}", params={"date": day.isoformat()})
        )
        return DayData.model_validate(data)

    def list_camera_employees(self, day: date) -> list[str]:
        """Employees with camera observations on ``day`` (they may have no screenshots)."""
        params = {"date": day.isoformat()}
        data = self._json(self._http.get("/api/internal/camera/employees", params=params))
        return CameraEmployees.model_validate(data).employee_ids

    def put_daily_analysis(self, analysis: DailyAnalysis) -> dict[str, Any]:
        body = analysis.model_dump(by_alias=True, mode="json")
        data = self._json(self._http.put("/api/internal/daily-analyses", json=body))
        return data.get("dailyAnalysis", {})
