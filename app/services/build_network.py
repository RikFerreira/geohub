"""Network building pipeline."""

import csv
import io
import json
import logging
import re
import shutil
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

import geopandas as gpd
import pandas as pd
from arcgis.gis import GIS, ItemProperties, ItemTypeEnum

from app import config

log = logging.getLogger(__name__)

GROUP_ID = "c9eb1e35ee3443e7a1143d96d20aab78"

# geocodigo -> UTM EPSG. Read once at import; the file is 5571 static rows.
with (Path(__file__).resolve().parent.parent / "data" / "utmzones_municipality.csv").open(
    encoding="utf-8", newline=""
) as _zones:
    UTM_ZONES = {row["geocodigo"]: int(row["utmepsg"]) for row in csv.DictReader(_zones)}

WATER_POINTS = ["Label", "Status do Ativo", "X", "Y"]
WATER_LINES = ["Label", "Status do Ativo", "Diâmetro_Comercial", "geometry"]
SEWER_POINTS = ["Label", "ACAO_FICHA_TPF", "X", "Y"]
SEWER_LINES = ["Label", "ACAO_FICHA_TPF", "Diameter", "geometry"]

# One map for both networks; rename ignores keys a sheet does not have.
RENAMES = {
    "Label": "label",
    "Status do Ativo": "acao",
    "ACAO_FICHA_TPF": "acao",
    "Diâmetro_Comercial": "diametro",
    "Diameter": "diametro",
}

TANK_TYPES = {
    "Apoiado": "Reservatórios apoiados",
    "Elevado": "Reservatórios elevados",
    "Semienterrado": "Reservatórios semienterrados",
}


def _token():
    """Trade the configured credentials for a token. Valid ~2h; not cached."""
    body = urllib.parse.urlencode(
        {
            "username": config.ARCGIS_USERNAME,
            "password": config.ARCGIS_PASSWORD,
            "referer": config.ARCGIS_URL,
            "f": "json",
        }
    ).encode()
    with urllib.request.urlopen(f"{config.ARCGIS_URL}/sharing/rest/generateToken", body) as response:
        got = json.load(response)
    if "token" not in got:
        # ArcGIS answers 200 with an error body, so this is the only failure signal
        log.error("ArcGIS login failed: %s", got)
        raise RuntimeError(f"ArcGIS login failed: {got}")
    return got["token"]


def _keys(obj):
    """Sorted keys of a mapping, or the type name for anything else."""
    return sorted(obj) if isinstance(obj, dict) else type(obj).__name__


def check(submission):
    """Validate the submission shape. Returns (attributes, submission).

    Raises ValueError on a bad body — the router turns that into a 400.
    """
    try:
        fields = submission["feature"]["attributes"]
    except (KeyError, TypeError) as bad:
        # the keys are the whole diagnosis: they say what the sender did post
        log.warning(
            "rejected submission: no feature.attributes (%s); top-level keys=%s, feature keys=%s",
            bad,
            _keys(submission),
            _keys(submission.get("feature") if isinstance(submission, dict) else None),
        )
        raise ValueError("expected feature.attributes in the body") from bad
    if not isinstance(fields, dict):
        log.warning("rejected submission: feature.attributes is %s", type(fields).__name__)
        raise ValueError("feature.attributes must be an object")
    # ponytail: shape only. The field_2 and municipality rules the router
    # docstring mentions are not implemented — I don't know them yet.
    return fields, submission


def _column(df, axis):
    """The column named exactly for this axis, ignoring 'X Coordinate'-style neighbours."""
    return next((c for c in df.columns if axis in str(c).split()), None)


