import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game } from '../server/game.js';
import { AlertTransitions } from '../public/alert-transitions.js';

const source = name => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');
const makeGame=()=>{let id=0;return new Game({random:()=>.2,id:()=>`interface-${++id}`});};

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

test('client includes the complete controls, feedback, keyboard access, and non-colour map cues',async()=>{
  const [html,clientSource,alerts,css]=await Promise.all([source('index.html'),source('client.js'),source('alert-transitions.js'),source('style.css')]),client=clientSource+alerts;
  assert.match(html,/id="specialty"/);assert.match(html,/id="surrender"/);assert.match(html,/tabindex="0"/);assert.match(html,/aria-label="Hospital network map/);assert.match(html,/Operational alerts/);
  for(const command of ["type:'pin'","type:'programme'","type:'withdraw'","type:'research'","type:'surrender'"])assert.match(client,new RegExp(command));
  assert.match(client,/ArrowLeft/);assert.match(client,/New supply contest/);assert.match(client,/Production is blocked/);assert.match(client,/Dominance hold started/);assert.match(client,/contestParties/);assert.match(client,/◆/);assert.match(client,/initials/);assert.match(css,/canvas:focus/);
});

const alertState=({owner='me',acquiredAt=1,blocked=false,holding=false,holdStartedAt=null,overCapacity=false}={})=>({
  hold:{startedAt:holdStartedAt},regions:[{id:0,name:'Region 1',ownerId:owner,acquiredAt,campaigns:{},overCapacity,programme:null}],
  players:[{id:'me',completed:[],unusedManufacturing:0,manufacturingFunding:blocked?10:0,manufacturingSpend:blocked?0:5,dominance:{holding,regions:4,threshold:4}}]
});

test('alert transitions distinguish a recapture followed by a second loss',()=>{
  const tracker=new AlertTransitions(),owned=alertState(),lost=alertState({owner:'rival'}),recaptured=alertState({acquiredAt:20}),lostAgain=alertState({owner:'rival',acquiredAt:20});
  const first=tracker.collect(lost,owned,'me'),unchanged=tracker.collect(lost,lost,'me'),second=tracker.collect(lostAgain,recaptured,'me');
  assert.equal(first.length,1);assert.equal(unchanged.length,0);assert.equal(second.length,1);assert.notEqual(first[0].key,second[0].key);
});

test('alert transitions distinguish dominance reset followed by a new hold',()=>{
  const tracker=new AlertTransitions(),idle=alertState(),firstHold=alertState({holding:true,holdStartedAt:10}),reset=alertState(),secondHold=alertState({holding:true,holdStartedAt:30});
  const first=tracker.collect(firstHold,idle,'me'),unchanged=tracker.collect(firstHold,firstHold,'me'),second=tracker.collect(secondHold,reset,'me');
  assert.equal(first.length,1);assert.equal(unchanged.length,0);assert.equal(second.length,1);assert.notEqual(first[0].key,second[0].key);
});

test('alert transitions distinguish manufacturing blockage that clears and returns',()=>{
  const tracker=new AlertTransitions(),clear=alertState(),blocked=alertState({blocked:true});
  const first=tracker.collect(blocked,clear,'me'),unchanged=tracker.collect(blocked,blocked,'me'),second=tracker.collect(blocked,clear,'me');
  assert.equal(first.length,1);assert.equal(unchanged.length,0);assert.equal(second.length,1);assert.notEqual(first[0].key,second[0].key);
});
