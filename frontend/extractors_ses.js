// SES (sewer / SewerGEMS) structures. Discrimination is by user-defined enum field,
// read from the model; field names + enum codes match the standard seed model
// (seeds/models/SES/SES.stsw.sqlite). See frontend/docs/requisitos.md.
//
// A discriminator extractor carries:
//   sql                enum-filtered query (normal case).
//   fallbackSql        same query WITHOUT the discriminator filter — run only when the
//                      column is absent AND this is the element's default structure.
//   discriminator      { table, column }, tested with findColumn to detect absence.
//   defaultWhenMissing true  = when the column is absent, every element of this type
//                              collapses here (+ warning);
//                      false = the structure comes back empty (+ warning).
// Element-type-only structures (EEE) omit discriminator and behave as before.
//
// Enum codes (decoded from the seed):
//   Conduit      TIPO_REDE    : 0 Rede coletora / 2 Emissário final / 3 Interceptor
//   PressurePipe TIPO_REDE    : 1 Linha de recalque
//   Manhole/Outfall TIPO_DESTINO : 1 ETE / 0 Corpo receptor
// (Lateral also carries TIPO_REDE but is absent in the seed; add here if a model has it.)

const SES_EXTRACTORS = [
  // Linhas de gravidade (Conduit) — TIPO_REDE. Default Rede coletora when absent.
  {
    key: "SES.rede", network: "SES", base: "BaseLink", tipo_est: "Rede coletora",
    esperado: "Conduit com TIPO_REDE = 0 (Rede coletora)",
    discriminator: { table: "Conduit_HMIUserDefinedExtensions_Data", column: "TIPO_REDE" },
    defaultWhenMissing: true,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Conduit e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN Conduit_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."TIPO_REDE" = 0
          GROUP BY e.DomainElementID`,
    fallbackSql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Conduit e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },
  {
    key: "SES.emissario_final", network: "SES", base: "BaseLink", tipo_est: "Emissário final",
    esperado: "Conduit com TIPO_REDE = 2 (Emissário final)",
    discriminator: { table: "Conduit_HMIUserDefinedExtensions_Data", column: "TIPO_REDE" },
    defaultWhenMissing: false,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Conduit e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN Conduit_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."TIPO_REDE" = 2
          GROUP BY e.DomainElementID`,
  },
  {
    key: "SES.interceptor", network: "SES", base: "BaseLink", tipo_est: "Interceptor",
    esperado: "Conduit com TIPO_REDE = 3 (Interceptor)",
    discriminator: { table: "Conduit_HMIUserDefinedExtensions_Data", column: "TIPO_REDE" },
    defaultWhenMissing: false,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Conduit e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN Conduit_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."TIPO_REDE" = 3
          GROUP BY e.DomainElementID`,
  },

  // Linha de recalque (Pressure Pipe) — TIPO_REDE = 1. Pressure Pipe is its own
  // element group, so it is the default: every pressure pipe becomes linha de recalque
  // when the field is absent.
  {
    key: "SES.linha_recalque", network: "SES", base: "BaseLink", tipo_est: "Linha de recalque",
    esperado: "Pressure Pipe com TIPO_REDE = 1 (Linha de recalque)",
    discriminator: { table: "PressurePipe_HMIUserDefinedExtensions_Data", column: "TIPO_REDE" },
    defaultWhenMissing: true,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM PressurePipe e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN PressurePipe_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."TIPO_REDE" = 1
          GROUP BY e.DomainElementID`,
    fallbackSql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM PressurePipe e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },

  // Estações elevatórias de esgoto (EEE) — Wet Well, element-type based. No field.
  {
    key: "SES.eee", network: "SES", base: "BaseNode", tipo_est: "Estações elevatórias de esgoto",
    esperado: "Poço de sucção (WetWell)",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM WetWell e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },

  // ETE — node (Manhole) with TIPO_DESTINO = 1. Not a default: when the field is
  // absent the structure is empty (ordinary manholes must not all become ETE).
  {
    key: "SES.ete", network: "SES", base: "BaseNode", tipo_est: "Estações de tratamento de esgoto",
    esperado: "Manhole com TIPO_DESTINO = 1 (ETE)",
    discriminator: { table: "Manhole_HMIUserDefinedExtensions_Data", column: "TIPO_DESTINO" },
    defaultWhenMissing: false,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Manhole e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN Manhole_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."TIPO_DESTINO" = 1
          GROUP BY e.DomainElementID`,
  },

  // Corpo receptor — Outfall with TIPO_DESTINO = 0. Default for Outfall: every
  // outfall becomes a corpo receptor when the field is absent.
  {
    key: "SES.corpo_receptor", network: "SES", base: "BaseNode", tipo_est: "Corpo receptor",
    esperado: "Outfall com TIPO_DESTINO = 0 (Corpo receptor)",
    discriminator: { table: "Outfall_HMIUserDefinedExtensions_Data", column: "TIPO_DESTINO" },
    defaultWhenMissing: true,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Outfall e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN Outfall_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."TIPO_DESTINO" = 0
          GROUP BY e.DomainElementID`,
    fallbackSql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM Outfall e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },
];
