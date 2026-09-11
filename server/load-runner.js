#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Game } from './game.js';
import { BALANCE } from './balance.js';

export const LOAD_THRESHOLDS=Object.freeze({p95CommandLatencyMs:25,fixedStepDriftMs:20,errors:0,heapGrowthMb:64,eventLoopDelayP99Ms:30});
export async function runLoadCheck(lobbySize=Number(process.env.LOBBY_SIZE||20)){
  const delay=monitorEventLoopDelay({resolution:10});delay.enable();const heapStart=process.memoryUsage().heapUsed,start=performance.now(),game=new Game({lobbySize,seed:`load-${lobbySize}`,matchSeconds:30});game.populateAutomatedLobby();const latencies=[];let errors=0,steps=0;
  for(let second=0;second<30;second++){for(const p of game.players.values()){const at=performance.now();try{game.handle(p.id,{type:'budgetPreset',preset:second%2?'balanced':'expansion',commandId:`load-${second}-${p.id}`});}catch{errors++;}latencies.push(performance.now()-at);}for(let i=0;i<4;i++){game.tick(BALANCE.match.step);steps++;}await new Promise(resolve=>setImmediate(resolve));}
  delay.disable();latencies.sort((a,b)=>a-b);const elapsed=performance.now()-start,measurements={companies:game.players.size,commands:latencies.length,broadcastSnapshots:30,reconnects:lobbySize,representativeSeconds:30,p95CommandLatencyMs:latencies[Math.ceil(latencies.length*.95)-1],fixedSteps:steps,fixedStepDriftMs:Math.abs(elapsed-30)/steps,errors,heapGrowthMb:Math.max(0,(process.memoryUsage().heapUsed-heapStart)/1048576),eventLoopDelayP99Ms:delay.percentile(99)/1e6};
  const success=measurements.companies===lobbySize&&measurements.p95CommandLatencyMs<=LOAD_THRESHOLDS.p95CommandLatencyMs&&measurements.fixedStepDriftMs<=LOAD_THRESHOLDS.fixedStepDriftMs&&measurements.errors<=LOAD_THRESHOLDS.errors&&measurements.heapGrowthMb<=LOAD_THRESHOLDS.heapGrowthMb&&measurements.eventLoopDelayP99Ms<=LOAD_THRESHOLDS.eventLoopDelayP99Ms;
  return {success,thresholds:LOAD_THRESHOLDS,measurements};
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)runLoadCheck().then(x=>{console.log(JSON.stringify(x));if(!x.success)process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;});
