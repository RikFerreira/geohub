// Parse a WKB blob (as returned by sql.js for a geometry BLOB column) into a
// GeoJSON geometry. Handles the two shapes this model uses: Point and LineString.
// Coordinates are passed through as stored (UTM meters) — no reprojection here.
function wkbToGeometry(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = view.getUint8(0) === 1;      // byte 0: 1 = little-endian
  const type = view.getUint32(1, little);     // bytes 1-4: geometry type

  if (type === 1) {                           // Point
    return { type: "Point", coordinates: [view.getFloat64(5, little), view.getFloat64(13, little)] };
  }
  if (type === 2) {                           // LineString
    const count = view.getUint32(5, little);  // bytes 5-8: number of points
    const coordinates = [];
    let offset = 9;
    for (let i = 0; i < count; i++) {
      coordinates.push([view.getFloat64(offset, little), view.getFloat64(offset + 8, little)]);
      offset += 16;
    }
    return { type: "LineString", coordinates };
  }
  throw new Error("Unsupported WKB geometry type: " + type);
}
