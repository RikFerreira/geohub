"""HTTP layer for the network building endpoint."""

import logging

from fastapi import APIRouter, Response

from backend.models import Submission
from backend.services import build_network

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/build_network", tags=["build_network"])


@router.post("")
def submit(submission: Submission) -> Response:
    """Build the network's shapefiles and return them as a zip download.

    FastAPI validates the payload against the models; a bad body is a 422 the
    sender sees. The zip holds sab_estruturas_p and sab_estruturas_l.
    """
    archive = build_network.run(submission)
    filename = f"estruturas_{submission.TipoRede}_{submission.IdMun}.zip"
    return Response(
        content=archive,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
