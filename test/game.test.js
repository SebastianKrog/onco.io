import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MAP, PROFILES, TREATMENTS } from '../server/game.js';

const makeGame = options => { let id = 0; return new Game({ random: () => 0.25, id: () => `p${++id}`, ...options }); };

test('builds a profiled map and sanitized company records', () => {
  const game = makeGame(); const player = game.addPlayer('<A very long company name!>');
  assert.equal(game.regions.length, MAP.columns * MAP.rows);
  assert.deepEqual(game.regions.slice(0, 4).map(region => region.profile), PROFILES);
  assert.equal(player.name, 'A very long compan'); assert.deepEqual(player.unlocked, ['medicine']);
  assert.equal(game.renamePlayer(player, '   '), true); assert.equal(player.name, 'Researcher');
});

test('establishes one valid foothold and identifies orthogonal neighbors', () => {
  const game = makeGame(); const player = game.addPlayer();
  assert.equal(game.handle(player.id, { type: 'start', regionId: 0 }), true);
  assert.equal(game.regions[0].ownerId, player.id); assert.equal(player.focus, 'solid');
  assert.equal(game.start(player, 1), false); assert.equal(game.adjacent(0, 1), true);
  assert.equal(game.adjacent(0, 8), true); assert.equal(game.adjacent(0, 9), false);
  const rival = game.addPlayer(); assert.equal(game.start(rival, 0), false); assert.equal(game.start(rival, 999), false);
});

test('validates allocation totals, treatment selection, messages, and finished matches', () => {
  const game = makeGame(); const player = game.addPlayer();
  assert.equal(game.allocate(player), false); assert.equal(game.allocate(player, { research: 90, manufacturing: 90, infrastructure: 90 }), false);
  assert.equal(game.handle(player.id, { type: 'allocate', allocation: { research: 50, manufacturing: 30, infrastructure: 20 } }), true);
  assert.deepEqual(player.allocation, { research: 50, manufacturing: 30, infrastructure: 20 });
  assert.equal(game.selectTreatment(player, 'targeted'), false); player.unlocked.push('targeted');
  assert.equal(game.handle(player.id, { type: 'selectTreatment', treatment: 'targeted' }), true);
  assert.equal(game.handle('absent', {}), false); assert.equal(game.handle(player.id, { type: 'unknown' }), false);
  game.winner = player.id; assert.equal(game.handle(player.id, { type: 'join', name: 'Nope' }), false);
});

test('commits stock to attack, specializes, combines attacks, and reinforces', () => {
  const game = makeGame(); const player = game.addPlayer('Alpha'); const rival = game.addPlayer('Beta');
  game.start(player, 0); game.start(rival, 8); player.unlocked.push('targeted'); player.selectedTreatment = 'targeted'; player.stock.targeted = 30;
  assert.equal(game.contest(player, 9, 8, 50), false); assert.equal(game.contest(player, 0, 2, 50), false);
  assert.equal(game.contest(player, 0, 8, 50), true); const firstPower = game.contests.get(8).power;
  assert.ok(firstPower > 15); assert.equal(player.stock.targeted, 15);
  assert.equal(game.contest(player, 0, 8, 100), true); assert.ok(game.contests.get(8).power > firstPower);
  player.stock.targeted = 2; assert.equal(game.contest(player, 0, 8, 100), false);
  player.stock.targeted = 10; const strength = game.regions[0].strength;
  game.regions[1].ownerId = player.id; assert.equal(game.handle(player.id, { type: 'contest', fromId: 1, toId: 0, commitment: 100 }), true);
  assert.ok(game.regions[0].strength > strength);
});

test('produces income, research, treatments, defenses, upkeep, and resolves contests', () => {
  const game = makeGame(); const player = game.addPlayer(); game.start(player, 0);
  for (let id = 1; id < 6; id += 1) game.regions[id].ownerId = player.id;
  player.research = 99; player.stock.medicine = 30; game.tick(5);
  assert.ok(player.revenue > 0); assert.ok(player.research > 100);
  assert.deepEqual(player.unlocked, Object.keys(TREATMENTS)); assert.ok(game.regions[0].strength > 35); assert.ok(player.stock.medicine > 0);
  const rival = game.addPlayer(); game.start(rival, 8);
  game.contests.set(8, { regionId: 8, attackerId: player.id, treatment: 'vaccine', power: 1000, defense: 1 });
  game.tick(1); assert.equal(game.regions[8].ownerId, player.id); assert.equal(game.contests.has(8), false);
  game.contests.set(9, { regionId: 9, attackerId: rival.id, treatment: 'medicine', power: 0.01, defense: 100 }); game.tick(1);
  assert.equal(game.contests.has(9), false); game.winner = player.id; const elapsed = game.elapsed; game.tick(1); assert.equal(game.elapsed, elapsed);
});

test('awards hold and timer victories and exposes safe snapshots', () => {
  const game = makeGame({ matchSeconds: 10 }); const alpha = game.addPlayer('Alpha'); const beta = game.addPlayer('Beta');
  for (let id = 0; id < 24; id += 1) game.regions[id].ownerId = alpha.id;
  game.checkVictory(30); assert.equal(game.winner, null); assert.equal(game.holdLeader, alpha.id);
  game.checkVictory(30); assert.equal(game.winner, alpha.id);
  const snapshot = game.snapshot(); assert.equal(snapshot.winner, alpha.id); assert.equal(snapshot.leaderboard[0].regions, 24); assert.equal(snapshot.contests.length, 0);
  const timed = makeGame({ matchSeconds: 1 }); const leader = timed.addPlayer('Leader'); timed.start(leader, 0); timed.tick(1);
  assert.equal(timed.winner, leader.id);
  const empty = makeGame({ matchSeconds: 1 }); empty.tick(1); assert.equal(empty.winner, null); assert.equal(empty.holdLeader, null);
  assert.equal(beta.started, false);
});
