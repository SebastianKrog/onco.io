export const BUDGET_ORDER = ["research", "manufacturing", "infrastructure"];
export const BUDGET_PRESETS = Object.freeze({
  balanced: Object.freeze({
    research: 20,
    manufacturing: 65,
    infrastructure: 15,
  }),
  expansion: Object.freeze({
    research: 10,
    manufacturing: 80,
    infrastructure: 10,
  }),
  development: Object.freeze({
    research: 40,
    manufacturing: 40,
    infrastructure: 20,
  }),
});

export function redistributeBudget(allocation, changed, value) {
  if (
    !BUDGET_ORDER.includes(changed) ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100 ||
    value % 5
  )
    return null;
  const others = BUDGET_ORDER.filter((name) => name !== changed);
  const remaining = 100 - value;
  const total = others.reduce(
    (sum, name) => sum + Number(allocation?.[name] || 0),
    0,
  );
  const rawFirst = total
    ? (remaining * Number(allocation[others[0]])) / total
    : remaining / 2;
  const first = Math.floor((rawFirst + 2.5) / 5) * 5;
  return {
    ...allocation,
    [changed]: value,
    [others[0]]: first,
    [others[1]]: remaining - first,
  };
}
