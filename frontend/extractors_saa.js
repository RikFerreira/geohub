// SAA (water / WaterCAD) structures. Separate from SES on purpose: different
// software, different schema (elements are "Idaho*", node geometry is split
// across BaseIdahoNode and BaseDirectedNode).
//
// Fields are the same as extractors_ses.js. SAA base classes:
//   "BaseLink"         pipe links (lines)
//   "BaseIdahoNode"    junctions, tanks, reservoirs (points)
//   "BaseDirectedNode" pumps, valves/PRVs (points)
//
// This sample model verified: tanks REL/RAP/RSE = elevado/apoiado/semienterrado,
// reservoirs "ETA %" vs raw-water intakes, pumps EEA, PRV = VRP.

const SAA_EXTRACTORS = [
  // Reservatórios (storage tanks) — split by label prefix.
  {
    key: "SAA.rel", network: "SAA", base: "BaseIdahoNode",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoTank e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND m.Label LIKE 'REL%'`,
  },
  {
    key: "SAA.rap", network: "SAA", base: "BaseIdahoNode",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoTank e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND m.Label LIKE 'RAP%'`,
  },
  {
    key: "SAA.rse", network: "SAA", base: "BaseIdahoNode",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoTank e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND m.Label LIKE 'RSE%'`,
  },

  // Estações elevatórias de água (EEA) — pumps, active only.
  {
    key: "SAA.eea", network: "SAA", base: "BaseDirectedNode", activeOnly: true,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM StandardPump e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0`,
  },

  // Estações de tratamento de água (ETA) — reservoir boundary, label "ETA", active only.
  {
    key: "SAA.eta", network: "SAA", base: "BaseIdahoNode", activeOnly: true,
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoReservoir e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND m.Label LIKE 'ETA%'`,
  },

  // Poço tubular / captação — the other reservoir-boundary sources (HANDOFF: distinguish
  // from ETA by label; unconfirmed). Here they are river intakes ("Captação ...").
  {
    key: "SAA.captacao", network: "SAA", base: "BaseIdahoNode",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoReservoir e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND m.Label NOT LIKE 'ETA%'`,
  },

  // Válvula redutora de pressão (VRP) — PRV, active only.
  {
    key: "SAA.vrp", network: "SAA", base: "BaseDirectedNode", activeOnly: true,
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
    key: "SAA.rede", network: "SAA", base: "BaseLink",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoPipe e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoPipe_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x.Classe_Macro = 0
          GROUP BY e.DomainElementID`,
  },
  {
    key: "SAA.adutora", network: "SAA", base: "BaseLink",
    sql: `SELECT e.DomainElementID AS id, m.Label AS label
          FROM IdahoPipe e
          JOIN HMIModelingElement m ON m.ElementID = e.DomainElementID
          JOIN HMIDomainElement d  ON d.DomainElementID = e.DomainElementID
          JOIN IdahoPipe_HMIUserDefinedExtensions_Data x ON x.DomainElementID = e.DomainElementID
          WHERE m.IsDeleted = 0 AND d.IsPrototype = 0 AND x.Classe_Macro = 1
          GROUP BY e.DomainElementID`,
  },
];
