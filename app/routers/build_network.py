"""HTTP layer for the network building endpoint."""

from typing import Any

from fastapi import APIRouter

from app.services import build_network

router = APIRouter(prefix="/api/v1/build_network", tags=["build_network"])


@router.post("")
async def survey123_webhook(submission: dict[str, Any]) -> dict[str, Any]:
    """Receive a Survey123 form submission and return the derived network."""
    # ponytail: payload accepted untyped. Narrow it to a Pydantic model once a
    # real Survey123 body has been captured — guessing the schema now only
    # bakes in fields that may not exist.
    #
    # Open before this faces the internet, in order:
    #   1. The route is unauthenticated. Survey123 webhooks can send a shared
    #      secret; verify it here and return 401 otherwise.
    #   2. Body size is unbounded. Cap it.
    #   3. Attachment download runs inline, so the sender waits on it. If
    #      Survey123 starts timing out, move the work to a BackgroundTask and
    #      return 202 instead.
    return build_network.main(submission)
