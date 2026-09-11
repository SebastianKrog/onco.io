import test from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE } from '../server/balance.js';
import { aggregatePlaytests, buildPlaytestReport } from '../server/playtest.js';
import { runMatch, verifyArtifacts } from '../server/playtest-runner.js';

test('headless matches cover every lobby and are stable for a seed',()=>{
  for(const lobbySize of BALANCE.match.lobbySizes){const a=runMatch({lobbySize,seed:'small',matchSeconds:.25}),b=runMatch({lobbySize,seed:'small',matchSeconds:.25});assert.equal(a.replay.companies.length,lobbySize);assert.deepEqual(a,b);}
});

test('aggregation classifies missing and out-of-target samples as failures',()=>{
  const missing=buildPlaytestReport({balanceVersion:BALANCE.version,events:[],companies:{},totals:{}},{result:{type:'timed'}});
  const aggregate=aggregatePlaytests([missing],{minimumSamples:1});assert.equal(aggregate.targets.firstContest.samples,1);assert.equal(aggregate.targets.firstContest.missing,1);assert.equal(aggregate.targets.firstContest.pass,false);
  missing.targets.firstResearch.value=999;assert.equal(aggregatePlaytests([missing],{minimumSamples:1}).targets.firstResearch.pass,false);
});

test('verification rejects replay divergence, mixed versions, incomplete and malformed evidence',()=>{
  const artifacts=BALANCE.match.lobbySizes.map(lobbySize=>runMatch({lobbySize,seed:'verify',matchSeconds:.25}));
  const verification=verifyArtifacts(artifacts,{minimumSamples:1});assert.equal(verification.verified,true);for(const artifact of artifacts)assert.deepEqual(verification.replayBoundaries[artifact.lobbySize],{total:1,verified:1,divergences:0});
  const corrupt=structuredClone(artifacts);corrupt[0].replay.boundaries[0].digest='bad';assert.throws(()=>verifyArtifacts(corrupt,{minimumSamples:1}),/divergence/);
  const mixed=structuredClone(artifacts);mixed[0].balanceVersion='old';assert.throws(()=>verifyArtifacts(mixed,{minimumSamples:1}),/Mixed/);
  const incomplete=structuredClone(artifacts);incomplete[0].finalPlaytestReport.complete=false;assert.throws(()=>verifyArtifacts(incomplete,{minimumSamples:1}),/Incomplete/);
  assert.throws(()=>verifyArtifacts([{}],{minimumSamples:1}),/Mixed|Malformed/);
});
