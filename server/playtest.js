import { BALANCE } from "./balance.js";

const deepFreeze = (value) => {
  Object.freeze(value);
  for (const child of Object.values(value))
    if (child && typeof child === "object" && !Object.isFrozen(child))
      deepFreeze(child);
  return value;
};

/** Campaign policy. Vaccine is advanced output, but is not specialist production. */
export const BALANCE_TARGETS = deepFreeze({
  opening: { min: 0, max: 0, unit: "seconds" },
  neutralCapture: { min: 0, max: 480, unit: "seconds" },
  firstResearch: { min: 30, max: 420, unit: "seconds" },
  firstContest: { min: 45, max: 600, unit: "seconds" },
  ordinaryContest: { min: 0, max: 20, unit: "seconds" },
  advancedProduct: { min: 0, max: 480, unit: "seconds" },
  completedResearch: { min: 6, max: 12, unit: "projects per contender" },
  specialistProduction: {
    min: 15,
    max: 100,
    unit: "percent (RAD/TGT/IMM; VAC excluded)",
  },
  programmeCounterplay: { min: 1, max: Infinity, unit: "depletions" },
});

export const CAMPAIGN_CRITERIA = deepFreeze({
  artifactVersion: 1,
  minimumSamplesPerLobby: 3,
  requiredOnTargetShare: 0.5,
  victory: {
    dominance: { min: 0, max: 0.25 },
    timed: { min: 0.5, max: 1 },
    classified: { min: 1, max: 1 },
  },
});

const firstAt = (events, predicate) => events.find(predicate)?.at ?? null;
const status = (value, target, complete) =>
  value == null
    ? complete
      ? "missing"
      : "pending"
    : value < target.min
      ? "early"
      : value > target.max
        ? "late"
        : "on-target";

export function buildPlaytestReport(
  telemetry,
  { elapsed = 0, result = null } = {},
) {
  const events = telemetry?.events ?? [],
    research = events.filter((e) => e.type === "research-complete"),
    companies = Object.values(telemetry?.companies ?? {}),
    output = telemetry?.totals?.treatmentOutput ?? {};
  const completedContests = events.filter(
    (e) => e.type === "contest-end" && Number.isFinite(e.duration),
  );
  const outputTotal = Object.values(output).reduce(
    (s, v) => s + (Number(v) || 0),
    0,
  );
  const specialistOutput = ["radiotherapy", "targeted", "immunotherapy"].reduce(
    (s, k) => s + (Number(output[k]) || 0),
    0,
  );
  const values = {
    opening: 0,
    neutralCapture: firstAt(
      events,
      (e) =>
        e.type === "region-change" &&
        e.fromCompanyId == null &&
        e.toCompanyId != null,
    ),
    firstResearch: research[0]?.at ?? null,
    firstContest: firstAt(
      events,
      (e) => e.type === "contest-start" && e.rivalContest === true,
    ),
    ordinaryContest: completedContests.length
      ? completedContests.reduce((s, e) => s + e.duration, 0) /
        completedContests.length
      : null,
    advancedProduct: firstAt(
      events,
      (e) =>
        (e.type === "research-complete" &&
          ["R08", "R09"].includes(e.project)) ||
        (e.type === "treatment-output" &&
          ["immunotherapy", "vaccine"].includes(e.treatment)),
    ),
    completedResearch: companies.length
      ? companies.reduce((s, c) => s + (c.completedResearch ?? 0), 0) /
        companies.length
      : null,
    specialistProduction: outputTotal
      ? (specialistOutput / outputTotal) * 100
      : null,
    programmeCounterplay:
      events.filter((e) => e.type === "programme-depleted").length || null,
  };
  const complete = Boolean(result),
    targets = Object.fromEntries(
      Object.entries(BALANCE_TARGETS).map(([key, target]) => [
        key,
        {
          ...target,
          value: values[key],
          status: status(values[key], target, complete),
        },
      ]),
    );
  return {
    balanceVersion: telemetry?.balanceVersion ?? BALANCE.version,
    elapsed,
    complete: Boolean(result),
    targets,
    observations: {
      dispatches: telemetry?.totals?.dispatches ?? 0,
      contestSeconds: telemetry?.totals?.contestSeconds ?? 0,
      completedContests: completedContests.length,
      programmes: telemetry?.totals?.programmes ?? 0,
      victoryType: result?.type ?? telemetry?.victory?.type ?? null,
    },
  };
}

const distribution = (samples) => {
  const finite = samples.filter(Number.isFinite).sort((a, b) => a - b),
    missing = samples.length - finite.length;
  const mean = finite.length
    ? finite.reduce((a, b) => a + b, 0) / finite.length
    : null;
  return {
    samples: samples.length,
    observed: finite.length,
    missing,
    mean,
    min: finite[0] ?? null,
    max: finite.at(-1) ?? null,
    median: finite.length ? finite[Math.floor((finite.length - 1) / 2)] : null,
    values: finite,
  };
};

export function aggregatePlaytests(
  reports,
  { minimumSamples = CAMPAIGN_CRITERIA.minimumSamplesPerLobby } = {},
) {
  const complete = reports.filter((r) => r?.complete),
    versions = [
      ...new Set(reports.map((r) => r?.balanceVersion).filter(Boolean)),
    ],
    targets = {};
  for (const [key, target] of Object.entries(BALANCE_TARGETS)) {
    const all = complete.map((r) => r.targets?.[key]?.value),
      dist = distribution(all),
      onTarget = all.filter(
        (v) => Number.isFinite(v) && v >= target.min && v <= target.max,
      ).length;
    targets[key] = {
      ...dist,
      classifications: {
        observed: dist.observed,
        "not-observed": dist.missing,
      },
      onTarget,
      onTargetShare: all.length ? onTarget / all.length : 0,
      pass:
        all.length >= minimumSamples &&
        onTarget / all.length >= CAMPAIGN_CRITERIA.requiredOnTargetShare,
    };
  }
  const victories = {};
  for (const r of complete) {
    const type = r.observations?.victoryType ?? "missing";
    victories[type] = (victories[type] ?? 0) + 1;
  }
  const victoryDistribution = Object.fromEntries(
    Object.entries(victories).map(([k, n]) => [
      k,
      complete.length ? n / complete.length : 0,
    ]),
  );
  const dominanceShare = victoryDistribution.dominance ?? 0,
    timedShare = victoryDistribution.timed ?? 0,
    classifiedShare = complete.length
      ? (complete.length - (victories.missing ?? 0)) / complete.length
      : 0;
  const victoryPass =
    complete.length >= minimumSamples &&
    dominanceShare >= CAMPAIGN_CRITERIA.victory.dominance.min &&
    dominanceShare <= CAMPAIGN_CRITERIA.victory.dominance.max &&
    timedShare >= CAMPAIGN_CRITERIA.victory.timed.min &&
    classifiedShare === 1;
  const pass =
    versions.length === 1 &&
    versions[0] === BALANCE.version &&
    complete.length === reports.length &&
    complete.length >= minimumSamples &&
    Object.values(targets).every((x) => x.pass) &&
    victoryPass;
  return {
    balanceVersion: versions[0] ?? BALANCE.version,
    matches: complete.length,
    submitted: reports.length,
    minimumSamples,
    targets,
    victories,
    victoryDistribution,
    dominanceShare,
    victoryPass,
    pass,
  };
}
