import tempfile
import unicodedata
from functools import cache
from pathlib import Path

import pandas as pd
import geopandas as gpd

from app import config

GROUP_ID = "818a5ee2b139401a9face323f930f065"
DATA = Path(__file__).resolve().parent.parent / "data"

def _fold(nome):
    """Municipality name without case or accents, for matching."""
    stripped = unicodedata.normalize("NFKD", str(nome).casefold())
    return "".join(c for c in stripped if not unicodedata.combining(c)).strip()

@cache
def _utm_by_municipio():
    """{folded name: [SIRGAS 2000 UTM EPSG, ...]} for all 5571 municipalities.

    The CSV is UTF-8 (pandas' default). Reading it as latin-1 still "works"
    and silently yields 5298 names instead of 5290, because the mojibake
    folds differently — so the count is the check that the encoding is right.
    """
    table = pd.read_csv(DATA / "utmzones_municipality.csv", usecols=["nome", "utmepsg"])
    lookup = {}
    for nome, epsg in zip(table["nome"], table["utmepsg"]):
        lookup.setdefault(_fold(nome), set()).add(int(epsg))
    return {name: sorted(codes) for name, codes in lookup.items()}

def utm_epsg(municipio):
    """SIRGAS 2000 UTM EPSG code for a municipality name.

    190 of the 5290 distinct names are shared across states with different UTM
    zones ("Capanema" is 31982 in PR and 31983 in PA), so an ambiguous name
    raises instead of guessing a zone.
    """
    codes = _utm_by_municipio().get(_fold(municipio))
    if not codes:
        raise ValueError(f"unknown municipality {municipio!r}")
    if len(codes) > 1:
        raise ValueError(f"municipality {municipio!r} spans UTM zones {codes}; needs a state")
    return codes[0]

def check(submission):
    """Validate a webhook payload without any network or file work.

    Everything here fails fast and cheap, so the webhook can answer 400
    synchronously before handing the slow download/parse/publish to a
    background task. Returns (fields, crs) for run() to reuse.
    """
    # 1: get the ArcGIS feature from the submission
    try:
        fields = submission["feature"]["attributes"]
    except (KeyError, TypeError) as missing:
        raise ValueError(f"not a Survey123 submission; got keys {sorted(submission)}") from missing
    if fields.get("field_2") not in ("WaterCAD", "SewerCAD"):
        raise ValueError(f"field_2 must be WaterCAD or SewerCAD, got {fields.get('field_2')!r}")
    return fields, utm_epsg(fields.get("munic_pio"))

def run(submission):
    """Route a Survey123 webhook POST to the WaterCAD or SewerCAD reader."""
    fields, crs = check(submission)

    # 2: get the xlsx from the feature attachment and save it to a temp file
    from arcgis.features import FeatureLayer  # deferred: seconds to import
    from arcgis.gis import GIS

    # The survey service exposes only Create,Editing to anonymous callers (no
    # Query), so attachment listing and download both 400 without a token.
    # Authenticate up front (reused for publishing below) and read the
    # attachment list straight from the webhook payload instead of querying.
    gis = GIS(config.ARCGIS_URL, config.ARCGIS_USERNAME, config.ARCGIS_PASSWORD)
    layer = FeatureLayer(f"{submission['surveyInfo']['serviceUrl']}/0", gis=gis)

    attachments = submission.get("attachmentInfos", [])
    xlsx = next((a for a in attachments if str(a["name"]).lower().endswith(".xlsx")), None)
    if xlsx is None:
        raise ValueError(f"no xlsx attached; feature carries {[a['name'] for a in attachments]}")

    with tempfile.TemporaryDirectory() as workdir:
        path = layer.attachments.download(
            oid=fields["objectid"], attachment_id=xlsx["id"], save_path=workdir
        )[0]

        # 3: pick the WaterCAD or SewerCAD routine (field_2 already vetted by check)
        reader = read_water if fields["field_2"] == "WaterCAD" else read_sewer
        points, lines = reader(path, crs)

    # 4: publish each one to the ArcGIS Online group
    from arcgis.features import GeoAccessor  # noqa: F401  registers .spatial on DataFrame

    published = []
    for gdf, kind in ((points, "pontos"), (lines, "linhas")):
        item = pd.DataFrame.spatial.from_geodataframe(gdf).spatial.to_featurelayer(
            f"{fields['field_2']}_{fields['objectid']}_{kind}", gis=gis, tags=["geohub"]
        )
        # ponytail: Item.share is deprecated in arcgis 2.x but still works.
        # Move to item.sharing.groups.add() when it actually goes away.
        item.share(groups=[GROUP_ID])
        published.append({"id": item.id, "title": item.title, "url": item.homepage})
    return published

