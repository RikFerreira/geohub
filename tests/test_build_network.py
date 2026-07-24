"""Network-free guards on the webhook payload shape. Run: python -m pytest tests/"""

import json
from pathlib import Path

from app.services import build_network

PAYLOAD = json.loads((Path(__file__).parent / "fixtures" / "submission.json").read_text("utf-8"))


def test_check_returns_field2_and_crs():
    fields, crs = build_network.check(PAYLOAD)
    assert fields["field_2"] == "WaterCAD"
    assert isinstance(crs, int)  # Bragança resolves to a single UTM zone


def test_payload_carries_globalid():
    # run() queries the data layer by this globalid, so the field must be present
    fields, _ = build_network.check(PAYLOAD)
    assert fields["globalid"].startswith("{") and fields["globalid"].endswith("}")


if __name__ == "__main__":
    test_check_returns_field2_and_crs()
    test_payload_carries_globalid()
    print("ok")
