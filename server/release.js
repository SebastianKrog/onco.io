import { BALANCE } from './balance.js';
import { MVP_ACCEPTANCE_SCENARIOS } from './acceptance.js';

const deepFreeze = value => {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  return value;
};

export const RELEASE_GATE = deepFreeze({
  version: 1,
  balanceVersion: BALANCE.version,
  lobbySizes: [...BALANCE.match.lobbySizes],
  checks: ['unit', 'integration', 'browser', 'replay', 'acceptance', 'accessibility', 'load'],
  acceptanceScenarios: MVP_ACCEPTANCE_SCENARIOS.map(scenario => scenario.id)
});

/** Build a machine-readable gate result without allowing absent evidence to pass. */
export function evaluateReleaseGate(evidence = {}) {
  const checks = Object.fromEntries(RELEASE_GATE.checks.map(name => [name, RELEASE_GATE.lobbySizes.every(size => evidence.checks?.[name]?.[size] === true)]));
  const acceptance = RELEASE_GATE.acceptanceScenarios.every(id => evidence.acceptanceScenarios?.[id] === true);
  const playtests = RELEASE_GATE.lobbySizes.every(size => Number(evidence.playtestMatches?.[size]) > 0);
  const deviationsDocumented = evidence.deviationsDocumented === true;
  const blockers = [...Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => `${name} checks`), ...(!acceptance ? ['22 acceptance scenarios'] : []), ...(!playtests ? ['multiplayer playtests'] : []), ...(!deviationsDocumented ? ['deviation review'] : [])];
  return { ...RELEASE_GATE, checks, acceptance, playtests, deviationsDocumented, ready: blockers.length === 0, blockers };
}

export const pendingReleaseGate = () => evaluateReleaseGate();
