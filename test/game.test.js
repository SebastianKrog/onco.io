import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE_VERSION, DEFAULT_RESEARCH, Game, MAP, PROFILES, RESEARCH, TREATMENTS, treatmentForce } from '../server/game.js';

const makeGame = options => { let id = 0; return new Game({ random: () => 0.25, id: () => `id-${++id}`, ...options }); };
const advance = (game, seconds) => { for (let time = 0; time < seconds; time += 0.25) game.tick(0.25); };

test('constructs the versioned hex map and complete company defaults', () => {
  const game = makeGame();
  const player = game.addPlayer('<A very long company name!>');
  assert.equal(BALANCE_VERSION, '0.2');
  assert.equal(game.regions.length, MAP.columns * MAP.rows);
  assert.deepEqual(game.regions.slice(0, 4).map(region => region.profile), PROFILES);
  assert.equal(game.regions[0].neighbours.length, 2);
  assert.equal(game.adjacent(0, 1), true);
  assert.equal(game.adjacent(0, 16), true);
  assert.equal(game.adjacent(0, 17), false);
  assert.equal(player.name, 'A very long compan');
  assert.deepEqual(player.allocation, { research: 20, manufacturing: 65, infrastructure: 15 });
  assert.deepEqual(player.researchQueue, DEFAULT_RESEARCH);
  assert.equal(Object.values(RESEARCH).reduce((sum, project) => sum + project[2], 0), 2560);
  assert.equal(Object.values(RESEARCH).reduce((sum, project) => sum + project[3], 0), 745);
  assert.equal(game.renamePlayer(player, '   '), true);
  assert.equal(player.name, 'Researcher');
});

test('queues placement commands, consumes duplicate IDs, and records outcomes', () => {
  const game = makeGame({ placementSeconds: .25 }); const { player } = game.connect(); game.connect();
  assert.equal(game.handle(player.id, { type: 'start', regionId: game.pads[0], specialty: 'blood', commandId: 'start' }), true);
  assert.equal(game.regions[game.pads[0]].ownerId, null);
  assert.equal(game.handle(player.id, { type: 'start', regionId: game.pads[1], commandId: 'start' }), false);
  assert.equal(game.lastRejection, 'duplicate_command');
  game.tick(.25);
  assert.equal(game.phase, 'active'); assert.equal(game.players.size, 20);
  assert.equal(game.regions[game.pads[0]].ownerId, player.id);
  assert.equal(game.regions[game.pads[0]].inventories.medicine, 120);
  assert.equal(player.specialty, 'blood');
  assert.equal(game.commandLog[0].status, 'applied');
});

test('validates budgets, products, priorities, pins, surrender and disconnect automation', () => {
  const game = makeGame(); const player = game.addPlayer(); game.start(player, 0);
  assert.equal(game.allocate(player), false);
  assert.equal(game.allocate(player, { research: 33, manufacturing: 33, infrastructure: 34 }), false);
  assert.equal(game.allocate(player, { research: 90, manufacturing: 90, infrastructure: 90 }), false);
  assert.equal(game.allocate(player, { research: 40, manufacturing: 40, infrastructure: 20 }), true);
  assert.deepEqual(player.allocation, { research: 20, manufacturing: 65, infrastructure: 15 });
  game.tick(); assert.deepEqual(player.allocation, { research: 40, manufacturing: 40, infrastructure: 20 });
  assert.equal(game.selectTreatment(player, 'targeted'), false);
  player.completed.push('R03', 'R04'); player.unlocked = game.unlocks(player);
  assert.equal(game.selectTreatment(player, 'targeted'), true);
  assert.equal(game.selectTreatment(player, 'medicine'), false);
  assert.equal(game.prioritizeResearch(player, 'R10'), true);
  assert.deepEqual(player.researchQueue.slice(0, 3), ['R08', 'R09', 'R10']);
  assert.equal(game.prioritizeResearch(player, 'bad'), false);
  assert.equal(game.setPin(player, 'production', 0), true);
  assert.equal(game.setPin(player, 'invalid', 0), false);
  assert.equal(game.handle(player.id, { type: 'surrender', commandId: 'surrender' }), true); game.tick();
  assert.equal(player.bot, true);
  const disconnected = game.addPlayer(); game.start(disconnected, 2);
  assert.equal(game.removePlayer(disconnected.id), true);
  assert.equal(disconnected.bot, false); assert.equal(game.removePlayer('missing'), false);
  advance(game, 30.25); assert.equal(disconnected.bot, true);
});

