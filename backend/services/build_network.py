"""Network building pipeline: GeoJSON in, zipped shapefiles out.

The frontend rebuilt the geometry; here we split it into a point layer and a
line layer, stamp each row with the submission metadata, and pack both
shapefiles into one zip. Coordinates pass through untouched (UTM meters).
"""

import io
import logging
import zipfile

import shapefile  # pyshp

from backend.models import Submission

log = logging.getLogger(__name__)

POINTS_LAYER = "sab_estruturas_p"
LINES_LAYER = "sab_estruturas_l"

# dbf columns, in record order. Names are capped at 10 chars by the format.
_FIELDS = [
    ("geocodigo", 10),
    ("tipo_rede", 10),
    ("alt", 10),
    ("estrutura", 30),
    ("label", 120),
]


def _write_layer(shape_type, rows):
    """Serialize (record, coordinates) rows into in-memory .shp/.shx/.dbf bytes."""
    shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    writer = shapefile.Writer(shp=shp, shx=shx, dbf=dbf, shapeType=shape_type, autoBalance=1)
    for name, size in _FIELDS:
        writer.field(name, "C", size)
    for record, coordinates in rows:
        if shape_type == shapefile.POINT:
            writer.point(coordinates[0], coordinates[1])
        else:
            writer.line([coordinates])  # one part per line
        writer.record(*record)
    writer.close()
    return {"shp": shp.getvalue(), "shx": shx.getvalue(), "dbf": dbf.getvalue()}


def run(submission: Submission) -> bytes:
    """Build sab_estruturas_p and sab_estruturas_l; return a zip holding both."""
    points, lines = [], []
    for estrutura, collection in submission.structures().items():
        for feature in collection.features:
            record = [
                submission.IdMun,
                submission.TipoRede,
                submission.IdAlt,
                estrutura,
                str(feature.properties.get("label", "")),
            ]
            if feature.geometry.type == "Point":
                points.append((record, feature.geometry.coordinates))
            else:
                lines.append((record, feature.geometry.coordinates))

    layers = {
        POINTS_LAYER: _write_layer(shapefile.POINT, points),
        LINES_LAYER: _write_layer(shapefile.POLYLINE, lines),
    }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, parts in layers.items():
            for extension, data in parts.items():
                archive.writestr(f"{name}.{extension}", data)

    log.info(
        "built shapefiles for IdMun=%s %s: %d points, %d lines",
        submission.IdMun,
        submission.TipoRede,
        len(points),
        len(lines),
    )
    return buffer.getvalue()
