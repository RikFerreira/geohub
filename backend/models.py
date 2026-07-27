"""Payload models for the network submission.

Shape mirrors what the frontend posts (see frontend/extract.js). Geometry is
already rebuilt client-side as GeoJSON in UTM meters — the backend does not
touch coordinates, only reads the structures and their properties.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

Network = Literal["SAA", "SES"]


class Geometry(BaseModel):
    """GeoJSON geometry. Only the two shapes the model emits: point and line."""

    type: Literal["Point", "LineString"]
    # Point: [x, y]; LineString: [[x, y], ...]. Left loose on purpose.
    coordinates: list[Any]


class Feature(BaseModel):
    type: Literal["Feature"]
    geometry: Geometry
    # includes at least "key" (structure id) and "label"; rest varies per structure
    properties: dict[str, Any]


class FeatureCollection(BaseModel):
    type: Literal["FeatureCollection"]
    features: list[Feature]


class Submission(BaseModel):
    """One extraction submitted from the form.

    Exactly one of SAA/SES is populated, matching TipoRede; the other is empty.
    Keys inside are structure ids (rel, eea, rede, ...) mapped to their features.
    """

    IdMun: str
    TipoRede: Network
    IdAlt: str
    scenarioId: int
    SAA: dict[str, FeatureCollection] = Field(default_factory=dict)
    SES: dict[str, FeatureCollection] = Field(default_factory=dict)

    def structures(self) -> dict[str, FeatureCollection]:
        """The populated network's structures, whichever it is."""
        return self.SAA if self.TipoRede == "SAA" else self.SES