def _build_links(full_sheet, crs):
    full_sheet = {k: v for k, v in full_sheet.items() if k != "Grid"}  # decoy X/Y cols
    col = lambda df, ax: next((c for c in df.columns if ax in str(c).split()), None)
    has = lambda df, cols: set(cols) <= set(df.columns)

    # nodes = every sheet with whole-word X/Y; links = every sheet with Start/Stop Node
    def _nodes(df):
        cx, cy = col(df, "X"), col(df, "Y")  # Wet Well uses 'X'/'Y'
        return df[["Element", cx, cy]].rename(columns={cx: "X", cy: "Y"})

    nodes = pd.concat(
        _nodes(df) for df in full_sheet.values()
        if col(df, "X") and col(df, "Y") and "Element" in df.columns
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
        for name, df in full_sheet.items() if has(df, ("Start Node", "Stop Node"))
    }
    return nodes, links

def read_water(path, crs):
    full_sheet = pd.read_excel(path, sheet_name=None, decimal = ",", thousands = ".")

    tank = full_sheet["Tank"][full_sheet["Tank"]["Is Active?"]]

    rap = (tank
        .loc[tank["Tipo de Reservatório"] == "Apoiado"]
        .loc[:, ["Label", "Status do Ativo", "X", "Y"]]
        .assign(tipo_est = "Reservatórios apoiados")
    )

    rel = (tank
        .loc[tank["Tipo de Reservatório"] == "Elevado"]
        .loc[:, ["Label", "Status do Ativo", "X", "Y"]]
        .assign(tipo_est = "Reservatórios elevados")
    )

    rse = (tank
        .loc[tank["Tipo de Reservatório"] == "Semienterrado"]
        .loc[:, ["Label", "Status do Ativo", "X", "Y"]]
        .assign(tipo_est = "Reservatórios semienterrados")
    )

    reservoir = full_sheet["Reservoir"][full_sheet["Reservoir"]["Is Active?"]]

    eta = (reservoir
        .loc[reservoir["Label"].str.contains("ETA", case=False, na=False)]
        .loc[:, ["Label", "Status do Ativo", "X", "Y"]]
        .assign(tipo_est = "Estações de tratamento de água")
    )

    pump = full_sheet["Pump"][full_sheet["Pump"]["Is Active?"]]

    eea  = (pump
        .loc[:, ["Label", "Status do Ativo", "X", "Y"]]
        .assign(tipo_est = "Estações elevatórias de água")
    )

    # pt = None     # May be in Reservoir

    prv = full_sheet["PRV"][full_sheet["PRV"]["Is Active?"]]

    vrps = (
        prv
        .loc[:, ["Label", "Status do Ativo", "X", "Y"]]
        .assign(tipo_est = "Válvula redutora de pressão")
    )

    sab_estruturas_p = pd.concat([rel, rap, rse, eta, eea, vrps])
    sab_estruturas_p = gpd.GeoDataFrame(
        sab_estruturas_p,
        geometry = gpd.points_from_xy(sab_estruturas_p["X"], sab_estruturas_p["Y"]),
        crs = crs
    )

    _, links = _build_links(full_sheet, crs)
    links = links["Pipe"]

    adutoras = (links
        .loc[links["Is Active?"] & (links["Classe Macro"] == "Adução")]
        .loc[:, ["Label", "Status do Ativo", "Diâmetro_Comercial", "geometry"]]
        .assign(tipo_est="Adutoras")
    )

    rede = (links
        .loc[links["Is Active?"] & (links["Classe Macro"] == "Distribuição")]
        .loc[:, ["Label", "Status do Ativo", "Diâmetro_Comercial", "geometry"]]
        .assign(tipo_est="Rede de abastecimento de água")
    )

    sab_estruturas_l = pd.concat([adutoras, rede])

    sab_estruturas_p = (sab_estruturas_p
        .rename(columns = {
            "Label": "label",
            "Status do Ativo": "acao",
            "Diâmetro_Comercial": "diametro"
        })
        .drop(columns = ["X", "Y"])
    )

    sab_estruturas_l = (sab_estruturas_l
        .rename(columns = {
            "Label": "label",
            "Status do Ativo": "acao",
            "Diâmetro_Comercial": "diametro"
        })
    )

    return ([sab_estruturas_p.reset_index(), sab_estruturas_l.reset_index()])

