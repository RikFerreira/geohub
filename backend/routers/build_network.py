"""HTTP layer for the network building endpoint."""

import logging

from fastapi import APIRouter, Header, HTTPException, Response

from backend import config
from backend.models import Submission
from backend.services import build_network

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/build_network", tags=["build_network"])


def _authorize(token: str | None) -> None:
    """Reject the request unless it carries the shared secret. No-op if unset."""
    if config.OPENFLOWS_API_TOKEN and token != config.OPENFLOWS_API_TOKEN:
        raise HTTPException(status_code=401, detail="invalid or missing token")


@router.post("")
def submit(
    submission: Submission,
    x_api_token: str | None = Header(default=None),
) -> Response:
    """Build the network's shapefiles and return them as a zip download.

    FastAPI validates the payload against the models; a bad body is a 422 the
    sender sees. The zip holds sab_estruturas_p and sab_estruturas_l.
    """
    _authorize(x_api_token)
    archive = build_network.run(submission)
    filename = f"estruturas_{submission.TipoRede}_{submission.IdMun}.zip"
    return Response(
        content=archive,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