test('economy completes R02 at 39 seconds and observes processing/storage limits', () => {
  const game = makeGame(); const player = game.addPlayer(); game.start(player, 0);
  advance(game, 0.25);
  assert.equal(player.gross, 11.4); assert.equal(player.upkeep, 1.1); assert.equal(player.net, 10.3);
  assert.ok(player.production <= 8); assert.equal(game.storageCap(game.regions[0]), 300);
  advance(game, 38.75);
  assert.ok(player.completed.includes('R02'));
  assert.equal(Number(player.researchProgress.R02.toFixed(2)), 80);
  assert.ok(game.storageUsed(game.regions[0]) <= 300);
  player.completed.push('R01'); game.regions[0].inventories.medicine = 0;
  game.manufacture(player, 100, 0.25, [game.regions[0]]);
  assert.ok(player.production <= 8.8);
  assert.equal(treatmentForce(player, 'medicine', 'blood'), 1.15);
});

test('applies every treatment suitability and defensive research modifier', () => {
  const game = makeGame(); const player = game.addPlayer();
  player.specialty = 'solid'; player.targetedIndications = ['solid'];
  assert.equal(treatmentForce(player, 'radiotherapy', 'solid'), 2.7);
  assert.equal(treatmentForce(player, 'targeted', 'solid'), 4);
  assert.equal(treatmentForce(player, 'targeted', 'blood'), 1.875);
  assert.ok(Math.abs(treatmentForce(player, 'immunotherapy', 'mixed') - 4.05) < 1e-9);
  assert.ok(Math.abs(treatmentForce(player, 'vaccine', 'rare') - 2.8) < 1e-9);
  assert.equal(treatmentForce(player, 'radiotherapy', 'blood', true), 1.265);
  player.completed.push('R07'); assert.ok(Math.abs(treatmentForce(player, 'radiotherapy', 'blood', true) - 1.43) < 1e-9);
});

test('dispatches local supply, routes transfers and halts a broken route', () => {
  const game = makeGame(); const player = game.addPlayer(); game.start(player, 0);
  game.regions[1].ownerId = player.id; game.regions[2].ownerId = player.id;
  assert.equal(game.dispatch(player, 0, 2, 50, 'medicine'), true);
  assert.equal(game.regions[0].inventories.medicine, 60);
  assert.deepEqual(game.convoys[0].path, [0, 1, 2]); assert.equal(game.convoys[0].edgeTime, 3);
  advance(game, 3); game.regions[2].ownerId = null; advance(game, 3);
  assert.equal(game.convoys.length, 0);
  assert.ok(game.regions[2].campaigns[player.id]);
  assert.equal(game.dispatch(player, 0, 17, 50, 'medicine'), false);
  assert.equal(game.lastRejection, 'no_route');
  game.regions[0].dispatchAvailableAt = 0; game.regions[0].inventories.medicine = 1;
  assert.equal(game.dispatch(player, 0, 1, 10, 'medicine'), false);
  assert.equal(game.lastRejection, 'packet_too_small');
});

test('R11 freezes faster edge timing and friendly arrivals respect storage', () => {
  const game = makeGame(); const player = game.addPlayer(); game.start(player, 0); game.regions[1].ownerId = player.id;
  player.completed.push('R11'); game.regions[0].inventories.medicine = 100;
  assert.equal(game.dispatch(player, 0, 1, 50, 'medicine'), true);
  assert.ok(Math.abs(game.convoys[0].edgeTime - 2.4) < 1e-9);
  game.regions[1].level = 1; game.regions[1].inventories.medicine = 295; advance(game, 2.5);
  assert.equal(game.regions[1].inventories.medicine, 300);
});

