import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BALANCE_TARGETS, aggregatePlaytests, buildPlaytestReport } from '../server/playtest.js';
import { Game } from '../server/game.js';

test('playtest report measures authoritative events against immutable targets', () => {
  const telemetry={balanceVersion:'0.2',events:[
    {type:'region-change',at:8,fromCompanyId:null,toCompanyId:'a'},
    {type:'research-complete',at:39,companyId:'a'},
    {type:'contest-start',at:60,rivalContest:true},
    {type:'contest-end',at:72,duration:12},
    {type:'treatment-output',at:300,treatment:'immunotherapy'},
    {type:'programme-depleted',at:350}
  ],companies:{a:{completedResearch:7}},totals:{dispatches:2,contestSeconds:12,programmes:1,treatmentOutput:{medicine:70,radiotherapy:15,targeted:5,immunotherapy:10,vaccine:0}}};
  const report=buildPlaytestReport(telemetry,{elapsed:720,result:{type:'timed'}});
  assert.equal(Object.isFrozen(BALANCE_TARGETS),true);
  assert.deepEqual(Object.fromEntries(Object.entries(report.targets).map(([key,value])=>[key,value.status])),{opening:'on-target',neutralCapture:'on-target',firstResearch:'on-target',firstContest:'on-target',ordinaryContest:'on-target',advancedProduct:'on-target',completedResearch:'on-target',specialistProduction:'on-target',programmeCounterplay:'on-target'});
  assert.equal(report.complete,true);assert.equal(report.observations.victoryType,'timed');
  assert.equal(report.observations.completedContests,1);
});

test('playtest aggregation classifies incomplete matches and missing samples', () => {
  const finished=buildPlaytestReport({events:[{type:'research-complete',at:40}],companies:{},totals:{}},{result:{type:'dominance'}});
  const aggregate=aggregatePlaytests([finished,buildPlaytestReport({events:[],totals:{}})]);
  assert.equal(aggregate.matches,1);assert.equal(aggregate.submitted,2);assert.equal(aggregate.targets.firstResearch.mean,40);assert.equal(aggregate.targets.neutralCapture.samples,1);assert.equal(aggregate.targets.neutralCapture.missing,1);assert.deepEqual(aggregate.victories,{dominance:1});
  assert.equal(aggregate.victoryDistribution.dominance,1);assert.equal(aggregate.dominanceShare,1);
});

test('snapshots and the client expose live balance observations', async () => {
  const game=new Game({columns:2,rows:2,seed:'report'}), state=game.snapshot();
  assert.equal(state.playtest.balanceVersion,state.balance.version);assert.equal(state.playtest.targets.firstContest.status,'pending');
  const [html,client]=await Promise.all([readFile(new URL('../public/index.html',import.meta.url),'utf8'),readFile(new URL('../public/client.js',import.meta.url),'utf8')]);
  assert.match(html,/id="playtest-report"/);assert.match(html,/id="playtest-summary"/);assert.match(client,/state\.playtest/);assert.match(client,/target\.status/);assert.match(client,/completed contests/);
});

test('game telemetry records first product output and completed contest episodes', () => {
  let id=0;const game=new Game({columns:2,rows:1,seed:'episodes',id:()=>`episode-${++id}`}),a=game.addPlayer('A'),b=game.addPlayer('B');
  game.start(a,0);game.start(b,1);game.regions[0].inventories.medicine=120;game.dispatch(a,0,1,50,'medicine');
  game.tick(3);assert.ok(game.telemetry.events.some(event=>event.type==='contest-start'&&event.regionId===1));
  game.regions[1].campaigns={};game.syncContests();
  assert.ok(game.telemetry.events.some(event=>event.type==='contest-end'&&event.regionId===1&&event.duration>=0));
  assert.equal(game.telemetry.events.filter(event=>event.type==='treatment-output'&&event.treatment==='medicine').length,1);
});
