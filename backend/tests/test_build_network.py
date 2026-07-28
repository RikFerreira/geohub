"""Checks the shapefile output matches the SIG_ESTRUTURAS_2026 field contract.

Uses an unknown geocodigo so no reprojection happens (transformer is None) and
coordinates only get the feet->meter step — keeps the test independent of the
UTM-zone table.
"""

import io
import zipfile

import shapefile  # pyshp

from backend.models import Feature, FeatureCollection, Geometry, Submission
from backend.services.build_network import run


def _point(props):
    return Feature(type="Feature", geometry=Geometry(type="Point", coordinates=[100.0, 200.0]), properties=props)


def _line(props):
    return Feature(
        type="Feature",
        geometry=Geometry(type="LineString", coordinates=[[0.0, 0.0], [10.0, 10.0]]),
        properties=props,
    )


def _read(zip_bytes, layer):
    z = zipfile.ZipFile(io.BytesIO(zip_bytes))
    reader = shapefile.Reader(
        shp=io.BytesIO(z.read(f"{layer}.shp")),
        shx=io.BytesIO(z.read(f"{layer}.shx")),
        dbf=io.BytesIO(z.read(f"{layer}.dbf")),
    )
    fields = [f[0] for f in reader.fields[1:]]  # drop DeletionFlag
    return fields, reader.records()


def _submission():
    return Submission(
        IdMun="0000000",  # not in the UTM table -> transformer None
        TipoRede="SAA",
        IdAlt="0",
        scenarioId=1,
        SAA={
            "rel": FeatureCollection(
                type="FeatureCollection",
                features=[_point({"tipo_est": "Reservatórios elevados", "acao": 2, "label": "REL001"})],
            ),
            "rede": FeatureCollection(
                type="FeatureCollection",
                features=[_line({"tipo_est": "Rede de distribuição", "acao": 0, "label": "SB1", "diam_com": "75,0"})],
            ),
            "adutora": FeatureCollection(
                type="FeatureCollection",
                features=[
                    _line({"tipo_est": "Adutora", "label": "AD1", "diam_fis": 1.0}),  # 1 ft -> 305 mm
                    # commercial 0 is an unset placeholder: must fall back to physical
                    _line({"tipo_est": "Adutora", "label": "AD2", "diam_com": 0, "diam_fis": 0.49212598425}),
                ],
            ),
        },
    )


def test_point_layer_matches_contract():
    fields, records = _read(run(_submission()), "sab_estruturas_p")
    assert fields == ["tipo_rede", "tipo_est", "nome_alt", "geocodigo", "acao", "label"]
    rec = records[0]
    assert rec["tipo_rede"] == "SAA"
    assert rec["tipo_est"] == "Reservatórios elevados"
    assert rec["nome_alt"] == "Cenário atual"  # IdAlt "0" mapped
    assert rec["geocodigo"] == "0000000"
    assert rec["acao"] == "2"  # raw code, as text
    assert rec["label"] == "REL001"


def test_line_layer_has_diametro_and_conversions():
    fields, records = _read(run(_submission()), "sab_estruturas_l")
    assert fields == ["tipo_rede", "tipo_est", "nome_alt", "geocodigo", "acao", "label", "diametro"]
    by_label = {r["label"]: r for r in records}
    assert by_label["SB1"]["diametro"] == 75  # commercial "75,0"
    assert by_label["AD1"]["diametro"] == 305  # physical 1 ft * 304.8, rounded
    assert by_label["AD2"]["diametro"] == 150  # commercial 0 ignored -> physical 0.492 ft
