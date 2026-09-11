import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game } from '../server/game.js';
import { RELEASE_GATE, evaluateReleaseGate } from '../server/release.js';

test('release gate requires seven check classes for every supported lobby size', () => {
  assert.deepEqual(RELEASE_GATE.lobbySizes,[20,30,40]);assert.equal(RELEASE_GATE.acceptanceScenarios.length,22);assert.equal(Object.isFrozen(RELEASE_GATE),true);
  const evidence={checks:{},acceptanceScenarios:{},playtestMatches:{20:1,30:1,40:1},deviationsDocumented:true};
  for(const check of RELEASE_GATE.checks)evidence.checks[check]=Object.fromEntries(RELEASE_GATE.lobbySizes.map(size=>[size,true]));
  for(const scenario of RELEASE_GATE.acceptanceScenarios)evidence.acceptanceScenarios[scenario]=true;
  assert.equal(evaluateReleaseGate(evidence).ready,true);
  assert.equal(new Game({columns:2,rows:2,releaseEvidence:evidence}).snapshot().releaseGate.ready,true);
  evidence.checks.load[40]=false;const failed=evaluateReleaseGate(evidence);assert.equal(failed.ready,false);assert.ok(failed.blockers.includes('load checks'));
});

test('missing evidence remains visibly blocked on server and client', async () => {
  const state=new Game({columns:2,rows:2}).snapshot(),gate=state.releaseGate;assert.equal(gate.ready,false);assert.ok(gate.blockers.includes('multiplayer playtests'));assert.equal(gate.acceptanceScenarios.length,22);assert.equal(state.acceptance.complete,true);
  const [html,client]=await Promise.all([readFile(new URL('../public/index.html',import.meta.url),'utf8'),readFile(new URL('../public/client.js',import.meta.url),'utf8')]);
  assert.match(html,/id="release-status"/);assert.match(client,/state\.releaseGate/);assert.match(client,/evidence groups/);
});
