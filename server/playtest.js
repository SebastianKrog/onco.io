import { BALANCE } from './balance.js';

const deepFreeze = value => {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child);
  return value;
};

export const BALANCE_TARGETS = deepFreeze({
  neutralCapture: { min: 0, max: 10, unit: 'seconds' },
  firstResearch: { min: 30, max: 60, unit: 'seconds' },
  firstContest: { min: 45, max: 120, unit: 'seconds' },
  ordinaryContest: { min: 5, max: 20, unit: 'seconds' },
  advancedProduct: { min: 0, max: 480, unit: 'seconds' },
  completedResearch: { min: 6, max: 9, unit: 'projects' },
  specialistProduction: { min: 15, max: 100, unit: 'percent' },
  programmeCounterplay: { min: 1, max: Infinity, unit: 'depletions' },
  networkReinforcement: { min: 2, max: Infinity, unit: 'edges' }
});

const firstAt = (events, predicate) => events.find(predicate)?.at ?? null;
const status = (value, target) => value == null ? 'pending' : value < target.min ? 'early' : value > target.max ? 'late' : 'on-target';

export function buildPlaytestReport(telemetry, { elapsed = 0, result = null } = {}) {
  const events = telemetry?.events ?? [], research = events.filter(event => event.type === 'research-complete'), companies = Object.values(telemetry?.companies ?? {}), output = telemetry?.totals?.treatmentOutput ?? {};
  const completedContests = events.filter(event => event.type === 'contest-end' && Number.isFinite(event.duration));
  const outputTotal = Object.values(output).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const specialistOutput = ['radiotherapy', 'targeted', 'immunotherapy'].reduce((sum, key) => sum + (Number(output[key]) || 0), 0);
  const values = {
    neutralCapture: firstAt(events, event => event.type === 'region-change' && event.fromCompanyId == null && event.toCompanyId != null),
    firstResearch: research[0]?.at ?? null,
    firstContest: firstAt(events, event => event.type === 'dispatch' && event.launchForceRatio != null),
    ordinaryContest: completedContests.length ? completedContests.reduce((sum, event) => sum + event.duration, 0) / completedContests.length : null,
    advancedProduct: firstAt(events, event => event.type === 'treatment-output' && ['immunotherapy', 'vaccine'].includes(event.treatment)),
    completedResearch: companies.length ? companies.reduce((sum, company) => sum + (company.completedResearch ?? 0), 0) / companies.length : research.length,
    specialistProduction: outputTotal ? specialistOutput / outputTotal * 100 : null,
    programmeCounterplay: events.filter(event => event.type === 'programme-depleted').length || null,
    networkReinforcement: Math.max(0, ...events.filter(event => event.type === 'dispatch').map(event => event.route ?? 0)) || null
  };
  const targets = Object.fromEntries(Object.entries(BALANCE_TARGETS).map(([key, target]) => [key, { ...target, value: values[key], status: status(values[key], target) }]));
  return { balanceVersion: telemetry?.balanceVersion ?? BALANCE.version, elapsed, complete: Boolean(result), targets, observations: { dispatches: telemetry?.totals?.dispatches ?? 0, contestSeconds: telemetry?.totals?.contestSeconds ?? 0, completedContests: completedContests.length, programmes: telemetry?.totals?.programmes ?? 0, victoryType: result?.type ?? telemetry?.victory?.type ?? null } };
}

export function aggregatePlaytests(reports) {
  const completed = reports.filter(report => report?.complete), targets = {};
  for (const key of Object.keys(BALANCE_TARGETS)) {
    const values = completed.map(report => report.targets?.[key]?.value).filter(Number.isFinite);
    targets[key] = { samples: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
  }
  const victories = {};
  for (const report of completed) if (report.observations.victoryType) victories[report.observations.victoryType] = (victories[report.observations.victoryType] ?? 0) + 1;
  const dominanceWins = victories.dominance ?? 0;
  return { balanceVersion: BALANCE.version, matches: completed.length, targets, victories, victoryDistribution: Object.fromEntries(Object.entries(victories).map(([type, count]) => [type, count / completed.length])), dominanceShare: completed.length ? dominanceWins / completed.length : null };
}
