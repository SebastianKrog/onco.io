import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, TREATMENTS } from '../server/game.js';
import { BUDGET_PRESETS, redistributeBudget } from '../public/budget.js';

const makeGame = () => { let id=0; return new Game({random:()=>.2,id:()=>`economy-${++id}`}); };
const advance = (game, seconds) => { for(let elapsed=0;elapsed<seconds;elapsed+=.25)game.tick(.25); };

test('normative budget redistribution rounds halves upward and handles zero peers', () => {
  assert.deepEqual(redistributeBudget(BUDGET_PRESETS.balanced,'research',35),{research:35,manufacturing:55,infrastructure:10});
  assert.deepEqual(redistributeBudget({research:0,manufacturing:0,infrastructure:100},'infrastructure',55),{research:25,manufacturing:20,infrastructure:55});
  assert.deepEqual(redistributeBudget({research:50,manufacturing:50,infrastructure:0},'research',45),{research:45,manufacturing:55,infrastructure:0});
  assert.equal(redistributeBudget(BUDGET_PRESETS.balanced,'research',32),null);
  const game=makeGame(),player=game.addPlayer();game.start(player,0);assert.equal(game.changeBudget(player,'research',35),true);assert.deepEqual(player.pendingAllocation,{research:35,manufacturing:55,infrastructure:10});assert.equal(game.applyBudgetPreset(player,'expansion'),true);game.tick(.25);assert.deepEqual(player.allocation,BUDGET_PRESETS.expansion);
});

test('manufacturing keeps the old product active for five seconds and reports units and credits separately', () => {
  const game=makeGame(),player=game.addPlayer();game.start(player,0);player.completed.push('R06');player.unlocked=game.unlocks(player);player.allocation={research:0,manufacturing:100,infrastructure:0};game.regions[0].inventories.medicine=0;
  assert.equal(game.selectTreatment(player,'radiotherapy'),true);assert.equal(player.selectedTreatment,'medicine');assert.equal(player.pendingTreatment,'radiotherapy');assert.equal(game.selectTreatment(player,'medicine'),false);assert.equal(game.lastRejection,'manufacturing_switching');advance(game,5);assert.equal(player.selectedTreatment,'medicine');advance(game,.25);assert.equal(player.selectedTreatment,'radiotherapy');assert.ok(player.manufacturingSpend>0);assert.equal(player.production,player.manufacturingSpend/TREATMENTS.radiotherapy.cost);
});

test('economy conserves net funding across spending, banks, redirection and unused credits', () => {
  const game=makeGame(),player=game.addPlayer();game.start(player,0);player.researchBank=300;player.infrastructureBank=300;player.researchQueue=[];game.regions[0].level=3;game.regions[0].inventories.medicine=0;const beforeBanks=player.researchBank+player.infrastructureBank;game.tick(.25);const bankDelta=(player.researchBank+player.infrastructureBank-beforeBanks)/.25;assert.ok(Math.abs(player.net-(player.researchSpend+player.infrastructureSpend+player.manufacturingSpend+player.unusedManufacturing+bankDelta))<1e-8);assert.equal(player.manufacturingFunding,player.directManufacturingFunding+player.researchOverflow+player.infrastructureOverflow);assert.equal(player.manufacturingFunding,player.manufacturingSpend+player.unusedManufacturing);
});

test('weighted factories redistribute around processing and storage caps', () => {
  const game=makeGame(),player=game.addPlayer();game.start(player,0);for(const id of [1,2]){game.regions[id].ownerId=player.id;game.regions[id].level=1;game.regions[id].inventories.medicine=0;}game.regions[0].inventories.medicine=299.5;player.productionPin=1;const before=game.regions.map(r=>r.inventories.medicine);game.manufacture(player,3,.25,[game.regions[0],game.regions[1],game.regions[2]]);const made=[0,1,2].map(id=>game.regions[id].inventories.medicine-before[id]);assert.equal(made[0],.5);assert.ok(made[1]>made[2]);assert.ok(Math.abs(made.reduce((a,b)=>a+b,0)-3)<1e-8);assert.equal(player.unusedManufacturing,0);
});

test('R05 locks an explicit or deterministic fallback indication on first paid progress', () => {
  const explicit=makeGame(),player=explicit.addPlayer();explicit.start(player,0);player.specialty='solid';player.completed.push('R03','R04');player.researchQueue=['R05'];player.allocation={research:100,manufacturing:0,infrastructure:0};assert.equal(explicit.prioritizeResearch(player,'R05','rare'),true);explicit.tick(.25);assert.equal(player.r05Choice,'rare');assert.ok(player.researchProgress.R05>0);assert.equal(explicit.prioritizeResearch(player,'R05','blood'),false);player.researchProgress.R05=360;explicit.applyCompletions();assert.ok(player.targetedIndications.includes('rare'));
  const fallback=makeGame(),other=fallback.addPlayer();fallback.start(other,0);other.specialty='solid';other.completed.push('R03','R04');other.researchQueue=['R05'];other.allocation={research:100,manufacturing:0,infrastructure:0};fallback.regions[1].profile='blood';fallback.tick(.25);assert.equal(other.r05Choice,'blood');
});

test('research and infrastructure feedback exposes schedules and staged completion', () => {
  const game=makeGame(),player=game.addPlayer();game.start(player,0);player.developmentPin=0;game.tick(.25);assert.equal(player.researchActive,'R02');assert.ok(player.researchSpend>0);assert.ok(player.researchEta>0);assert.equal(player.infrastructureActive,0);assert.equal(player.infrastructureReason,'development pin');assert.ok(player.infrastructureEta>0);game.regions[0].upgradeProgress=140;assert.equal(game.regions[0].level,1);game.applyCompletions();assert.equal(game.regions[0].level,2);
});
