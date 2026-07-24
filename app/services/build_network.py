"""Survey123 submission to a published ArcGIS Online feature layer."""

from typing import Any, Literal

# ponytail: alias, not an import. Swap Any for pandas.DataFrame once that
# dependency lands.
DataFrame = Any

# An ArcGIS feature as the webhook posts it: {"attributes": {...},
# "geometry": {...}}. Not the arcgis package's Feature class — nothing here
# holds a live connection, so read_attachment has to authenticate on its own.
Feature = dict[str, Any]

Routine = Literal["watercad", "sewercad"]


def main(submission: dict[str, Any]) -> dict[str, Any]:
    # 1: Get ArcGIS feature from submission (step 2a comes free with it —
    #    get_feature already returns the form answers under "attributes")
    # 2b: Read the XLSX attachment of the feature as a list of pandas DataFrames
    # 3: Check if it should trigger the routine for WaterCAD or SewerCAD
    # 4: Create a new FeatureLayer in an existing ArcGIS Online group
    feature = get_feature(submission)
    tables = read_attachment(service_url(submission), feature["attributes"]["objectid"])
    routine = select_routine(feature["attributes"])
    return publish_feature_layer(routine, tables)


def get_feature(submission: dict[str, Any]) -> Feature:
    """Locate the ArcGIS feature a webhook submission refers to.

    Survey123 posts the feature inline, so no service call is needed here.
    The service URL and object id that step 2b needs are validated too, so a
    malformed payload fails once, here, with a message naming the missing key
    — rather than as a KeyError three calls deeper.

    Args:
        submission: Decoded Survey123 webhook payload.

    Returns:
        The feature the form submission created, carrying "attributes" and,
        when the form captured a location, "geometry".

    Raises:
        ValueError: The payload is missing a field the pipeline needs.
    """
    feature = _require(submission, "feature", dict, "payload")
    attributes = _require(feature, "attributes", dict, "feature")
    _require(attributes, "objectid", int, "feature.attributes")
    _require(
        _require(submission, "surveyInfo", dict, "payload"),
        "serviceUrl",
        str,
        "surveyInfo",
    )
    return feature


def _require(source: dict[str, Any], key: str, kind: type, where: str) -> Any:
    """Fetch a required key, or explain what the payload held instead."""
    value = source.get(key)
    if not isinstance(value, kind) or isinstance(value, bool):
        raise ValueError(
            f"{where}.{key} must be {kind.__name__}, got {type(value).__name__}; "
            f"{where} keys: {sorted(source)}"
        )
    return value


def service_url(submission: dict[str, Any]) -> str:
    """Feature service the submission was written to."""
    return submission["surveyInfo"]["serviceUrl"]


def read_attachment(service_url: str, object_id: int) -> list[DataFrame]:
    """Download the feature's XLSX attachment and parse its sheets.

    The webhook payload does not carry attachment locations, so this queries
    the service for them (`queryAttachments` on the layer) before downloading.

    Args:
        service_url: Feature service URL, from `surveyInfo.serviceUrl`.
        object_id: Object id of the feature holding the attachment.

    Returns:
        One DataFrame per worksheet, in workbook order.
    """
    raise NotImplementedError


def select_routine(fields: dict[str, Any]) -> Routine:
    """Decide which hydraulic model the submission targets.

    Args:
        fields: Form answers, as returned by `read_fields`.

    Returns:
        Either "watercad" or "sewercad".
    """
    raise NotImplementedError


def publish_feature_layer(routine: Routine, tables: list[DataFrame]) -> dict[str, Any]:
    """Build the network and publish it to the ArcGIS Online group.

    Args:
        routine: Model selected by `select_routine`.
        tables: Worksheets, as returned by `read_attachment`.

    Returns:
        Details of the published layer, echoed back to the webhook caller.
    """
    raise NotImplementedError


if __name__ == "__main__":
    # ponytail: self-check for get_feature, run with `python -m app.services.build_network`.
    # Delete once a real payload fixture exists.
    valid = {
        "eventType": "addData",
        "surveyInfo": {"serviceUrl": "https://services.arcgis.com/x/FeatureServer"},
        "feature": {
            "attributes": {"objectid": 7, "globalid": "{A-B}", "tipo": "agua"},
            "geometry": {"x": -46.6, "y": -23.5, "spatialReference": {"wkid": 4326}},
        },
    }
    assert get_feature(valid) == valid["feature"]
    assert service_url(valid).endswith("FeatureServer")

    def without(path: str) -> dict[str, Any]:
        """Copy the valid payload with one nested key removed."""
        import copy

        broken = copy.deepcopy(valid)
        *parents, leaf = path.split(".")
        target = broken
        for parent in parents:
            target = target[parent]
        del target[leaf]
        return broken

    for path in ("feature", "feature.attributes", "feature.attributes.objectid",
                 "surveyInfo", "surveyInfo.serviceUrl"):
        try:
            get_feature(without(path))
        except ValueError as error:
            assert path.split(".")[-1] in str(error), error
        else:
            raise AssertionError(f"should have rejected a payload missing {path}")

    # objectid must be a real int, not a bool or a numeric string
    for wrong in (True, "7", 7.0, None):
        broken = {**valid, "feature": {"attributes": {"objectid": wrong}}}
        try:
            get_feature(broken)
        except ValueError:
            pass
        else:
            raise AssertionError(f"should have rejected objectid={wrong!r}")

    print("get_feature ok")
