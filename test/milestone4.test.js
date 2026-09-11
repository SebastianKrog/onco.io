import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';

const makeGame=()=>{let id=0;return new Game({random:()=>.2,id:()=>`m4-${++id}`});};
const inventory=(medicine=0,radiotherapy=0,targeted=0,immunotherapy=0,vaccine=0)=>({medicine,radiotherapy,targeted,immunotherapy,vaccine});
const advance=(game,seconds)=>{for(let elapsed=0;elapsed<seconds;elapsed+=.25)game.tick(.25);};

test('dispatch preferences are authoritative, validated, and independent of manufacturing',()=>{
  const game=makeGame(),player=game.addPlayer();game.start(player,0);player.completed.push('R06');player.unlocked=game.unlocks(player);player.selectedTreatment='radiotherapy';
  assert.equal(game.setDispatchPreferences(player,75,'medicine'),true);assert.equal(player.commitment,75);assert.equal(player.filter,'medicine');assert.equal(player.selectedTreatment,'radiotherapy');
  assert.equal(game.setDispatchPreferences(player,72,'all'),false);assert.equal(game.lastRejection,'invalid_commitment');assert.equal(player.commitment,75);
  assert.equal(game.setDispatchPreferences(player,50,'unknown'),false);assert.equal(game.lastRejection,'invalid_filter');assert.equal(player.filter,'medicine');
  assert.equal(game.dispatch(player,0,1),true);assert.equal(game.convoys[0].supply.medicine,90);assert.equal(game.convoys[0].supply.radiotherapy,0);
});

test('snapshot exposes every dispatch limit and per-target committed capacity',()=>{
  const game=makeGame(),player=game.addPlayer();game.start(player,0);game.regions[0].inventories.medicine=100;
  assert.equal(game.dispatch(player,0,1,50,'medicine'),true);const status=game.snapshot().players.find(p=>p.id===player.id).dispatchStatus;
  assert.deepEqual(status,{convoySlotsUsed:1,convoySlots:16,foreignTargetsUsed:1,foreignTargetSlots:3,targetCommitments:{1:50}});
  game.regions[0].dispatchAvailableAt=0;game.regions[0].inventories.medicine=2000;assert.equal(game.dispatch(player,0,1,50,'medicine'),false);assert.equal(game.lastRejection,'target_capacity');
});

test('BFS routes freeze R11 timing, survive source loss, and halt at a broken reached node',()=>{
  const game=makeGame(),player=game.addPlayer();game.start(player,0);player.completed.push('R11');for(const id of [1,2])game.regions[id].ownerId=player.id;
  assert.equal(game.dispatch(player,0,2,50,'medicine'),true);const convoy=game.convoys[0];assert.deepEqual(convoy.path,[0,1,2]);assert.ok(Math.abs(convoy.edgeTime-2.4)<1e-9);
  game.regions[0].ownerId=null;advance(game,2.5);assert.equal(game.convoys.length,1);game.regions[1].ownerId=null;advance(game,2.5);
  assert.equal(game.convoys.length,0);assert.ok(game.regions[1].campaigns[player.id]);assert.equal(game.routeInterruptions.length,1);assert.equal(game.routeInterruptions[0].regionId,1);
});

test('same-step arrivals aggregate before proportional admission and visibly discard excess',()=>{
  const game=makeGame(),player=game.addPlayer();game.start(player,0);game.regions[1].ownerId=player.id;game.regions[1].level=1;game.regions[1].inventories=inventory(280);
  game.convoys.push({id:'a',companyId:player.id,sourceId:0,targetId:1,path:[0,1],index:0,supply:inventory(20),capacity:20,edgeTime:3,dueAt:.25},{id:'b',companyId:player.id,sourceId:0,targetId:1,path:[0,1],index:0,supply:inventory(0,20),capacity:40,edgeTime:5,dueAt:.25});
  game.deliver(.25);assert.equal(game.convoys.length,0);assert.equal(game.storageUsed(game.regions[1]),300);assert.equal(game.arrivalReports.length,1);assert.equal(game.arrivalReports[0].incomingCapacity,60);assert.equal(game.arrivalReports[0].admittedCapacity,20);assert.equal(game.arrivalReports[0].discardedCapacity,40);assert.equal(game.arrivalReports[0].disposition,'excess_discarded');
});

