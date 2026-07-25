"""Domain lookups label the output columns without touching the real values."""

import sys
import types

# geopandas/arcgis are not needed to read three CSVs; stub them so the import works
for name in ("geopandas", "pandas", "arcgis"):
    sys.modules.setdefault(name, types.ModuleType(name))
_gis = types.ModuleType("arcgis.gis")
_gis.GIS = _gis.ItemProperties = _gis.ItemTypeEnum = None
sys.modules.setdefault("arcgis.gis", _gis)

from app.services import build_network as bn  # noqa: E402


def test_domains():
    assert bn.MUNICIPALITY_LABELS["1505031"] == "Novo Progresso"
    assert bn.TIPO_REDE_LABELS["SAA"].startswith("Sistema de abastecimento")

    # every municipality resolves for both purposes, so the CRS lookup and the
    # label never disagree about which geocodigos exist
    assert set(bn.UTM_ZONES) == set(bn.MUNICIPALITY_LABELS)

    # an unmapped code falls back to itself rather than blanking the column
    assert bn.ALTERNATIVA_LABELS.get("nope", "nope") == "nope"
    assert bn.TIPO_REDE_LABELS.get("XXX", "XXX") == "XXX"


if __name__ == "__main__":
    test_domains()
    print("ok")
