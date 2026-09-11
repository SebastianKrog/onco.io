import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Game } from '../server/game.js';

const inventory=(medicine=0,radiotherapy=0,targeted=0,immunotherapy=0,vaccine=0)=>({medicine,radiotherapy,targeted,immunotherapy,vaccine});
const makeGame=()=>{let id=0;return new Game({random:()=>.2,id:()=>`m5-${++id}`});};
const company=(game,name='Bot')=>{const player=game.addPlayer(name,{bot:true});game.start(player,0);return player;};

test('continuity programmes report pending, finite protection, depletion, expiry, and loss cancellation',()=>{
  const game=makeGame(),player=company(game);player.completed.push('R09');const region=game.regions[0];region.inventories.vaccine=20;
  assert.equal(game.activateProgramme(player,0),true);assert.equal(region.inventories.vaccine,10);assert.deepEqual({pending:region.programme.pending,starts:region.programme.startedAt,completes:region.programme.completesAt},{pending:true,starts:0,completes:8});
  assert.equal(game.activateProgramme(player,0),false);assert.equal(game.lastRejection,'programme_unavailable');game.expireProgrammes(8);assert.equal(region.programme.maxProtection,60);assert.equal(region.programme.scheduledExpiryAt,98);
  game.consumeDefense(region,60);assert.equal(region.programme.protection,0);assert.ok(region.programme);assert.equal(game.activateProgramme(player,0),false);game.expireProgrammes(98);assert.equal(region.programme,null);
  game.elapsed=98;player.completed.push('R10');assert.equal(game.activateProgramme(player,0),true);game.expireProgrammes(106);assert.equal(region.programme.protection,75);assert.equal(region.programme.expiresAt,226);region.ownerId=null;game.expireProgrammes(107);assert.equal(region.programme,null);
});

test('bot continuity outranks reinforcement and dispatches an exact ten VAC objective',()=>{
  const game=makeGame(),bot=company(game),rival=game.addPlayer('Rival');rival.started=true;rival.specialty='solid';bot.completed.push('R09');game.regions[1].ownerId=bot.id;game.regions[1].inventories=inventory();game.regions[1].campaigns[rival.id]=inventory(10);game.regions[0].inventories=inventory(100,0,0,0,10);
  const action=game.runBotTactical(bot);assert.deepEqual(action,{type:'programme-supply',fromId:0,regionId:1,units:10});assert.equal(game.convoys.length,1);assert.equal(game.convoys[0].supply.vaccine,10);assert.equal(game.convoys[0].supply.medicine,0);assert.equal(game.regions[0].inventories.vaccine,0);
  game.deliver(5);assert.equal(game.regions[1].inventories.vaccine,10);const next=game.runBotTactical(bot);assert.equal(next.type,'programme');assert.equal(game.regions[1].programme.pending,true);
});

test('bot programme objective recovers from a broken route instead of remaining on vaccine production',()=>{
  const game=makeGame(),bot=company(game),rival=game.addPlayer('Rival');rival.started=true;rival.specialty='solid';bot.completed.push('R09');for(const id of [1,2,18])game.regions[id].ownerId=bot.id;game.regions[2].campaigns[rival.id]=inventory(10);game.regions[0].inventories=inventory(0,0,0,0,10);
  assert.equal(game.runBotTactical(bot).type,'programme-supply');game.regions[1].ownerId=null;game.deliver(5);assert.equal(game.convoys.length,0);assert.equal(game.routeInterruptions.length,1);
  game.regions[18].inventories=inventory(0,0,0,0,10);const replanned=game.runBotTactical(bot);assert.equal(replanned.type,'programme-supply');assert.equal(replanned.fromId,18);assert.equal(replanned.regionId,2);
  delete game.regions[2].campaigns[rival.id];bot.selectedTreatment='vaccine';game.manageBotStrategy(bot);assert.notEqual(bot.pendingTreatment??bot.selectedTreatment,'vaccine');
});

test('bot reinforcement arrives within twelve seconds and retains thirty percent at source',()=>{
  const game=makeGame(),bot=company(game),rival=game.addPlayer('Rival');rival.started=true;rival.specialty='solid';game.regions[1].ownerId=bot.id;game.regions[1].inventories=inventory();game.regions[1].campaigns[rival.id]=inventory(5);game.regions[0].inventories=inventory(120);
  const action=game.runBotTactical(bot);assert.equal(action.type,'reinforce');assert.ok(action.arrival<=12);assert.equal(action.commitment,70);assert.equal(game.regions[0].inventories.medicine,36);assert.equal(game.convoys[0].supply.medicine,84);
});

test('bot attacks test 50 and 65 percent packets, force ratios, production pressure, and one-action limit',()=>{
  const game=makeGame(),bot=company(game);game.regions[0].inventories=inventory(120);game.regions[1].protection=30;
  const action=game.runBotTactical(bot);assert.equal(action.type,'attack');assert.equal(action.commitment,50);assert.equal(game.convoys.length,1);assert.equal(game.regions[0].inventories.medicine,60);
  game.regions[0].dispatchAvailableAt=0;game.regions[0].inventories=inventory(50);game.regions[2].protection=30;assert.equal(game.runBotTactical(bot),null);
  const defender=game.addPlayer('Defender');defender.started=true;defender.specialty='solid';game.regions[1].ownerId=defender.id;game.regions[1].protection=30;game.convoys=[];game.regions[0].inventories=inventory(95);const rivalAction=game.runBotTactical(bot);assert.equal(rivalAction.commitment,65);assert.ok(game.regions[0].inventories.medicine>=95*.3);
  game.convoys=[];game.regions[0].dispatchAvailableAt=0;game.regions[0].inventories=inventory(100);for(const id of game.regions[0].neighbours)if(id!==1){game.regions[id].ownerId=null;game.regions[id].protection=1000;}game.regions[1].level=3;defender.selectedTreatment='targeted';defender.targetedIndications=[game.regions[1].profile];defender.completed.push('R01');assert.equal(game.runBotTactical(bot),null,'pressure must exceed the defending factory output');
});

test('bot strategic policy is slot deterministic, balanced, and prepares level two before advanced production',()=>{
  const game=makeGame(),bots=[company(game,'A'),game.addPlayer('B',{bot:true}),game.addPlayer('C',{bot:true})];for(const bot of bots.slice(1)){bot.started=true;bot.specialty='mixed';}for(const bot of bots){const home=game.regions.find(r=>r.ownerId===bot.id);if(home)home.profile='mixed';bot.specialty='mixed';bot.completed.push('R03','R08');game.manageBotStrategy(bot);assert.deepEqual(bot.allocation,{research:20,manufacturing:65,infrastructure:15});}
  assert.deepEqual(bots.map(bot=>bot.researchQueue[0]),['R02','R01','R04']);assert.equal(bots[0].developmentPin,0);assert.notEqual(bots[0].pendingTreatment,'immunotherapy');game.regions[0].level=2;game.manageBotStrategy(bots[0]);assert.equal(bots[0].pendingTreatment,'immunotherapy');
  game.elapsed=.25;bots[0].nextBotAt=0;game.runBots();assert.equal(bots[0].nextBotAt,2);assert.ok(bots[1].nextBotAt>0,'seeded slot offsets stagger evaluations');
});

test('client exposes continuity activation cost, timing, protection, depletion, and expiry feedback',async()=>{
  const client=await readFile(new URL('../public/client.js',import.meta.url),'utf8');assert.match(client,/Activate · consume 10 VAC · 8s pending/);assert.match(client,/protection depleted/);assert.match(client,/expires in/);assert.match(client,/type:'programme'/);
});
