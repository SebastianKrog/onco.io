const deepFreeze = (value) => {
  Object.freeze(value);
  for (const child of Object.values(value))
    if (child && typeof child === "object" && !Object.isFrozen(child))
      deepFreeze(child);
  return value;
};

// Stable IDs correspond one-to-one with GAMEPLAY_SPEC.md section 14 and with
// the explicitly named tests in test/mvp-acceptance.test.js.
export const MVP_ACCEPTANCE_SCENARIOS = deepFreeze(
  [
    "Opening income and R02 timing",
    "Factory processing limits",
    "Economy conservation",
    "Research graph and schedule",
    "Packet percentages and minimums",
    "All-supply dispatch behavior",
    "Three-edge R11 routing",
    "Broken route and source loss",
    "Pressure conservation",
    "Contest examples and mutual exhaustion",
    "Persistent multi-attacker disputes",
    "Capture downgrade and excess stock",
    "Capture income and dominance timing",
    "Arrival and regeneration timing",
    "Continuity programme lifecycle",
    "Order-independent arrival aggregation",
    "Withdrawal conservation",
    "Commitment grandfathering",
    "Bot reserve and programme recovery",
    "Surrender and reconnect control",
    "Simultaneous loss and capture",
    "Command rejection atomicity",
  ].map((title, index) => ({ id: index + 1, title })),
);

export function acceptanceCoverage(scenarioIds = []) {
  const covered = new Set(scenarioIds);
  const scenarios = MVP_ACCEPTANCE_SCENARIOS.map((scenario) => ({
    ...scenario,
    automated: covered.has(scenario.id),
  }));
  const automated = scenarios.filter((scenario) => scenario.automated).length;
  return {
    total: scenarios.length,
    automated,
    complete: automated === scenarios.length,
    scenarios,
  };
}
