// Generic extraction runner. Written once; reads wkbToGeometry (wkb.js) and the
// per-software registries. To change what gets extracted, edit extractors_ses.js
// or extractors_saa.js — never this file.
//
// SAA (WaterCAD) and SES (SewerCAD) come from different software with different
// schemas, so their extractors live in separate files and stay conceptually apart.
const EXTRACTORS = [...SES_EXTRACTORS, ...SAA_EXTRACTORS];

// "table|column" -> tipo_est of the structure that takes every element of that
// group when the discriminator column is missing (its defaultWhenMissing entry).
// Used to name the fallback type in the warning shown on the sibling structures.
const DEFAULT_STRUCTURE = {};
for (const e of EXTRACTORS) {
  if (e.discriminator && e.defaultWhenMissing) {
    DEFAULT_STRUCTURE[`${e.discriminator.table}|${e.discriminator.column}`] = e.tipo_est;
  }
}

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

// --- Ação/Situação (raw code) ---------------------------------------------
// The "action" is the user-defined `Situacao` field. We emit the raw integer code
// as stored — the legend is not applied here, on purpose. The field lives in the
// element's <ElementTable>_HMIUserDefinedExtensions_Data, keyed per alternative, so
// GROUP BY the element id and take any non-null value. SAA stores it as "Situacao",
// SES as lowercase "situacao"; findColumn is case-sensitive, so list both.
const ACAO_COLUMNS = ["Situacao", "situacao"];

// First name from `candidates` that exists in `table`, or null (also null when
// the table itself is missing).
function findColumn(db, table, candidates) {
  let cols;
  try { cols = query(db, `PRAGMA table_info("${table}")`).map(r => r.name); }
  catch { return null; }
  return candidates.find(c => cols.includes(c)) || null;
}

// Map of DomainElementID -> raw action code for one element table (empty when
// the table or the field is absent).
function loadAcao(db, elementTable) {
  const extTable = `${elementTable}_HMIUserDefinedExtensions_Data`;
  const col = findColumn(db, extTable, ACAO_COLUMNS);
  const map = new Map();
  if (!col) return map;
  for (const r of query(db, `SELECT DomainElementID AS id, "${col}" AS acao
                             FROM "${extTable}" WHERE "${col}" IS NOT NULL
                             GROUP BY DomainElementID`)) {
    map.set(r.id, r.acao);
  }
  return map;
}

// --- diameter (lines) ------------------------------------------------------
// diam_com: commercial diameter, a user field in mm (Brazilian text like "75,0"),
// often missing per-row or per-model. diam_fis: physical diameter in feet, from
// the element's *_Physical_Data. The backend picks commercial first, else physical.
// Both looked up resiliently (missing table/column -> no value), since the
// commercial column is absent in some models and would otherwise break the query.
const DIAM_COM_COLUMNS = ["Diâmetro_Comercial", "Diametro_Comercial", "DIAMETRO_COMERCIAL"];
const PHYS_DIAM = {
  IdahoPipe:    ["IdahoPipe_Physical_Data", "Physical_PipeDiameter"],
  Conduit:      ["Conduit_Physical_Data", "ConduitDiameter"],
  PressurePipe: ["PressurePipe_Physical_Data", "Physical_PipeDiameter"],
};

// Map of DomainElementID -> { diam_com, diam_fis } for one element table (empty
// map for element types with no pipe diameter, e.g. nodes).
function loadDiameter(db, elementTable) {
  const map = new Map();
  const phys = PHYS_DIAM[elementTable];
  if (phys) {
    const [table, col] = phys;
    try {
      for (const r of query(db, `SELECT DomainElementID AS id, MAX("${col}") AS v
                                 FROM "${table}" GROUP BY DomainElementID`)) {
        if (r.v != null) map.set(r.id, { diam_com: null, diam_fis: r.v });
      }
    } catch { /* no physical table -> leave physical unset */ }
  }
  const extTable = `${elementTable}_HMIUserDefinedExtensions_Data`;
  const comCol = findColumn(db, extTable, DIAM_COM_COLUMNS);
  if (comCol) {
    for (const r of query(db, `SELECT DomainElementID AS id, MAX("${comCol}") AS v
                               FROM "${extTable}" WHERE "${comCol}" IS NOT NULL AND "${comCol}" <> ''
                               GROUP BY DomainElementID`)) {
      const entry = map.get(r.id) || { diam_com: null, diam_fis: null };
      entry.diam_com = r.v;
      map.set(r.id, entry);
    }
  }
  return map;
}

// --- the extraction --------------------------------------------------------

