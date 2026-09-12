import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game } from '../server/game.js';
import { AlertEventKeys, operationalAlerts } from '../public/alert-events.js';

const source = name => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');
const makeGame=()=>{let id=0;return new Game({random:()=>.2,id:()=>`interface-${++id}`});};
const alertSnapshot=({owner='me',acquiredAt=1,blocked=false,holding=false,elapsed=1}={})=>({elapsed,players:[{id:'me',unusedManufacturing:0,manufacturingFunding:blocked?10:0,manufacturingSpend:0,dominance:{holding,regions:holding?6:2,threshold:6}}],regions:[{id:0,name:'Region 1',ownerId:owner,acquiredAt,overCapacity:false,campaigns:{},programme:null}]});
const collectNotices=states=>{const keys=new AlertEventKeys(),result=[];for(let index=1;index<states.length;index++)result.push(...operationalAlerts(states[index-1],states[index],'me',keys));return result;};

test('alert instances survive recapture and identify a later second loss',()=>{
  const alerts=collectNotices([alertSnapshot(),alertSnapshot({owner:'rival',elapsed:2}),alertSnapshot({owner:'me',acquiredAt:3,elapsed:3}),alertSnapshot({owner:'rival',acquiredAt:3,elapsed:4})]).filter(alert=>alert.key.startsWith('loss:'));
  assert.equal(alerts.length,2);assert.notEqual(alerts[0].key,alerts[1].key);assert.match(alerts[0].key,/loss:0:1:1/);assert.match(alerts[1].key,/loss:0:3:2/);
});

test('alert instances survive a dominance reset and identify a new hold',()=>{
  const alerts=collectNotices([alertSnapshot(),alertSnapshot({holding:true,elapsed:2}),alertSnapshot({holding:true,elapsed:3}),alertSnapshot({holding:false,elapsed:4}),alertSnapshot({holding:true,elapsed:5})]).filter(alert=>alert.key.startsWith('dominance:'));
  assert.equal(alerts.length,2);assert.notEqual(alerts[0].key,alerts[1].key);
});

test('manufacturing blockage alerts once, then alerts again after clearing',()=>{
  const alerts=collectNotices([alertSnapshot(),alertSnapshot({blocked:true,elapsed:2}),alertSnapshot({blocked:true,elapsed:3}),alertSnapshot({blocked:false,elapsed:4}),alertSnapshot({blocked:true,elapsed:5})]).filter(alert=>alert.key.startsWith('blocked:'));
  assert.equal(alerts.length,2);assert.notEqual(alerts[0].key,alerts[1].key);
});

test('snapshot provides complete operational metrics and selected-region intelligence',()=>{
  const game=makeGame(),player=game.addPlayer('Calm Network');game.start(player,0);player.productionPin=0;player.developmentPin=0;player.researchSpend=2;player.infrastructureSpend=1;
  const state=game.snapshot(),company=state.players[0],region=state.regions[0];
  assert.equal(company.ownRegionCount,1);assert.equal(company.controlState,'connected');assert.deepEqual(company.effectiveSpending,{research:2,manufacturing:0,infrastructure:1});assert.equal(company.dominance.threshold,96);assert.equal(company.dominance.requiredSeconds,60);
  assert.equal(region.storageUsed,120);assert.equal(region.storageCapacity,300);assert.equal(region.overCapacity,false);assert.equal(region.productionEligible,true);assert.equal(region.contestParties[0].role,'incumbent');assert.equal(region.productionFocused,true);assert.equal(region.developmentFocused,true);
});

test('focus pins toggle, validate precisely, and surrender state is exposed',()=>{
  const game=makeGame(),player=game.addPlayer();game.start(player,0);
  assert.equal(game.setPin(player,'production',0),true);assert.equal(player.productionPin,0);assert.equal(game.setPin(player,'production',0),true);assert.equal(player.productionPin,null);
  assert.equal(game.setPin(player,'development',1),false);assert.equal(game.lastRejection,'pin_region_not_owned');assert.equal(game.setPin(player,'invalid',0),false);assert.equal(game.lastRejection,'invalid_pin_kind');
  player.surrendered=true;player.bot=true;assert.equal(game.snapshot().players[0].controlState,'surrendered');
});

test('completed research remains in the canonical twelve-node presentation after reprioritization',async()=>{
  const game=makeGame(),player=game.addPlayer();game.start(player,0);player.researchProgress.R02=80;game.applyCompletions();
  assert.ok(player.completed.includes('R02'));assert.equal(game.prioritizeResearch(player,'R08'),true);
  const state=game.snapshot(),company=state.players[0];
  assert.equal(state.researchOrder.length,12);assert.equal(new Set(state.researchOrder).size,12);assert.equal(company.researchQueue.includes('R02'),false);assert.equal(company.researchProgress.R02,80);assert.ok(company.completed.includes('R02'));
  const client=await source('client.js');assert.match(client,/for\(const id of state\.researchOrder\)/);assert.match(client,/complete=me\.completed\.includes\(id\)/);assert.match(client,/button\.disabled=complete/);assert.match(client,/queuePositions/);
});

test('client includes the complete controls, feedback, keyboard access, and non-colour map cues',async()=>{
  const [html,client,alerts,css]=await Promise.all([source('index.html'),source('client.js'),source('alert-events.js'),source('style.css')]);
  assert.match(html,/id="specialty"/);assert.match(html,/id="surrender"/);assert.match(html,/tabindex="0"/);assert.match(html,/aria-label="Hospital network map/);assert.match(html,/Operational alerts/);
  for(const command of ["type:'pin'","type:'programme'","type:'withdraw'","type:'research'","type:'surrender'"])assert.match(client,new RegExp(command));
  assert.match(client,/ArrowLeft/);assert.match(alerts,/New supply contest/);assert.match(alerts,/Production is blocked/);assert.match(alerts,/Dominance hold started/);assert.match(client,/contestParties/);assert.match(client,/◆/);assert.match(client,/initials/);assert.match(css,/canvas:focus/);
});