test('withdrawal removes the full mixed campaign and retains exactly eighty percent in one slot',()=>{
  const game=makeGame(),player=game.addPlayer();game.start(player,1);const campaign=inventory(10,2,3,4,5);game.regions[0].campaigns[player.id]={...campaign};
  const before=game.convoys.length;assert.equal(game.withdraw(player,0,1),true);assert.equal(game.convoys.length,before+1);assert.equal(game.regions[0].campaigns[player.id],undefined);for(const key of Object.keys(campaign))assert.ok(Math.abs(game.convoys[0].supply[key]-campaign[key]*.8)<1e-10);
  game.regions[0].campaigns[player.id]=inventory(10);game.regions[1].ownerId=null;assert.equal(game.withdraw(player,0,1),false);assert.equal(game.lastRejection,'invalid_withdrawal');
});

test('incumbent exhaustion preserves multiple attackers in an ownerless persistent dispute',()=>{
  const game=makeGame(),owner=game.addPlayer(),alpha=game.addPlayer(),beta=game.addPlayer();game.start(owner,0);alpha.started=beta.started=true;alpha.specialty=beta.specialty='solid';const region=game.regions[0];region.level=2;region.protection=.5;region.inventories=inventory();region.campaigns[alpha.id]=inventory(10);region.campaigns[beta.id]=inventory(10);
  game.resolveContests(.25,.25);assert.equal(region.ownerId,null);assert.equal(region.disputed,true);assert.equal(region.level,2);assert.ok(region.campaigns[alpha.id].medicine>0);assert.ok(region.campaigns[beta.id].medicine>0);
  game.resolveContests(.25,.5);assert.equal(region.ownerId,null);assert.ok(region.campaigns[alpha.id]);assert.ok(region.campaigns[beta.id]);
});

test('simultaneous equal exhaustion retains prior ownership and capture downgrades once with over-capacity supply',()=>{
  const game=makeGame(),owner=game.addPlayer(),attacker=game.addPlayer();game.start(owner,0);attacker.started=true;attacker.specialty='solid';const region=game.regions[0];region.level=3;region.protection=0;region.inventories=inventory(100);region.campaigns[attacker.id]=inventory(100);
  for(let i=0;i<60&&region.campaigns[attacker.id];i++)game.resolveContests(.25,(i+1)*.25);assert.equal(region.ownerId,owner.id);
  region.inventories=inventory();region.protection=0;region.campaigns[attacker.id]=inventory(700);game.resolveContests(.25,20);assert.equal(region.ownerId,attacker.id);assert.equal(region.level,2);assert.ok(game.storageUsed(region)>game.storageCap(region));game.resolveContests(.25,20.25);assert.equal(region.level,2);
});

test('contest solver matches the remaining published two- and three-party examples',()=>{
  const attackCase=(attack,defense)=>{const game=makeGame(),player=game.addPlayer();player.started=true;player.specialty='solid';const region=game.regions[0];region.protection=defense;region.campaigns[player.id]=inventory(attack);let seconds=0;while(region.ownerId!==player.id&&region.campaigns[player.id]&&seconds<20){game.resolveContests(.25,seconds+.25);seconds+=.25;}return {game,player,region,seconds};};
  const win=attackCase(120,100);assert.equal(win.seconds,8.5);assert.ok(Math.abs(win.region.inventories.medicine-46.96)<.02);
  const loss=attackCase(80,120);assert.equal(loss.seconds,6);assert.ok(Math.abs(loss.region.protection-72.70)<.02);assert.equal(loss.region.ownerId,null);
  const game=makeGame(),owner=game.addPlayer(),a=game.addPlayer(),b=game.addPlayer();game.start(owner,0);a.started=b.started=true;a.specialty=b.specialty='solid';const region=game.regions[0];region.protection=100;region.inventories=inventory();region.campaigns[a.id]=inventory(100);region.campaigns[b.id]=inventory(100);let seconds=0;while((region.campaigns[a.id]||region.campaigns[b.id])&&seconds<20){game.resolveContests(.25,seconds+.25);seconds+=.25;}assert.equal(seconds,12.75);assert.equal(region.ownerId,owner.id);
});