// Returns { output, summary } for the chosen scenario + network.
//   output  { "SES.rede": <FeatureCollection>, ... }
//   summary [ { key, esperado, count, error }, ... ] — one per structure, for the UI.
function extractNetwork(db, scenarioId, network) {
  const geomAlt = resolveAlternative(db, scenarioId, 1);
  const activeAlt = resolveAlternative(db, scenarioId, 3);

  // geometry + active sets loaded once per base class, reused across extractors.
  const geometryCache = {};
  const activeCache = {};
  const acaoCache = {};
  const diameterCache = {};
  function geometryFor(base) {
    if (!geometryCache[base]) geometryCache[base] = loadGeometry(db, base, geomAlt);
    return geometryCache[base];
  }
  function activeFor(base) {
    if (!activeCache[base]) activeCache[base] = loadActiveIds(db, base, activeAlt);
    return activeCache[base];
  }
  function acaoFor(elementTable) {
    if (!(elementTable in acaoCache)) acaoCache[elementTable] = loadAcao(db, elementTable);
    return acaoCache[elementTable];
  }
  function diameterFor(elementTable) {
    if (!(elementTable in diameterCache)) diameterCache[elementTable] = loadDiameter(db, elementTable);
    return diameterCache[elementTable];
  }

  const output = {};
  const summary = [];
  for (const extractor of EXTRACTORS) {
    if (extractor.network !== network) continue;

    // Each extractor is isolated. A broken query is recorded as an error and left
    // with an empty collection so every other structure still comes through.
    try {
      // Discriminator fallback: if the classifying column is absent from this model,
      // the element's default structure takes every element of that type (+ warning),
      // and the element's other structures come back empty (+ warning).
      let warning = null;
      let sql = extractor.sql;
      if (extractor.discriminator &&
          !findColumn(db, extractor.discriminator.table, [extractor.discriminator.column])) {
        const col = extractor.discriminator.column;
        if (extractor.defaultWhenMissing) {
          sql = extractor.fallbackSql;
          warning = `Campo '${col}' ausente no modelo — todas as feições foram classificadas como '${extractor.tipo_est}'.`;
        } else {
          sql = null;  // structure stays empty
          const def = DEFAULT_STRUCTURE[`${extractor.discriminator.table}|${col}`];
          warning = def
            ? `Campo '${col}' ausente no modelo — feições classificadas como ${def}; esta estrutura ficou vazia.`
            : `Campo '${col}' ausente no modelo — esta estrutura ficou vazia.`;
        }
      }

      let rows = sql ? query(db, sql) : [];
      if (extractor.activeOnly) rows = rows.filter(r => activeFor(extractor.base).has(r.id));
      if (extractor.transform) rows = extractor.transform(rows);

      // Element table(s) for the Situação/diameter lookups = the FROM table(s)
      // aliased `e`. `elementTables` lets a structure span more than one table.
      const elementTables = extractor.elementTables ||
        [extractor.elementTable || (/FROM\s+(\w+)\s+e\b/i.exec(extractor.sql) || [])[1]].filter(Boolean);
      const acaoMap = new Map();
      const diameterMap = new Map();
      for (const t of elementTables) {
        for (const [id, v] of acaoFor(t)) acaoMap.set(id, v);
        for (const [id, v] of diameterFor(t)) diameterMap.set(id, v);
      }

      const geometry = geometryFor(extractor.base);
      const features = [];
      for (const row of rows) {
        const blob = geometry.get(row.id);
        if (!blob) continue;  // element with no geometry in this scenario — skip
        const diam = diameterMap.get(row.id) || {};
        features.push({
          type: "Feature",
          geometry: wkbToGeometry(blob),
          properties: {
            key: extractor.key,
            tipo_est: extractor.tipo_est ?? null,
            ...row,
            acao: acaoMap.has(row.id) ? acaoMap.get(row.id) : null,
            diam_com: diam.diam_com ?? null,
            diam_fis: diam.diam_fis ?? null,
          },
        });
      }
      output[extractor.key] = { type: "FeatureCollection", features };
      summary.push({ key: extractor.key, esperado: extractor.esperado, count: features.length, error: null, warning });
    } catch (err) {
      output[extractor.key] = { type: "FeatureCollection", features: [] };
      summary.push({ key: extractor.key, esperado: extractor.esperado, count: 0, error: err.message, warning: null });
      console.warn(`Extrator ${extractor.key} falhou: ${err.message}`);
    }
  }
  return { output, summary };
}

// --- backend call ----------------------------------------------------------

const API_URL = "/api/v1/build_network";  // served by the same backend (monolith)

// Posts the payload; the backend answers with a zip of the two shapefiles.
// Returns { blob, filename } for the caller to download.
async function postResult(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  return { blob: await res.blob(), filename: match ? match[1] : "estruturas.zip" };
}