test('deterministic contest reproduces the 60 versus 30 reference result', () => {
  const game = makeGame(); const attacker = game.addPlayer(); attacker.started = true; attacker.specialty = 'solid';
  const region = game.regions[0]; region.protection = 30; region.campaigns[attacker.id] = { medicine: 60, radiotherapy: 0, targeted: 0, immunotherapy: 0, vaccine: 0 };
  let seconds = 0; while (region.ownerId !== attacker.id && seconds < 10) { game.resolveContests(0.25, seconds + 0.25); seconds += 0.25; }
  assert.equal(seconds, 3.25);
  assert.ok(Math.abs(region.inventories.medicine - 42.2) < 0.02);
  assert.equal(region.protection, 0); assert.equal(region.dispatchAvailableAt, 8.25);
});

test('programmes activate, expire, cancel on loss and withdrawals retain exactly 80%', () => {
  const game = makeGame(); const player = game.addPlayer(); game.start(player, 0); player.completed.push('R09');
  const region = game.regions[0]; region.inventories.vaccine = 10;
  assert.equal(game.activateProgramme(player, 0), true); assert.equal(region.inventories.vaccine, 0);
  game.expireProgrammes(8); assert.equal(region.programme.protection, 60);
  game.expireProgrammes(99); assert.equal(region.programme, null);
  region.campaigns[player.id] = { medicine: 10, radiotherapy: 2, targeted: 0, immunotherapy: 0, vaccine: 0 };
  game.regions[1].ownerId = player.id;
  assert.equal(game.withdraw(player, 0, 1), true);
  assert.equal(game.convoys[0].supply.medicine, 8); assert.equal(game.convoys[0].supply.radiotherapy, 1.6);
  assert.equal(region.campaigns[player.id], undefined);
});

test('captures downgrade once, disputes, regeneration, elimination and victory are deterministic', () => {
  const game = makeGame({ matchSeconds: 1 }); const alpha = game.addPlayer('Alpha'); const beta = game.addPlayer('Beta');
  game.start(alpha, 0); game.start(beta, 20); const region = game.regions[3]; region.level = 2;
  region.campaigns[alpha.id] = { medicine: 450, radiotherapy: 0, targeted: 0, immunotherapy: 0, vaccine: 0 };
  game.capture(region, alpha.id, 2); assert.equal(region.level, 1); assert.equal(game.storageUsed(region), 450);
  region.protection = 0; region.quietTime = 5; game.regenerate(0.25); assert.equal(region.protection, 0.75);
  game.capture(region, null, 3, true); assert.equal(region.ownerId, null); assert.equal(region.disputed, true);
  beta.eliminated = true; game.checkVictory(0); assert.equal(game.winner, alpha.id); assert.equal(game.result.type, 'last-standing');
  const timed = makeGame({ matchSeconds: 0.25 }); const leader = timed.addPlayer(); timed.start(leader, 0); timed.tick(0.25);
  assert.equal(timed.winner, leader.id); assert.equal(timed.result.type, 'timed');
  const snap = timed.snapshot(); assert.equal(snap.version, '0.2'); assert.equal(snap.leaderboard[0].regions, 1);
});

