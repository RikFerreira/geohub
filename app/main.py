"""Application entrypoint."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from app import config

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title=config.APP_NAME, version=config.APP_VERSION)


@app.get("/health", tags=["ops"])
def health() -> dict[str, str]:
    """Liveness probe. Stays dependency-free and fast."""
    return {"status": "ok", "version": config.APP_VERSION}


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    """Serve the documentation landing page."""
    return FileResponse(STATIC_DIR / "index.html")
