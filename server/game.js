import { randomUUID } from 'node:crypto';

export const MAP = { columns: 8, rows: 5 };
export const PROFILES = ['solid', 'blood', 'rare', 'mixed'];
export const TREATMENTS = {
  medicine: { label: 'Medicines', unlock: 0, cost: 1, speed: 1.25, control: 1, match: null },
  radiotherapy: { label: 'Radiotherapy', unlock: 35, cost: 2, speed: 0.75, control: 1.65, match: 'solid' },
  targeted: { label: 'Targeted therapy', unlock: 65, cost: 3, speed: 1, control: 1.15, match: 'focus' },
  vaccine: { label: 'Therapeutic vaccine', unlock: 100, cost: 4, speed: 0.55, control: 2.1, match: null }
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cleanName = name => String(name ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 18) || 'Researcher';

export class Game {
  constructor({ random = Math.random, id = randomUUID, matchSeconds = 12 * 60 } = {}) {
    this.random = random;
    this.id = id;
    this.matchSeconds = matchSeconds;
    this.elapsed = 0;
    this.players = new Map();
    this.contests = new Map();
    this.winner = null;
    this.holdLeader = null;
    this.holdSeconds = 0;
    this.regions = Array.from({ length: MAP.columns * MAP.rows }, (_, id) => ({
      id, column: id % MAP.columns, row: Math.floor(id / MAP.columns),
      profile: PROFILES[id % PROFILES.length], ownerId: null, strength: 18, infrastructure: 0
    }));
  }

  addPlayer(name = 'Researcher') {
    const player = {
      id: this.id(), name: cleanName(name), color: `hsl(${Math.floor(this.random() * 360)} 70% 58%)`,
      started: false, focus: null, revenue: 0, research: 0,
      stock: { medicine: 20, radiotherapy: 0, targeted: 0, vaccine: 0 },
      unlocked: ['medicine'], allocation: { research: 34, manufacturing: 33, infrastructure: 33 },
      selectedTreatment: 'medicine'
    };
    this.players.set(player.id, player);
    return player;
  }

  removePlayer(id) { return this.players.delete(id); }

  renamePlayer(player, name) { player.name = cleanName(name); return true; }

  adjacent(a, b) {
    const first = this.regions[a]; const second = this.regions[b];
    return Boolean(first && second && Math.abs(first.column - second.column) + Math.abs(first.row - second.row) === 1);
  }

  handle(id, message) {
    const player = this.players.get(id);
    if (!player || !message || typeof message !== 'object' || this.winner) return false;
    if (message.type === 'start') return this.start(player, message.regionId);
    if (message.type === 'join') return this.renamePlayer(player, message.name);
    if (message.type === 'allocate') return this.allocate(player, message.allocation);
    if (message.type === 'selectTreatment') return this.selectTreatment(player, message.treatment);
    if (message.type === 'contest') return this.contest(player, message.fromId, message.toId, message.commitment);
    return false;
  }

  start(player, regionId) {
    const region = this.regions[Number(regionId)];
    if (player.started || !region || region.ownerId !== null) return false;
    region.ownerId = player.id; region.strength = 35; region.infrastructure = 1;
    player.started = true; player.focus = region.profile;
    return true;
  }

  allocate(player, allocation) {
    if (!allocation || typeof allocation !== 'object') return false;
    const next = ['research', 'manufacturing', 'infrastructure'].map(key => clamp(Math.round(Number(allocation[key]) || 0), 0, 100));
    if (next.reduce((sum, value) => sum + value, 0) !== 100) return false;
    [player.allocation.research, player.allocation.manufacturing, player.allocation.infrastructure] = next;
    return true;
  }

  selectTreatment(player, treatment) {
    if (!player.unlocked.includes(treatment)) return false;
    player.selectedTreatment = treatment;
    return true;
  }

  contest(player, fromId, toId, commitment) {
    const from = this.regions[Number(fromId)]; const target = this.regions[Number(toId)];
    const treatmentName = player.selectedTreatment; const treatment = TREATMENTS[treatmentName];
    const percent = clamp(Math.round(Number(commitment) || 0), 5, 100);
    if (!from || !target || from.ownerId !== player.id || !this.adjacent(from.id, target.id) || !treatment) return false;
    const available = player.stock[treatmentName];
    const units = Math.floor(available * percent / 100);
    if (units < treatment.cost) return false;
    player.stock[treatmentName] -= units;
    if (target.ownerId === player.id) {
      target.strength += units * treatment.control;
      return true;
    }
    const suitability = treatment.match === target.profile || (treatment.match === 'focus' && player.focus === target.profile) ? 1.65 : 1;
    const incumbentBonus = 1 + target.infrastructure * 0.18;
    const existing = this.contests.get(target.id);
    if (existing?.attackerId === player.id) existing.power += units * treatment.speed * suitability;
    else this.contests.set(target.id, { regionId: target.id, attackerId: player.id, treatment: treatmentName, power: units * treatment.speed * suitability, defense: target.strength * incumbentBonus });
    return true;
  }

  tick(seconds = 1) {
    if (this.winner) return;
    const delta = clamp(Number(seconds) || 0, 0, 5);
    this.elapsed += delta;
    for (const player of this.players.values()) {
      if (!player.started) continue;
      const owned = this.regions.filter(region => region.ownerId === player.id);
      const income = owned.reduce((sum, region) => sum + 1 + region.infrastructure * 0.2, 0) * delta;
      player.revenue += income;
      player.research += income * player.allocation.research / 100;
      for (const [name, treatment] of Object.entries(TREATMENTS)) {
        if (!player.unlocked.includes(name) && player.research >= treatment.unlock) player.unlocked.push(name);
      }
      const build = income * player.allocation.manufacturing / 100;
      const treatment = TREATMENTS[player.selectedTreatment];
      player.stock[player.selectedTreatment] += build / treatment.cost;
      const fortify = income * player.allocation.infrastructure / 100;
      for (const region of owned) {
        region.infrastructure = clamp(region.infrastructure + fortify / Math.max(owned.length, 1) / 80, 0, 5);
        region.strength = clamp(region.strength + fortify / Math.max(owned.length, 1) * 0.25, 1, 100);
      }
      const supplyCost = Math.max(0, owned.length - 3) ** 1.35 * 0.025 * delta;
      player.stock.medicine = Math.max(0, player.stock.medicine - supplyCost);
    }
    for (const [regionId, contest] of this.contests) {
      const region = this.regions[regionId];
      contest.defense -= contest.power * 0.075 * delta;
      contest.power = Math.max(0, contest.power - (2 + region.infrastructure) * 0.04 * delta);
      if (contest.defense <= 0) {
        region.ownerId = contest.attackerId; region.strength = clamp(contest.power * TREATMENTS[contest.treatment].control, 8, 60); region.infrastructure *= 0.6;
        this.contests.delete(regionId);
      } else if (contest.power <= 0) this.contests.delete(regionId);
    }
    this.checkVictory(delta);
  }

  checkVictory(delta) {
    const counts = [...this.players.values()].map(player => ({ player, count: this.regions.filter(region => region.ownerId === player.id).length })).sort((a, b) => b.count - a.count);
    const leader = counts[0];
    if (leader && leader.count / this.regions.length >= 0.6) {
      if (this.holdLeader === leader.player.id) this.holdSeconds += delta;
      else { this.holdLeader = leader.player.id; this.holdSeconds = delta; }
      if (this.holdSeconds >= 60) this.winner = leader.player.id;
    } else { this.holdLeader = null; this.holdSeconds = 0; }
    if (!this.winner && this.elapsed >= this.matchSeconds && leader?.count > 0) this.winner = leader.player.id;
  }

  snapshot() {
    return {
      map: MAP, profiles: PROFILES, treatments: TREATMENTS, elapsed: this.elapsed,
      remaining: Math.max(0, this.matchSeconds - this.elapsed), winner: this.winner,
      hold: { playerId: this.holdLeader, seconds: this.holdSeconds },
      players: [...this.players.values()], regions: this.regions, contests: [...this.contests.values()],
      leaderboard: [...this.players.values()].map(player => ({ id: player.id, name: player.name, color: player.color, regions: this.regions.filter(region => region.ownerId === player.id).length }))
        .sort((a, b) => b.regions - a.regions || a.name.localeCompare(b.name)).slice(0, 10)
    };
  }
}
