import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BALANCE, getBalance } from '../server/balance.js';
import { Game, replayMatch, treatmentForce } from '../server/game.js';

const makeGame=()=>{let id=0;return new Game({random:()=>.25,id:()=>`replay-${++id}`,seed:'replay-check',columns:2,rows:2,matchSeconds:5});};

test('balance configuration is complete, versioned, immutable, and used in metadata',()=>{
  for(const section of ['match','economy','treatments','research','infrastructure','movement','contest','programme','bots'])assert.ok(BALANCE[section]);
  assert.equal(Object.isFrozen(BALANCE),true);assert.equal(Object.isFrozen(BALANCE.treatments.medicine),true);
  assert.throws(()=>getBalance('missing'),/Unsupported balance version/);
  const state=makeGame().snapshot();assert.equal(state.balance,BALANCE);assert.equal(state.version,BALANCE.version);
});

test('telemetry separates actors and accumulates production, funding, routes, programmes, and results',()=>{
  const game=makeGame(),human=game.addPlayer('Human'),bot=game.addPlayer('Bot',{bot:true});game.start(human,0);game.start(bot,3);
  const target=game.regions[1];human.completed.push('R09');game.regions[0].inventories.vaccine=10;game.activateProgramme(human,0);
  game.regions[0].programme=null;game.regions[0].inventories.medicine=120;game.dispatch(human,0,1,50,'medicine');game.tick(.25);
  assert.ok(game.telemetry.totals.dispatches>=1);assert.ok(game.telemetry.totals.routes>=1);assert.equal(game.telemetry.totals.programmes,1);
  assert.ok(game.telemetry.totals.treatmentOutput.medicine>0);assert.ok(game.telemetry.events.some(e=>e.type==='dispatch'&&e.actor==='human'&&e.launchForceRatio!==undefined));
  game.finish(human,'timed');assert.equal(game.telemetry.victory.type,'timed');assert.equal(game.snapshot().telemetry,game.telemetry);assert.equal(target.id,1);
});

test('deterministic replay verifies every fixed-step boundary',()=>{
  const game=makeGame(),a=game.addPlayer('Alpha'),b=game.addPlayer('Beta');game.start(a,0);game.start(b,3);
  for(let i=0;i<20;i++)game.tick(.25);
  const record=structuredClone(game.exportReplay()),result=replayMatch(record);
  assert.equal(record.step,.25);assert.equal(record.boundaries.length,20);assert.deepEqual(record.boundaries.map(x=>x.at),Array.from({length:20},(_,i)=>(i+1)*.25));
  assert.equal(record.boundaries.filter(x=>x.at===record.result.at).length,1);
  assert.equal(result.ok,true,JSON.stringify(result.differences));assert.equal(result.game.boundarySnapshots.length,record.boundaries.length);
  record.boundaries[0].digest='corrupt';assert.equal(replayMatch(record).ok,false);
});

test('replay reports an intermediate divergence at its 250 ms boundary',()=>{
  const game=makeGame(),a=game.addPlayer('Alpha'),b=game.addPlayer('Beta');game.start(a,0);game.start(b,3);
  for(let i=0;i<20;i++)game.tick(.25);
  const record=structuredClone(game.exportReplay()),intermediate=record.boundaries.find(x=>x.at===2.5);intermediate.digest='divergent-intermediate-state';
  const result=replayMatch(record);assert.equal(result.ok,false);assert.deepEqual(result.differences,[{index:9,at:2.5}]);
});

test('replay reports a missing fixed-step boundary at its expected 250 ms timestamp',()=>{
  const game=makeGame(),a=game.addPlayer('Alpha'),b=game.addPlayer('Beta');game.start(a,0);game.start(b,3);
  for(let i=0;i<20;i++)game.tick(.25);
  const record=structuredClone(game.exportReplay());record.boundaries.splice(1,1);
  const result=replayMatch(record);assert.equal(result.ok,false);assert.deepEqual(result.differences,[{index:1,at:.5}]);
});