def read_sewer(path, crs):
    full_sheet = pd.read_excel(path, sheet_name=None, decimal = ",", thousands = ".")

    wet_well = full_sheet["Wet Well"]

    eee = (wet_well
        .loc[:, ["Label", "ACAO_FICHA_TPF", "X", "Y"]]
        .assign(tipo_est = "Estações elevatórias de esgoto")
    ).rename(columns = {
        "Label": "label",
        "ACAO_FICHA_TPF": "acao",
        "X": "X",
        "Y": "Y"
    })

    manhole = full_sheet["Manhole"][full_sheet["Manhole"]["Is Active?"]]

    ete = (manhole
        .loc[manhole["Label"].str.contains("ETE", case=False, na=False)]
        .loc[:, ["Label", "ACAO_FICHA_TPF", "X", "Y"]]
        .assign(tipo_est = "Estações de tratamento de esgoto")
    ).rename(columns = {
        "Label": "label",
        "ACAO_FICHA_TPF": "acao"
    })

    outfall = full_sheet["Outfall"][full_sheet["Outfall"]["Is Active?"]]

    corpo_receptor = (outfall
        .loc[:, ["Label", "ACAO_FICHA_TPF", "X", "Y"]]
        .assign(tipo_est = "Corpo receptor")
    ).rename(columns = {
        "Label": "label",
        "ACAO_FICHA_TPF": "acao"
    })

    sab_estruturas_p = pd.concat([eee, ete, corpo_receptor])
    sab_estruturas_p = gpd.GeoDataFrame(
        sab_estruturas_p,
        geometry = gpd.points_from_xy(sab_estruturas_p["X"], sab_estruturas_p["Y"]),
        crs = crs
    ).drop(columns = ["X", "Y"])

    _, links = _build_links(full_sheet, crs)
    conduit = links["Conduit"]
    pressure = links["Pressure Pipe"]

    cols = ["Label", "ACAO_FICHA_TPF", "Diameter", "geometry"]

    linha_recalque = (pressure
        .loc[:, cols]
        .assign(tipo_est = "Linha de recalque")
    )

    emissario = (conduit
        .loc[conduit["Label"].str.contains(r"^EF", na=False), cols]
        .assign(tipo_est = "Emissário final")
    )

    interceptor = (conduit
        .loc[conduit["Label"].str.contains(r"^INT", na=False), cols]
        .assign(tipo_est = "Interceptor")
    )

    rede = (conduit
        .loc[conduit["Label"].str.contains(r"^SB", na=False), cols]
        .assign(tipo_est = "Rede de coleta de esgoto")
    )

    sab_estruturas_l = pd.concat([linha_recalque, emissario, interceptor, rede])
    sab_estruturas_l = sab_estruturas_l.rename(columns = {
        "Label": "label",
        "ACAO_FICHA_TPF": "acao",
        "Diameter": "diametro"
    })

    return ([sab_estruturas_p.reset_index(), sab_estruturas_l.reset_index()])