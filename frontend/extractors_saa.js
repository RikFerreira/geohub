// SAA (water / WaterGEMS) structures. Discrimination is by user-defined enum field,
// read from the model; field names + enum codes match the standard seed model
// (seeds/models/SAA/SAA.wtg.sqlite). See frontend/docs/requisitos.md.
//
// A discriminator extractor carries:
//   sql                enum-filtered query (normal case).
//   fallbackSql        same query WITHOUT the discriminator filter — run only when the
//                      column is absent AND this is the element's default structure.
//   discriminator      { table, column }, tested with findColumn to detect absence.
//   defaultWhenMissing true  = when the column is absent, every element of this type
//                              collapses here (+ warning);
//                      false = the structure comes back empty (+ warning).
// Element-type-only structures (VRP) omit discriminator and behave as before.
//
// Enum codes (decoded from the seed):
//   Tank      Tipo_Reservatorio : 0 Apoiado(RAP) / 1 Elevado(REL) / 2 Semienterrado(RSE)
//   Reservoir Tipo_Fonte        : 0 Captação / 1 ETA
//   Pump      Tipo_Bomba        : 0 Elevatória(EEA) / 1 Booster / 2 Bomba Poço
//   Pipe      Tipo_Rede         : 0 Distribuição(Rede) / 1 Adução(Adutora)

const SAA_EXTRACTORS = [
  // Reservatórios (Tank) — Tipo_Reservatorio. Default RAP when the field is absent.
  {
    key: "SAA.rap", network: "SAA", base: "BaseIdahoNode", tipo_est: "Reservatórios apoiados",
    esperado: "Tank com Tipo_Reservatorio = 0 (Apoiado)",
    discriminator: { table: "IdahoTank_HMIUserDefinedExtensions_Data", column: "Tipo_Reservatorio" },
    defaultWhenMissing: true,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoTank e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoTank_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_Reservatorio" = 0
          GROUP BY e.DomainElementID`,
    fallbackSql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoTank e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },
  {
    key: "SAA.rel", network: "SAA", base: "BaseIdahoNode", tipo_est: "Reservatórios elevados",
    esperado: "Tank com Tipo_Reservatorio = 1 (Elevado)",
    discriminator: { table: "IdahoTank_HMIUserDefinedExtensions_Data", column: "Tipo_Reservatorio" },
    defaultWhenMissing: false,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoTank e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoTank_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_Reservatorio" = 1
          GROUP BY e.DomainElementID`,
  },
  {
    key: "SAA.rse", network: "SAA", base: "BaseIdahoNode", tipo_est: "Reservatórios semienterrados",
    esperado: "Tank com Tipo_Reservatorio = 2 (Semienterrado)",
    discriminator: { table: "IdahoTank_HMIUserDefinedExtensions_Data", column: "Tipo_Reservatorio" },
    defaultWhenMissing: false,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoTank e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoTank_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_Reservatorio" = 2
          GROUP BY e.DomainElementID`,
  },

  // Fontes (Reservoir) — Tipo_Fonte. Default Captação when the field is absent.
  {
    key: "SAA.captacao", network: "SAA", base: "BaseIdahoNode", tipo_est: "Poço tubular",
    esperado: "Reservoir com Tipo_Fonte = 0 (Captação)",
    discriminator: { table: "IdahoReservoir_HMIUserDefinedExtensions_Data", column: "Tipo_Fonte" },
    defaultWhenMissing: true,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoReservoir e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoReservoir_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_Fonte" = 0
          GROUP BY e.DomainElementID`,
    fallbackSql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoReservoir e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },
  {
    key: "SAA.eta", network: "SAA", base: "BaseIdahoNode", activeOnly: true, tipo_est: "Estações de tratamento de água",
    esperado: "Reservoir ativo com Tipo_Fonte = 1 (ETA)",
    discriminator: { table: "IdahoReservoir_HMIUserDefinedExtensions_Data", column: "Tipo_Fonte" },
    defaultWhenMissing: false,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoReservoir e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoReservoir_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_Fonte" = 1
          GROUP BY e.DomainElementID`,
  },

  // Estações elevatórias de água (Pump) — Tipo_Bomba = 0 (Elevatória), active.
  // Default EEA when the field is absent (every active pump becomes an EEA).
  {
    key: "SAA.eea", network: "SAA", base: "BaseDirectedNode", activeOnly: true, tipo_est: "Estações elevatórias de água",
    esperado: "Pump ativa com Tipo_Bomba = 0 (Elevatória)",
    discriminator: { table: "StandardPump_HMIUserDefinedExtensions_Data", column: "Tipo_Bomba" },
    defaultWhenMissing: true,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM StandardPump e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN StandardPump_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_Bomba" = 0
          GROUP BY e.DomainElementID`,
    fallbackSql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM StandardPump e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },

  // Válvula redutora de pressão (VRP) — PRV, active only. No discriminator field.
  {
    key: "SAA.vrp", network: "SAA", base: "BaseDirectedNode", activeOnly: true, tipo_est: "Válvula redutora de pressão",
    esperado: "Válvula redutora de pressão (PRV) ativa no cenário",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM PRV e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },

  // Tubos (Pipe) — Tipo_Rede. Default Rede (distribuição) when the field is absent.
  {
    key: "SAA.rede", network: "SAA", base: "BaseLink", tipo_est: "Rede de distribuição",
    esperado: "Pipe com Tipo_Rede = 0 (Distribuição)",
    discriminator: { table: "IdahoPipe_HMIUserDefinedExtensions_Data", column: "Tipo_Rede" },
    defaultWhenMissing: true,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoPipe e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoPipe_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_Rede" = 0
          GROUP BY e.DomainElementID`,
    fallbackSql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoPipe e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },
  {
    key: "SAA.adutora", network: "SAA", base: "BaseLink", tipo_est: "Adutora",
    esperado: "Pipe com Tipo_Rede = 1 (Adução)",
    discriminator: { table: "IdahoPipe_HMIUserDefinedExtensions_Data", column: "Tipo_Rede" },
    defaultWhenMissing: false,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoPipe e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoPipe_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_Rede" = 1
          GROUP BY e.DomainElementID`,
  },
];
