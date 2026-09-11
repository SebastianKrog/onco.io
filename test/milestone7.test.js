import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BALANCE, getBalance } from '../server/balance.js';
import { Game, replayMatch } from '../server/game.js';

const makeGame=()=>{let id=0;return new Game({random:()=>.25,id:()=>`m7-${++id}`,seed:'milestone-7',columns:2,rows:2,matchSeconds:5});};

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
  for(let i=0;i<8;i++)game.tick(.25);
  const record=structuredClone(game.exportReplay()),result=replayMatch(record);
  assert.equal(result.ok,true,JSON.stringify(result.differences));assert.equal(result.game.boundarySnapshots.length,record.boundaries.length);
  record.boundaries[1].digest='corrupt';assert.equal(replayMatch(record).ok,false);
});

test('client displays versioned match record and aggregate telemetry',async()=>{
  const [html,client]=await Promise.all([readFile(new URL('../public/index.html',import.meta.url),'utf8'),readFile(new URL('../public/client.js',import.meta.url),'utf8')]);
  assert.match(html,/id="match-record"/);assert.match(client,/state\.balance\?\.version/);assert.match(client,/contest-seconds/);
});