test('client displays versioned match record and aggregate telemetry',async()=>{
  const [html,client]=await Promise.all([readFile(new URL('../public/index.html',import.meta.url),'utf8'),readFile(new URL('../client/client.js',import.meta.url),'utf8')]);
  assert.match(html,/id="match-record"/);assert.match(client,/state\.balance\?\.version/);assert.match(client,/contest-seconds/);
});

test('an alternate balance drives economy, movement, contest, programme, bot and preview rules',async()=>{
  const alternate=structuredClone(BALANCE);alternate.version='test-alternate';alternate.match.step=.5;
  Object.assign(alternate.starting,{protection:9,medicine:40});Object.assign(alternate.economy,{grant:20,regionBase:7,levelIncome:0,operatingBase:2,operatingLevel:0,productionEfficiency:2});
  Object.assign(alternate.movement,{minimumPacket:30,dispatchCooldown:4,targetCapacity:55});alternate.treatments.medicine.edgeTime=9;
  alternate.treatmentProfiles.radiotherapy.solid=2;alternate.contest.forceShare=.5;alternate.contest.flatPressureCap=0;
  Object.assign(alternate.programme,{vaccineUnits:3,pendingSeconds:11});Object.assign(alternate.bots,{packetShares:[.2],neutralRatio:0,reinforcementCommitment:25});
  Object.assign(alternate.preview,{advantageRatio:3,comparableRatio:.25});
  const game=new Game({balance:alternate,random:()=>.2,id:(()=>{let n=0;return()=>`alt-${++n}`;})(),columns:2,rows:1,matchSeconds:20}),player=game.addPlayer('Alternate');game.start(player,0);
  assert.equal(game.regions[0].protection,9);assert.equal(game.regions[0].inventories.medicine,40);
  game.economy(player,.5,0,.5);assert.equal(player.gross,27);assert.equal(player.upkeep,2);assert.ok(player.production>0);
  game.regions[0].inventories.medicine=20;assert.equal(game.dispatch(player,0,1,100,'medicine'),false);game.regions[0].inventories.medicine=40;
  assert.equal(game.dispatch(player,0,1,100,'medicine'),true);assert.equal(game.convoys[0].edgeTime,9);assert.equal(game.regions[0].dispatchAvailableAt,4);
  assert.equal(treatmentForce(player,'radiotherapy','solid',false,alternate),alternate.treatments.radiotherapy.cost*2);
  const defender=game.regions[1];defender.protection=20;defender.campaigns[player.id]=game.emptyInventory();defender.campaigns[player.id].medicine=10;game.resolveContests(.5,.5);assert.equal(defender.protection,17.5);
  player.completed.push('R09');game.regions[0].inventories.vaccine=3;assert.equal(game.activateProgramme(player,0),true);assert.equal(game.regions[0].programme.completesAt,11);
  game.regions[0].programme=null;game.convoys=[];game.regions[0].dispatchAvailableAt=0;game.regions[0].inventories.medicine=200;const action=game.runBotTactical(player);assert.equal(action.commitment,20);
  const snapshot=game.snapshot();assert.equal(snapshot.balance,alternate);assert.equal(snapshot.balance.preview.advantageRatio,3);assert.equal(snapshot.balance.movement.targetCapacity,55);
  const client=await readFile(new URL('../client/client.js',import.meta.url),'utf8');assert.match(client,/state\.balance\.preview\.advantageRatio/);assert.match(client,/state\.balance\.movement\.targetCapacity/);
});

test('replay rejection remains explicit for unsupported historical balance versions',()=>{
  const game=makeGame(),player=game.addPlayer('Replay');game.start(player,0);game.tick();const record=game.exportReplay();record.balanceVersion='0.1';
  assert.throws(()=>replayMatch(record),/Unsupported balance version: 0\.1/);
});
