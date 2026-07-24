"""Application entrypoint."""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import config
from app.routers import build_network

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

# Without this the log.exception in the background task goes nowhere: uvicorn
# configures its own loggers, not the app's.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(title=config.APP_NAME, version=config.APP_VERSION)

# The Survey123 web form posts the webhook from the browser, so the POST needs
# a preflight answered. Without this, OPTIONS returns 405 with no CORS headers
# and the form reports "NetworkError when attempting to fetch resource".
#
# ponytail: open to every origin, chosen deliberately. CORS constrains browsers,
# not curl, so this is not the thing protecting the route. Narrow to
# https://survey123.arcgis.com if that ever changes. Leave allow_credentials
# off — with it, Starlette refuses to echo "*" and the preflight breaks.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST"],
    allow_headers=["content-type"],
)

app.include_router(build_network.router)


@app.get("/health", tags=["ops"])
def health() -> dict[str, str]:
    """Liveness probe. Stays dependency-free and fast."""
    return {"status": "ok", "version": config.APP_VERSION}


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    """Serve the documentation landing page."""
    return FileResponse(STATIC_DIR / "index.html")
