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
  completedResearch: { min: 6, max: 9, unit: 'projects' }
});

const firstAt = (events, predicate) => events.find(predicate)?.at ?? null;
const status = (value, target) => value == null ? 'pending' : value < target.min ? 'early' : value > target.max ? 'late' : 'on-target';

export function buildPlaytestReport(telemetry, { elapsed = 0, result = null } = {}) {
  const events = telemetry?.events ?? [], research = events.filter(event => event.type === 'research-complete'), companies = Object.values(telemetry?.companies ?? {});
  const values = {
    neutralCapture: firstAt(events, event => event.type === 'region-change' && event.fromCompanyId == null && event.toCompanyId != null),
    firstResearch: research[0]?.at ?? null,
    firstContest: firstAt(events, event => event.type === 'dispatch' && event.launchForceRatio != null),
    completedResearch: companies.length ? companies.reduce((sum, company) => sum + (company.completedResearch ?? 0), 0) / companies.length : research.length
  };
  const targets = Object.fromEntries(Object.entries(BALANCE_TARGETS).map(([key, target]) => [key, { ...target, value: values[key], status: status(values[key], target) }]));
  return { balanceVersion: telemetry?.balanceVersion ?? BALANCE.version, elapsed, complete: Boolean(result), targets, observations: { dispatches: telemetry?.totals?.dispatches ?? 0, contestSeconds: telemetry?.totals?.contestSeconds ?? 0, programmes: telemetry?.totals?.programmes ?? 0, victoryType: result?.type ?? telemetry?.victory?.type ?? null } };
}

export function aggregatePlaytests(reports) {
  const completed = reports.filter(report => report?.complete), targets = {};
  for (const key of Object.keys(BALANCE_TARGETS)) {
    const values = completed.map(report => report.targets?.[key]?.value).filter(Number.isFinite);
    targets[key] = { samples: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
  }
  const victories = {};
  for (const report of completed) if (report.observations.victoryType) victories[report.observations.victoryType] = (victories[report.observations.victoryType] ?? 0) + 1;
  return { balanceVersion: BALANCE.version, matches: completed.length, targets, victories };
}
