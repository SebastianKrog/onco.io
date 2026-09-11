import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BALANCE_TARGETS, aggregatePlaytests, buildPlaytestReport } from '../server/playtest.js';
import { Game } from '../server/game.js';

test('playtest report measures authoritative events against immutable targets', () => {
  const telemetry={balanceVersion:'0.2',events:[
    {type:'region-change',at:8,fromCompanyId:null,toCompanyId:'a'},
    {type:'research-complete',at:39,companyId:'a'},
    {type:'dispatch',at:60,launchForceRatio:1.5}
  ],companies:{a:{completedResearch:7}},totals:{dispatches:2,contestSeconds:12,programmes:1}};
  const report=buildPlaytestReport(telemetry,{elapsed:720,result:{type:'timed'}});
  assert.equal(Object.isFrozen(BALANCE_TARGETS),true);
  assert.deepEqual(Object.fromEntries(Object.entries(report.targets).map(([key,value])=>[key,value.status])),{neutralCapture:'on-target',firstResearch:'on-target',firstContest:'on-target',completedResearch:'on-target'});
  assert.equal(report.complete,true);assert.equal(report.observations.victoryType,'timed');
});

test('playtest aggregation excludes incomplete matches and missing samples', () => {
  const finished=buildPlaytestReport({events:[{type:'research-complete',at:40}],companies:{},totals:{}},{result:{type:'dominance'}});
  const aggregate=aggregatePlaytests([finished,buildPlaytestReport({events:[],totals:{}})]);
  assert.equal(aggregate.matches,1);assert.equal(aggregate.targets.firstResearch.mean,40);assert.equal(aggregate.targets.neutralCapture.samples,0);assert.deepEqual(aggregate.victories,{dominance:1});
});

test('snapshots and the client expose live balance observations', async () => {
  const game=new Game({columns:2,rows:2,seed:'report'}), state=game.snapshot();
  assert.equal(state.playtest.balanceVersion,state.balance.version);assert.equal(state.playtest.targets.firstContest.status,'pending');
  const [html,client]=await Promise.all([readFile(new URL('../public/index.html',import.meta.url),'utf8'),readFile(new URL('../public/client.js',import.meta.url),'utf8')]);
  assert.match(html,/id="playtest-report"/);assert.match(client,/state\.playtest/);assert.match(client,/target\.status/);
});
