export const MAP_TEMPLATES = Object.freeze({
  20: Object.freeze({ columns: 16, rows: 10 }),
  30: Object.freeze({ columns: 20, rows: 12 }),
  40: Object.freeze({ columns: 20, rows: 16 })
});

export const REGION_PROFILES = Object.freeze(['solid', 'blood', 'rare', 'mixed']);

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function regionNeighbours(id, columns, rows) {
  const row = Math.floor(id / columns), column = id % columns;
  const offsets = row % 2
    ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  return offsets.map(([dc, dr]) => [column + dc, row + dr])
    .filter(([c, r]) => c >= 0 && c < columns && r >= 0 && r < rows)
    .map(([c, r]) => r * columns + c).sort((a, b) => a - b);
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function assignProfiles(regions, random) {
  const palette = shuffled(REGION_PROFILES, random), shift = Math.floor(random() * 4);
  const columns = Math.max(...regions.map(region => region.column)) + 1;
  for (const region of regions) {
    const band = Math.floor(region.column / 2);
    region.profile = palette[(band + 2 * region.row + shift) % 4];
    region.profilePatch = region.row * Math.ceil(columns / 2) + band;
  }
}

function distances(regions, source) {
  const result = Array(regions.length).fill(Infinity); result[source] = 0;
  const queue = [source];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    for (const next of regions[id].neighbours) if (result[next] === Infinity) { result[next] = result[id] + 1; queue.push(next); }
  }
  return result;
}

function hasNearbyProfiles(regions, id) {
  const seen = new Set([regions[id].profile]);
  for (const one of regions[id].neighbours) {
    seen.add(regions[one].profile);
    for (const two of regions[one].neighbours) seen.add(regions[two].profile);
  }
  return REGION_PROFILES.every(profile => seen.has(profile));
}

function selectPads(regions, count, random) {
  const matrices = new Map();
  const distance = (a, b) => { if (!matrices.has(a)) matrices.set(a, distances(regions, a)); return matrices.get(a)[b]; };
  for (let className = 0; className < 7; className += 1) {
    const candidates = regions.filter(region => {
      const q = region.column - (region.row - region.row % 2) / 2;
      return ((q + 3 * region.row) % 7 + 7) % 7 === className && region.neighbours.length >= 4 && hasNearbyProfiles(regions, region.id);
    }).map(region => region.id);
    if (candidates.length < count) continue;
    const chosen = [shuffled(candidates, random)[0]];
    while (chosen.length < count) {
      const options = candidates.filter(id => !chosen.includes(id) && chosen.every(pad => distance(id, pad) >= 3));
      if (!options.length) break;
      options.sort((a, b) => Math.min(...chosen.map(pad => distance(b, pad))) - Math.min(...chosen.map(pad => distance(a, pad))) || a - b);
      chosen.push(options[0]);
    }
    if (chosen.length === count) return chosen;
  }
  throw new Error(`Unable to generate ${count} valid placement pads`);
}

export function createSeededMap({ lobbySize = 20, seed = 'onco-default' } = {}) {
  const template = MAP_TEMPLATES[lobbySize];
  if (!template) throw new RangeError('lobbySize must be 20, 30, or 40');
  const random = seededRandom(seed);
  const regions = Array.from({ length: template.columns * template.rows }, (_, id) => ({
    id, column: id % template.columns, row: Math.floor(id / template.columns),
    neighbours: regionNeighbours(id, template.columns, template.rows), profile: null, profilePatch: null
  }));
  assignProfiles(regions, random);
  const pads = selectPads(regions, lobbySize, random);
  return { seed: String(seed), columns: template.columns, rows: template.rows, regions, pads };
}
