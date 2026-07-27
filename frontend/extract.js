// Generic extraction runner. Written once; reads wkbToGeometry (wkb.js) and the
// per-software registries. To change what gets extracted, edit extractors_ses.js
// or extractors_saa.js — never this file.
//
// SAA (WaterCAD) and SES (SewerCAD) come from different software with different
// schemas, so their extractors live in separate files and stay conceptually apart.
const EXTRACTORS = [...SES_EXTRACTORS, ...SAA_EXTRACTORS];

// --- tiny sql.js helpers ---------------------------------------------------

// Run a query, return rows as an array of {column: value} objects.
function query(db, sql) {
  const result = db.exec(sql);
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

// Run a query, return the first row's first column (or null).
function queryOne(db, sql) {
  const rows = query(db, sql);
  return rows.length ? Object.values(rows[0])[0] : null;
}

// --- database + scenario listing ------------------------------------------

async function openDatabase(bytes) {
  const sqlite = await initSqlJs({ locateFile: name => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${name}` });
  return new sqlite.Database(bytes);
}

// [{ id, label }] for the scenario dropdown.
function listScenarios(db) {
  return query(db, `
    SELECT s.ScenarioID AS id, m.Label AS label
    FROM HMIScenario s
    JOIN HMIModelingElement m ON m.ElementID = s.ScenarioID
    WHERE s.IsDeleted = 0
    ORDER BY s.ScenarioID
  `).map(r => ({ id: r.id, label: `(${r.id}) ${r.label}` }));
}

// --- alternative resolution (see plan: geometry = type 1, active = type 3) --

function resolveAlternative(db, scenarioId, typeId) {
  return queryOne(db, `SELECT AlternativeID FROM HMIScenarioAlternative
                       WHERE ScenarioID = ${scenarioId} AND AlternativeTypeID = ${typeId}`);
}

// Map of DomainElementID -> geometry blob for one element base class.
// Geometry lives in <base>_HmiDataSetGeometry_Data (e.g. BaseLink, BaseNode,
// BaseIdahoNode, BaseDirectedNode). WKB type (point/line) is read from the blob.
function loadGeometry(db, base, geomAlt) {
  const map = new Map();
  for (const r of query(db, `SELECT DomainElementID AS id, HMIGeometry AS blob
                             FROM ${base}_HmiDataSetGeometry_Data WHERE AlternativeID = ${geomAlt}`)) {
    if (r.blob) map.set(r.id, r.blob);
  }
  return map;
}

// Set of active DomainElementIDs for one base class (for activeOnly extractors).
function loadActiveIds(db, base, activeAlt) {
  const ids = new Set();
  for (const r of query(db, `SELECT DomainElementID AS id FROM ${base}_HMIActiveTopology_Data
                             WHERE AlternativeID = ${activeAlt} AND HMIActiveTopologyIsActive = 1`)) {
    ids.add(r.id);
  }
  return ids;
}

// --- the extraction --------------------------------------------------------

// Returns { "SES.rede": <FeatureCollection>, ... } for the chosen scenario + network.
function extractNetwork(db, scenarioId, network) {
  const geomAlt = resolveAlternative(db, scenarioId, 1);
  const activeAlt = resolveAlternative(db, scenarioId, 3);

  // geometry + active sets loaded once per base class, reused across extractors.
  const geometryCache = {};
  const activeCache = {};
  function geometryFor(base) {
    if (!geometryCache[base]) geometryCache[base] = loadGeometry(db, base, geomAlt);
    return geometryCache[base];
  }
  function activeFor(base) {
    if (!activeCache[base]) activeCache[base] = loadActiveIds(db, base, activeAlt);
    return activeCache[base];
  }

  const output = {};
  for (const extractor of EXTRACTORS) {
    if (extractor.network !== network) continue;

    let rows = query(db, extractor.sql);
    if (extractor.activeOnly) rows = rows.filter(r => activeFor(extractor.base).has(r.id));
    if (extractor.transform) rows = extractor.transform(rows);

    const geometry = geometryFor(extractor.base);
    const features = [];
    for (const row of rows) {
      const blob = geometry.get(row.id);
      if (!blob) continue;  // element with no geometry in this scenario — skip
      features.push({
        type: "Feature",
        geometry: wkbToGeometry(blob),
        properties: { key: extractor.key, ...row },
      });
    }
    output[extractor.key] = { type: "FeatureCollection", features };
  }
  return output;
}

// --- backend call ----------------------------------------------------------

const API_URL = "/api/v1/build_network";  // served by the same backend (monolith)
const API_TOKEN = "changeme";  // must match OPENFLOWS_API_TOKEN on the backend

// Posts the payload; the backend answers with a zip of the two shapefiles.
// Returns { blob, filename } for the caller to download.
async function postResult(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Token": API_TOKEN },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  return { blob: await res.blob(), filename: match ? match[1] : "estruturas.zip" };
}
