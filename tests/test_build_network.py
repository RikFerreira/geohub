"""Network-free guards on the webhook payload shape. Run: python -m pytest tests/"""

import json
from pathlib import Path

from app.services import build_network

PAYLOAD = json.loads((Path(__file__).parent / "fixtures" / "submission.json").read_text("utf-8"))


def test_check_returns_field2_and_crs():
    fields, crs = build_network.check(PAYLOAD)
    assert fields["field_2"] == "WaterCAD"
    assert isinstance(crs, int)  # Bragança resolves to a single UTM zone


def test_payload_carries_the_xlsx():
    attachments = PAYLOAD.get("attachmentInfos", [])
    xlsx = next((a for a in attachments if str(a["name"]).lower().endswith(".xlsx")), None)
    assert xlsx is not None
    assert xlsx["id"] == 11


if __name__ == "__main__":
    test_check_returns_field2_and_crs()
    test_payload_carries_the_xlsx()
    print("ok")