def _build_links(full_sheet, crs):
    full_sheet = {k: v for k, v in full_sheet.items() if k != "Grid"}  # decoy X/Y cols

    # nodes = every sheet with whole-word X/Y; links = every sheet with Start/Stop Node
    def _nodes(df):
        cx, cy = _column(df, "X"), _column(df, "Y")  # Wet Well uses 'X'/'Y'
        return df[["Element", cx, cy]].rename(columns={cx: "X", cy: "Y"})

    nodes = pd.concat(
        _nodes(df) for df in full_sheet.values()
        if _column(df, "X") and _column(df, "Y") and "Element" in df.columns
    )
    xy = nodes.drop_duplicates("Element").set_index("Element")[["X", "Y"]].apply(tuple, axis=1)

    def _geom(df):
        s = df["Start Node"].map(xy)
        e = df["Stop Node"].map(xy)
        return gpd.GeoSeries.from_wkt([
            f"LINESTRING({a[0]} {a[1]}, {b[0]} {b[1]})"
            if isinstance(a, tuple) and isinstance(b, tuple) else None
            for a, b in zip(s, e)  # ponytail: unmatched ends -> None geom, row kept
        ], index=df.index)

    nodes = gpd.GeoDataFrame(
        nodes, geometry=gpd.points_from_xy(nodes["X"], nodes["Y"]), crs=crs
    )
    # links kept per-sheet so read_water/read_sewer filter on their own structure
    links = {
        name: gpd.GeoDataFrame(df, geometry=_geom(df), crs=crs)
        for name, df in full_sheet.items()
        if {"Start Node", "Stop Node"} <= set(df.columns)
    }
    return nodes, links


def _active(full_sheet, sheet):
    return full_sheet[sheet][full_sheet[sheet]["Is Active?"]]


def read_water(full_sheet, crs):
    """Split the water workbook into (point structures, line structures)."""
    tank = _active(full_sheet, "Tank")
    tanks = (
        tank.loc[:, WATER_POINTS]
        .assign(tipo_est=tank["Tipo de Reservatório"].map(TANK_TYPES))
        .dropna(subset=["tipo_est"])
    )

    reservoir = _active(full_sheet, "Reservoir")
    eta = reservoir.loc[
        reservoir["Label"].str.contains("ETA", case=False, na=False), WATER_POINTS
    ].assign(tipo_est="Estações de tratamento de água")

    eea = _active(full_sheet, "Pump").loc[:, WATER_POINTS].assign(
        tipo_est="Estações elevatórias de água"
    )
    vrps = _active(full_sheet, "PRV").loc[:, WATER_POINTS].assign(
        tipo_est="Válvula redutora de pressão"
    )

    points = pd.concat([tanks, eta, eea, vrps])
    points = gpd.GeoDataFrame(
        points, geometry=gpd.points_from_xy(points["X"], points["Y"]), crs=crs
    )

    pipes = _build_links(full_sheet, crs)[1]["Pipe"]
    pipes = pipes[pipes["Is Active?"]]
    lines = pd.concat(
        pipes.loc[pipes["Classe Macro"] == macro, WATER_LINES].assign(tipo_est=tipo)
        for macro, tipo in (
            ("Adução", "Adutoras"),
            ("Distribuição", "Rede de abastecimento de água"),
        )
    )

    return [
        points.rename(columns=RENAMES).drop(columns=["X", "Y"]).reset_index(drop=True),
        lines.rename(columns=RENAMES).reset_index(drop=True),
    ]


def read_sewer(full_sheet, crs):
    """Split the sewer workbook into (point structures, line structures)."""
    # ponytail: Wet Well is read unfiltered — every other sheet filters on
    # 'Is Active?'. Confirm the sheet has no such column before relying on this.
    eee = full_sheet["Wet Well"].loc[:, SEWER_POINTS].assign(
        tipo_est="Estações elevatórias de esgoto"
    )

    manhole = _active(full_sheet, "Manhole")
    ete = manhole.loc[
        manhole["Label"].str.contains("ETE", case=False, na=False), SEWER_POINTS
    ].assign(tipo_est="Estações de tratamento de esgoto")

    corpo_receptor = _active(full_sheet, "Outfall").loc[:, SEWER_POINTS].assign(
        tipo_est="Corpo receptor"
    )

    points = pd.concat([eee, ete, corpo_receptor])
    points = gpd.GeoDataFrame(
        points, geometry=gpd.points_from_xy(points["X"], points["Y"]), crs=crs
    ).drop(columns=["X", "Y"])

    links = _build_links(full_sheet, crs)[1]
    conduit = links["Conduit"]
    lines = pd.concat([
        links["Pressure Pipe"].loc[:, SEWER_LINES].assign(tipo_est="Linha de recalque"),
        *(
            conduit.loc[conduit["Label"].str.contains(pattern, na=False), SEWER_LINES]
            .assign(tipo_est=tipo)
            for pattern, tipo in (
                (r"^EF", "Emissário final"),
                (r"^INT", "Interceptor"),
                (r"^SB", "Rede de coleta de esgoto"),
            )
        ),
    ])

    return [
        points.rename(columns=RENAMES).reset_index(drop=True),
        lines.rename(columns=RENAMES).reset_index(drop=True),
    ]