test('enforces foreign commitments, aggregates arrivals, reconnects, and shares exact timed ties', () => {
  const game = makeGame({ matchSeconds: 0.25 }); const alpha = game.addPlayer('Alpha'); const beta = game.addPlayer('Beta');
  game.start(alpha, 0); game.start(beta, 4);
  for (const id of [1, 2, 3]) { game.regions[id].ownerId = alpha.id; game.regions[id].inventories.medicine = 20; }
  game.regions[0].inventories.medicine = 120;
  for (const [index, target] of [16, 17, 18].entries()) {
    const source = index; game.regions[source].dispatchAvailableAt = 0;
    assert.equal(game.dispatch(alpha, source, target, 50, 'medicine'), true);
  }
  game.regions[3].dispatchAvailableAt = 0;
  assert.equal(game.dispatch(alpha, 3, 19, 50, 'medicine'), false);
  assert.equal(game.lastRejection, 'foreign_target_limit');

  const transfer = makeGame(); const owner = transfer.addPlayer(); transfer.start(owner, 0); transfer.regions[1].ownerId = owner.id;
  owner.allocation = { research: 100, manufacturing: 0, infrastructure: 0 };
  transfer.regions[0].inventories.medicine = 40;
  assert.equal(transfer.dispatch(owner, 0, 1, 50, 'medicine'), true);
  transfer.regions[0].dispatchAvailableAt = 0;
  assert.equal(transfer.dispatch(owner, 0, 1, 50, 'medicine'), true);
  transfer.regions[1].level = 1; transfer.regions[1].inventories.medicine = 285; advance(transfer, 3);
  assert.equal(transfer.regions[1].inventories.medicine, 300);
  transfer.removePlayer(owner.id); assert.equal(transfer.reconnectPlayer(owner.id), true); assert.equal(owner.bot, false);

  for (const region of game.regions) region.ownerId = null;
  game.regions[0].ownerId = alpha.id; game.regions[4].ownerId = beta.id;
  alpha.regionSeconds = beta.regionSeconds = 10; game.elapsed = game.matchSeconds; game.checkVictory(0);
  assert.deepEqual(new Set(game.result.winners), new Set([alpha.id, beta.id]));
});

test('supports every lobby template, fills vacancies, and starts clocks simultaneously', () => {
  for (const [size, dimensions] of [[20,[16,10]],[30,[20,12]],[40,[20,16]]]) {
    const game=makeGame({lobbySize:size,placementSeconds:.5});
    const {player}=game.connect('Human');
    assert.deepEqual([game.map.columns,game.map.rows],dimensions);
    assert.equal(game.phase,'placement'); assert.equal(game.elapsed,0);
    game.handle(player.id,{type:'start',regionId:game.pads[0],commandId:'pad'});
    game.tick(.25); assert.equal(game.phase,'placement'); assert.equal(game.elapsed,0);
    game.tick(.25); assert.equal(game.phase,'active'); assert.equal(game.elapsed,0);
    assert.equal(game.players.size,size); assert.ok([...game.players.values()].every(p=>p.started));
    assert.ok([...game.players.values()].filter(p=>p.bot).every(p=>p.nextBotAt===0));
  }
  assert.throws(()=>new Game({lobbySize:25}),RangeError);
});

test('orders same-boundary commands, rejects invalid phases, and freezes a result', () => {
  const game=makeGame({placementSeconds:.25,matchSeconds:.25}); const {player}=game.connect();
  assert.equal(game.handle(player.id,{type:'allocate',allocation:{research:40,manufacturing:40,infrastructure:20},commandId:'early'}),false);
  assert.equal(game.lastRejection,'invalid_phase');
  game.handle(player.id,{type:'start',regionId:game.pads[0],commandId:'start'},20); game.tick(.25);
  game.handle(player.id,{type:'allocate',allocation:{research:40,manufacturing:40,infrastructure:20},commandId:'one'},30);
  game.handle(player.id,{type:'allocate',allocation:{research:10,manufacturing:80,infrastructure:10},commandId:'two'},10);
  game.tick(.25);
  assert.deepEqual(player.allocation,{research:10,manufacturing:80,infrastructure:10});
  assert.deepEqual(game.commandLog.slice(-2).map(x=>x.sequence),[3,4]);
  assert.equal(game.phase,'finished'); const frozen=JSON.stringify(game.snapshot()); game.tick(5);
  assert.equal(JSON.stringify(game.snapshot()),frozen);
  assert.equal(game.handle(player.id,{type:'join',name:'Changed',commandId:'late'}),false);
  assert.equal(game.lastRejection,'match_finished');
});

test('spectates late connections and restores reconnect identity unless surrendered', () => {
  const game=makeGame({placementSeconds:.25}); const first=game.connect('First'); game.tick(.25);
  assert.equal(game.connect().spectator,true);
  game.removePlayer(first.player.id); advance(game,30.25); assert.equal(first.player.bot,true);
  assert.equal(game.reconnect(first.credential),first.player); assert.equal(first.player.bot,false);
  first.player.surrendered=true; game.removePlayer(first.player.id);
  assert.equal(game.reconnect(first.credential),null);
  assert.equal(game.reconnect('invalid'),null);
});
