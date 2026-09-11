// The complete MVP ruleset lives in one serialisable object.  Do not read balance
// values from environment variables: a version must describe a replay exactly.
const deepFreeze = value => {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  return value;
};

export const BALANCE = deepFreeze({
  version: '0.2',
  match: { seconds: 720, step: .25, placementSeconds: 20, lobbySizes: [20, 30, 40], regionsPerCompany: 8, dominanceShare: .6, dominanceSeconds: 60 },
  economy: { grant: 8, regionBase: 3, levelIncome: .4, operatingBase: 1, operatingLevel: .1, commissioningSeconds: 10, commissioningMultiplier: .5, bankCap: 300, administration: 1.5, administrationGrace: 8, administrationCurve: 20, schedulingMultiplier: .85 },
  budgets: { increment: 5, balanced: { research: 20, manufacturing: 65, infrastructure: 15 }, expansion: { research: 10, manufacturing: 80, infrastructure: 10 }, development: { research: 40, manufacturing: 40, infrastructure: 20 } },
  treatments: {
    medicine: { id: 'MED', label: 'Basic medicines', cost: 1, level: 0, edgeTime: 3 },
    radiotherapy: { id: 'RAD', label: 'Radiotherapy capacity', cost: 2, level: 1, edgeTime: 5 },
    targeted: { id: 'TGT', label: 'Targeted therapies', cost: 2.5, level: 1, edgeTime: 3 },
    immunotherapy: { id: 'IMM', label: 'Immunotherapy', cost: 3, level: 2, edgeTime: 4 },
    vaccine: { id: 'VAC', label: 'Therapeutic vaccines', cost: 4, level: 2, edgeTime: 5 }
  },
  research: {
    R01: ['Manufacturing scale-up', null, 140, 40], R02: ['Optimized protocols', null, 80, 25], R03: ['Molecular diagnostics', null, 100, 30], R04: ['Targeted platform', 'R03', 180, 45], R05: ['Second indication', 'R04', 360, 120], R06: ['Radiation planning', null, 140, 35], R07: ['Image guidance', 'R06', 360, 120], R08: ['Immune engineering', 'R03', 220, 55], R09: ['Therapeutic vaccine platform', 'R08', 260, 65], R10: ['Immune memory programme', 'R09', 360, 120], R11: ['Cold-chain logistics', 'R01', 140, 35], R12: ['Network scheduling', 'R11', 220, 55]
  },
  infrastructure: { costs: [0, 60, 140, 260], minimumSeconds: [0, 20, 35, 50], processingCredits: [4, 8, 12, 16], storageBase: 200, storagePerLevel: 100, borderWeight: 3, pinWeight: 3 },
  movement: { minimumPacket: 10, dispatchCooldown: 1, captureCooldown: 5, convoySlots: 16, foreignBaseSlots: 3, foreignSlotRegions: 16, foreignMaxSlots: 6, targetCapacity: 1000, logisticsMultiplier: .8, withdrawalRetained: .8 },
  contest: { forceShare: .1, flatPressureCap: 4, exhaustedBelow: 1, quietSeconds: 5, neutralProtection: 30, ownedProtectionBase: 20, ownedProtectionLevel: 15 },
  programme: { vaccineUnits: 10, pendingSeconds: 8, protection: 60, advancedProtection: 75, duration: 90, advancedDuration: 120 },
  bots: { evaluationSeconds: 2, reinforcementArrivalSeconds: 12, retainedShare: .3, packetShares: [.5, .65], neutralRatio: 1.35, rivalRatio: 1.6 }
});

export const getBalance = version => {
  if (version !== BALANCE.version) throw new RangeError(`Unsupported balance version: ${version}`);
  return BALANCE;
};
