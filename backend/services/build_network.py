"""Network building pipeline: GeoJSON in, zipped shapefiles out.

The frontend rebuilt the geometry but the source coordinates are UTM meters with
no CRS recorded. We guess the municipality's UTM zone (geocodigo -> EPSG) only to
read them correctly, then reproject to SIRGAS 2000 geographic (EPSG:4674) — the
output CRS. Both shapefiles ship as 4674.
"""

import csv
import io
import logging
import zipfile
from pathlib import Path

import shapefile  # pyshp
from pyproj import CRS, Transformer
from pyproj.enums import WktVersion

from backend.models import Submission

log = logging.getLogger(__name__)

POINTS_LAYER = "sab_estruturas_p"
LINES_LAYER = "sab_estruturas_l"

OUTPUT_EPSG = 4674  # SIRGAS 2000 geographic
OUTPUT_PRJ = CRS.from_epsg(OUTPUT_EPSG).to_wkt(WktVersion.WKT1_ESRI)

# Source models store UTM coordinates in FEET, not meters — convert before
# reprojecting. International foot; use 1200/3937 for US survey feet, or 1.0 if a
# model ever arrives already in meters.
SOURCE_UNIT_TO_M = 0.3048

# Rough continental Brazil envelope, lon/lat. Reprojected points outside it are a
# smoke signal that the source unit or zone was read wrong (Australia, etc.).
BRAZIL_BBOX = (-74.0, -34.0, -33.0, 6.0)  # lon_min, lat_min, lon_max, lat_max

DATA = Path(__file__).resolve().parent.parent / "data"

# geocodigo -> source UTM EPSG, read once. The full IBGE municipality list
# (5571 rows), each already assigned its UTM zone.
with (DATA / "utmzones_municipality.csv").open(encoding="utf-8", newline="") as _zones:
    UTM_ZONES = {row["geocodigo"]: int(row["utmepsg"]) for row in csv.DictReader(_zones)}

# dbf columns, in record order. Names are capped at 10 chars by the format.
_FIELDS = [
    ("geocodigo", 10),
    ("tipo_rede", 10),
    ("alt", 10),
    ("estrutura", 30),
    ("label", 120),
]


def _to_output(geocodigo):
    """Transformer from the municipality's UTM zone to 4674, or None if unknown.

    None means the geocodigo is off the IBGE table: we can't tell which UTM zone
    the coordinates are in, so they pass through unprojected and without a .prj.
    """
    epsg = UTM_ZONES.get(geocodigo)
    if epsg is None:
        log.warning("no UTM zone for geocodigo %s; coordinates left as-is, no .prj", geocodigo)
        return None
    return Transformer.from_crs(epsg, OUTPUT_EPSG, always_xy=True)


def _convert(x, y, transformer):
    """Feet -> meters, then meters -> output CRS (skipped when zone unknown)."""
    x, y = x * SOURCE_UNIT_TO_M, y * SOURCE_UNIT_TO_M
    if transformer is None:
        return [x, y]
    return list(transformer.transform(x, y))  # (lon, lat)


def _point(xy, transformer):
    return _convert(xy[0], xy[1], transformer)


def _line(coords, transformer):
    return [_convert(x, y, transformer) for x, y in coords]


def _outside_brazil(coord):
    lon, lat = coord
    lon_min, lat_min, lon_max, lat_max = BRAZIL_BBOX
    return not (lon_min <= lon <= lon_max and lat_min <= lat <= lat_max)


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
    """Build sab_estruturas_p and sab_estruturas_l in EPSG:4674; return a zip."""
    transformer = _to_output(submission.IdMun)
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
                points.append((record, _point(feature.geometry.coordinates, transformer)))
            else:
                lines.append((record, _line(feature.geometry.coordinates, transformer)))

    # smoke check: a correctly read submission lands inside Brazil
    if transformer is not None:
        sample = points[0][1] if points else (lines[0][1][0] if lines and lines[0][1] else None)
        if sample and _outside_brazil(sample):
            log.warning(
                "IdMun=%s: reprojected point %s is outside Brazil — wrong source unit or zone?",
                submission.IdMun,
                sample,
            )

    layers = {
        POINTS_LAYER: _write_layer(shapefile.POINT, points),
        LINES_LAYER: _write_layer(shapefile.POLYLINE, lines),
    }

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, parts in layers.items():
            for extension, data in parts.items():
                archive.writestr(f"{name}.{extension}", data)
            if transformer is not None:
                archive.writestr(f"{name}.prj", OUTPUT_PRJ)

    log.info(
        "built shapefiles for IdMun=%s %s: %d points, %d lines (EPSG:%d)",
        submission.IdMun,
        submission.TipoRede,
        len(points),
        len(lines),
        OUTPUT_EPSG,
    )
    return buffer.getvalue()