READERS = {"SAA": read_water, "SES": read_sewer}


def _publish(points, lines, title, gis):
    """Publish both layers as one hosted feature service, shared to the group.

    A file geodatabase is the carrier because it is the format that survives
    the round trip with two layers and untruncated field names.
    """
    service = re.sub(r"\W+", "_", title)  # AGOL service names take no spaces
    with tempfile.TemporaryDirectory() as tmp:
        gdb = Path(tmp) / f"{service}.gdb"
        points.to_file(gdb, driver="OpenFileGDB", layer="sab_estruturas_p")
        lines.to_file(gdb, driver="OpenFileGDB", layer="sab_estruturas_l", mode="a")
        archive = shutil.make_archive(str(Path(tmp) / service), "zip", tmp, gdb.name)
        source = (
            gis.content.folders.get()  # the signed-in user's root folder
            .add(
                ItemProperties(
                    title=title,
                    item_type=ItemTypeEnum.FILE_GEODATABASE.value,
                    tags="build_network",
                ),
                file=archive,
            )
            .result()
        )

    # ponytail: the uploaded .gdb item is kept as the service's source data.
    # source.delete() here if the org should only hold the published service.
    item = source.publish(publish_parameters={"name": service}, file_type="fileGeodatabase")
    item.share(groups=[GROUP_ID])
    return {"title": item.title, "id": item.id, "url": item.url}


def run(submission):
    """Parse the submission's spreadsheet; publish it as hosted feature layers."""
    attributes = submission["feature"]["attributes"]
    tipo_rede = attributes["tipo_rede"]
    reader = READERS.get(tipo_rede)
    if reader is None:
        log.error("unknown tipo_rede %r; expected one of %s", tipo_rede, sorted(READERS))
        raise ValueError(f"unknown tipo_rede: {tipo_rede!r}")

    # nome_mun carries the geocodigo, not the name — the domain's value column
    municipality = str(attributes["nome_mun"])
    if municipality not in UTM_ZONES:
        log.error("no UTM zone for nome_mun %r — is it a geocodigo?", municipality)
        raise ValueError(f"no UTM zone for municipality {municipality!r}")
    crs = UTM_ZONES[municipality]

    attachment = submission["feature"]["attachments"]["file_xlsx"][0]
    separator = "&" if "?" in attachment["url"] else "?"
    with urllib.request.urlopen(f"{attachment['url']}{separator}token={_token()}") as response:
        workbook = io.BytesIO(response.read())  # openpyxl seeks, so buffer the stream

    full_sheet = pd.read_excel(workbook, sheet_name=None, decimal=",", thousands=".")
    points, lines = reader(full_sheet, crs)

    stamp = {
        "nome_mun": municipality,
        "tipo_rede": tipo_rede,
        "alternativa": attributes["alternativa"],
    }
    gis = GIS(config.ARCGIS_URL, config.ARCGIS_USERNAME, config.ARCGIS_PASSWORD)
    # local time, so the prefix reads as the submission's own clock
    when = datetime.now().strftime("%Y%m%d%H%M%S")
    title = f"{when}_{municipality}_{tipo_rede}_{attributes['alternativa']}"
    return [_publish(points.assign(**stamp), lines.assign(**stamp), title, gis)]
