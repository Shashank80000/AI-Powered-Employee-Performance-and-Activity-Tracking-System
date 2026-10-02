"""FastAPI application entry point.

Run with: uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI

from app.routes.ai_routes import router as ai_router
from app.schemas import HealthResponse

SERVICE_NAME = "ai-service"

app = FastAPI(
    title="WorkPlus AI Service",
    description=(
        "Productivity scoring, trend analysis, anomaly detection and report "
        "generation over aggregated daily activity metrics only."
    ),
    version="0.1.0",
)
app.include_router(ai_router)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Liveness check used by the Node server."""
    return HealthResponse(status="ok", service=SERVICE_NAME)
