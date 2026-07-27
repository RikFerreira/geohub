"""HTTP layer for the network building endpoint."""

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.services import build_network

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/build_network", tags=["build_network"])


def _publish(submission: dict[str, Any]) -> None:
    """Run the pipeline off the request; the 202 is already sent, so log outcomes."""
    try:
        published = build_network.run(submission)
        # log.info("appended %s", published)
    except Exception:
        # the caller is long gone — a swallowed traceback here is invisible,
        # so this log line is the only record the background job failed
        log.exception("build_network failed for objectid=%s", _objectid(submission))


def _objectid(submission: dict[str, Any]) -> Any:
    """Best-effort objectid for logging; never raises."""
    try:
        return submission["feature"]["attributes"]["objectid"]
    except (KeyError, TypeError):
        return None


@router.post("", status_code=202)
async def survey123_webhook(
    submission: dict[str, Any], background: BackgroundTasks
) -> dict[str, Any]:
    """Accept a Survey123 submission; publish the network in the background.

    Validation (payload shape, field_2, municipality) runs synchronously so a
    bad payload is a 400 the sender sees. The slow work — attachment download,
    parse, two publishes — can outlast the webhook's timeout, so it runs after
    the 202.
    """
    # ponytail: payload accepted untyped. Narrow to a Pydantic model once a
    # real Survey123 body is captured. Route is still unauthenticated and the
    # body unbounded — verify a shared secret and cap size before this is public.
    try:
        fields, _ = build_network.check(submission)
    except ValueError as bad:
        log.warning("rejected submission: %s", bad)
        raise HTTPException(status_code=400, detail=str(bad)) from bad
    background.add_task(_publish, submission)
    return {"status": "accepted", "objectid": fields.get("objectid")}
