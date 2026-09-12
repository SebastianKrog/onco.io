const object = (value) => value !== null && typeof value === "object";
const compatible = (before, after) =>
  object(before) &&
  object(after) &&
  Array.isArray(before) === Array.isArray(after);

export function createDelta(previous, current) {
  const changes = [];
  const deletions = [];
  function visit(before, after, path) {
    if (Object.is(before, after)) return;
    // Replacing variable-length arrays preserves order and exact length. Fixed
    // arrays (notably regions) are traversed so their static data is omitted.
    if (
      !compatible(before, after) ||
      (Array.isArray(after) && before.length !== after.length)
    ) {
      changes.push({ path, value: structuredClone(after) });
      return;
    }
    for (const key of Object.keys(after))
      visit(before[key], after[key], [...path, key]);
    for (const key of Object.keys(before))
      if (!(key in after)) deletions.push([...path, key]);
  }
  visit(previous, current, []);
  return { changes, deletions };
}

export function applyDelta(previous, { changes, deletions }) {
  const next = structuredClone(previous);
  function assign(path, value) {
    if (!path.length) return structuredClone(value);
    let parent = next;
    for (const key of path.slice(0, -1)) parent = parent[key];
    parent[path.at(-1)] = structuredClone(value);
    return next;
  }
  let result = next;
  for (const change of changes) result = assign(change.path, change.value);
  for (const path of deletions) {
    let parent = result;
    for (const key of path.slice(0, -1)) parent = parent?.[key];
    if (parent) delete parent[path.at(-1)];
  }
  return result;
}
