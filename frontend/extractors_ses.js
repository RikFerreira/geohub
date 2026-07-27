// SES (sewer / SewerCAD) structures. One entry per structure — edit here to
// change a query or rule; nothing else needs touching.
//
// Each entry:
//   key        identifier for the structure in the output GeoJSON.
//   network    always "SES" in this file.
//   base       element base class; the runner reads geometry from
//              <base>_HmiDataSetGeometry_Data and active state from
//              <base>_HMIActiveTopology_Data. SES: "BaseNode" (points) or "BaseLink" (lines).
//   sql        selects at least `id` (DomainElementID). Other columns become
//              feature properties. Do NOT query geometry here.
//   activeOnly optional. true = keep only elements active in the chosen scenario.
//   transform  optional. (rows) => rows, for the rare structure needing JS tweaks.
//
// Base pattern (label + not deleted + not a prototype):
//   SELECT e.DomainElementID AS id, m.Label AS label
//   FROM <ElementTable> e
//   JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
//   JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
//   WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND <your filter>

const SES_EXTRACTORS = [
  {
    key: "SES.rede", network: "SES", base: "BaseLink",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Conduit e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND m.Label LIKE 'SB%'`,
  },
  {
    key: "SES.interceptor", network: "SES", base: "BaseLink",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Conduit e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND m.Label LIKE 'INT%'`,
  },
  {
    key: "SES.emissario_final", network: "SES", base: "BaseLink",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Conduit e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND m.Label LIKE 'EF%'`,
  },
  {
    key: "SES.linha_recalque", network: "SES", base: "BaseLink",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM PressurePipe e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },
  {
    key: "SES.eee", network: "SES", base: "BaseNode",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM WetWell e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },
  {
    key: "SES.corpo_receptor", network: "SES", base: "BaseNode",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Outfall e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },
  {
    key: "SES.ete", network: "SES", base: "BaseNode",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Manhole e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND m.Label LIKE '%ETE%'`,
  },
];
