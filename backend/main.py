"""Application entrypoint. Serves the frontend and the API from one process."""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend import config
from backend.routers import build_network

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

# uvicorn configures its own loggers, not the app's; without this the service
# logs go nowhere.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title=config.APP_NAME, version=config.APP_VERSION)

app.include_router(build_network.router)


@app.get("/health", tags=["ops"])
def health() -> dict[str, str]:
    """Liveness probe. Stays dependency-free and fast."""
    return {"status": "ok", "version": config.APP_VERSION}


# Mounted last so /health and /api/* win. html=True serves index.html at /.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
