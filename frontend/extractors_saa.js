// SAA (water / WaterCAD) structures. Separate from SES on purpose: different
// software, different schema (elements are "Idaho*", node geometry is split
// across BaseIdahoNode and BaseDirectedNode).
//
// Fields are the same as extractors_ses.js, plus `esperado`: a short Portuguese
// description of how the data must be for this structure to be found. It is shown
// in the extraction summary when a structure comes back empty or errors.
//
// Discrimination is by user-defined enum, never by label prefix:
//   tanks     -> Tipo_de_Reservatório (1 semi / 2 apoiado / 3 elevado)
//   reservoirs-> Tipo_de_Fonte (0 ETA / 1 Poço tubular)
//   pipes     -> Classe_Macro (0 rede / 1 adutora)
// Pumps (EEA) and PRV (VRP) are by element type, active in the scenario.

const SAA_EXTRACTORS = [
  // Reservatórios (storage tanks) — split by the user field Tipo_de_Reservatório
  // (enum: 1 = Semienterrado, 2 = Apoiado, 3 = Elevado; 0 = Enterrado, unused).
  // The label prefix (REL/RAP/RSE) is unreliable, so the enum is authoritative.
  {
    key: "SAA.rel", network: "SAA", base: "BaseIdahoNode", tipo_est: "Reservatórios elevados",
    esperado: "Reservatório (Tank) com campo 'Tipo_de_Reservatório' = 3 (Elevado)",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoTank e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoTank_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_de_Reservatório" = 3
          GROUP BY e.DomainElementID`,
  },
  {
    key: "SAA.rap", network: "SAA", base: "BaseIdahoNode", tipo_est: "Reservatórios apoiados",
    esperado: "Reservatório (Tank) com campo 'Tipo_de_Reservatório' = 2 (Apoiado)",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoTank e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoTank_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_de_Reservatório" = 2
          GROUP BY e.DomainElementID`,
  },
  {
    key: "SAA.rse", network: "SAA", base: "BaseIdahoNode", tipo_est: "Reservatórios semienterrados",
    esperado: "Reservatório (Tank) com campo 'Tipo_de_Reservatório' = 1 (Semienterrado)",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoTank e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoTank_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_de_Reservatório" = 1
          GROUP BY e.DomainElementID`,
  },

  // Estações elevatórias de água (EEA) — pumps, active only.
  {
    key: "SAA.eea", network: "SAA", base: "BaseDirectedNode", activeOnly: true, tipo_est: "Estações elevatórias de água",
    esperado: "Bomba (Pump) ativa no cenário",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM StandardPump e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },

  // Estações de tratamento de água (ETA) — Reservoir with Tipo_de_Fonte = 0, active.
  {
    key: "SAA.eta", network: "SAA", base: "BaseIdahoNode", activeOnly: true, tipo_est: "Estações de tratamento de água",
    esperado: "Reservatório-fonte (Reservoir) ativo com campo 'Tipo_de_Fonte' = 0 (ETA)",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoReservoir e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoReservoir_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_de_Fonte" = 0
          GROUP BY e.DomainElementID`,
  },

  // Poço tubular / captação — Reservoir with Tipo_de_Fonte = 1.
  {
    key: "SAA.captacao", network: "SAA", base: "BaseIdahoNode", tipo_est: "Poço tubular",
    esperado: "Reservatório-fonte (Reservoir) com campo 'Tipo_de_Fonte' = 1 (Poço tubular)",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoReservoir e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoReservoir_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x."Tipo_de_Fonte" = 1
          GROUP BY e.DomainElementID`,
  },

  // Válvula redutora de pressão (VRP) — PRV, active only.
  {
    key: "SAA.vrp", network: "SAA", base: "BaseDirectedNode", activeOnly: true, tipo_est: "Válvula redutora de pressão",
    esperado: "Válvula redutora de pressão (PRV) ativa no cenário",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM PRV e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },

  // Pipes split by Classe_Macro (integer index in IdahoPipe_HMIUserDefinedExtensions_Data):
  //   0 = Distribuição (rede), 1 = Adução (adutoras). Verified by diameter (adutoras are larger).
  // GROUP BY the element id because that extension table is keyed per alternative
  // (a few pipes carry the field on more than one alternative row).
  {
    key: "SAA.rede", network: "SAA", base: "BaseLink", tipo_est: "Rede de distribuição",
    esperado: "Tubo (IdahoPipe) com campo 'Classe_Macro' = 0 — extensão definida pelo usuário no modelo",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoPipe e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoPipe_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x.Classe_Macro = 0
          GROUP BY e.DomainElementID`,
  },
  {
    key: "SAA.adutora", network: "SAA", base: "BaseLink", tipo_est: "Adutora",
    esperado: "Tubo (IdahoPipe) com campo 'Classe_Macro' = 1 — extensão definida pelo usuário no modelo",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoPipe e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoPipe_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x.Classe_Macro = 1
          GROUP BY e.DomainElementID`,
  },
];
