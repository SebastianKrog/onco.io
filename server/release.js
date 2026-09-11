import { readFileSync } from 'node:fs';
import { BALANCE } from './balance.js';
import { MVP_ACCEPTANCE_SCENARIOS } from './acceptance.js';
import { CAMPAIGN_CRITERIA } from './playtest.js';

const deepFreeze=value=>{Object.freeze(value);for(const child of Object.values(value))if(child&&typeof child==='object'&&!Object.isFrozen(child))deepFreeze(child);return value;};
export const RELEASE_EVIDENCE_VERSION=2;
export const RELEASE_GATE=deepFreeze({version:RELEASE_EVIDENCE_VERSION,balanceVersion:BALANCE.version,lobbySizes:[...BALANCE.match.lobbySizes],checks:['unit','integration','browser','replay','acceptance','accessibility','load'],acceptanceScenarios:MVP_ACCEPTANCE_SCENARIOS.map(x=>x.id)});
export const RELEASE_ARTIFACT_URL=new URL(`../release-artifacts/balance-${BALANCE.version}/release-gate.json`,import.meta.url);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const validDate=value=>typeof value==='string'&&!Number.isNaN(Date.parse(value));
const validCheck=(a,c,s)=>{const common=object(a)&&a.schemaVersion===RELEASE_EVIDENCE_VERSION&&a.checkClass===c&&a.lobbySize===s&&a.balanceVersion===BALANCE.version&&a.success===true&&a.exitCode===0&&validDate(a.startedAt)&&validDate(a.finishedAt)&&Date.parse(a.finishedAt)>=Date.parse(a.startedAt)&&typeof a.command==='string'&&a.command.length>0&&Number.isInteger(a.assertions?.total)&&a.assertions.total>0&&a.assertions.passed===a.assertions.total;if(!common)return false;if(c==='browser')return a.renderedPage===true&&a.serverStateObserved===true;if(c==='accessibility')return a.axe===true&&Number.isFinite(a.viewport?.width)&&Number.isFinite(a.viewport?.height);if(c==='load')return object(a.thresholds)&&object(a.measurements)&&Number.isFinite(a.measurements.p95CommandLatencyMs);return true;};

export function evaluateReleaseGate(evidence={}){
  const failures=[];
  if(!object(evidence)||evidence.schemaVersion!==RELEASE_EVIDENCE_VERSION)failures.push('malformed or unsupported evidence schema');
  if(evidence.balanceVersion!==BALANCE.version)failures.push('stale or mixed balance version');
  const artifacts=Array.isArray(evidence.artifacts)?evidence.artifacts:[],checks={};
  for(const check of RELEASE_GATE.checks){checks[check]=true;for(const size of RELEASE_GATE.lobbySizes){const matches=artifacts.filter(x=>x?.checkClass===check&&x?.lobbySize===size);if(matches.length!==1){checks[check]=false;failures.push(`${check}/${size}: ${matches.length?'duplicate':'missing'} evidence`);}else if(!validCheck(matches[0],check,size)){checks[check]=false;failures.push(`${check}/${size}: malformed or failed evidence`);}}}
  const acceptanceArtifacts=artifacts.filter(x=>x?.checkClass==='acceptance'),expected=RELEASE_GATE.acceptanceScenarios;
  const acceptance=RELEASE_GATE.lobbySizes.every(size=>{const ids=acceptanceArtifacts.find(x=>x.lobbySize===size)?.scenarioIds;return Array.isArray(ids)&&ids.length===expected.length&&new Set(ids).size===ids.length&&expected.every(id=>ids.includes(id));});
  if(!acceptance)failures.push('incomplete acceptance scenario IDs');
  const replay=RELEASE_GATE.lobbySizes.every(size=>{const x=artifacts.find(a=>a?.checkClass==='replay'&&a.lobbySize===size);return x?.boundaries?.total>0&&x.boundaries.verified===x.boundaries.total&&x.boundaries.divergences===0;});
  if(!replay)failures.push('replay divergence or missing boundaries');
  const campaign=evidence.verifiedCampaign;
  const playtests=campaign?.verified===true&&campaign.pass===true&&campaign.balanceVersion===BALANCE.version&&RELEASE_GATE.lobbySizes.every(size=>campaign.lobbyResults?.[size]?.pass===true&&campaign.lobbyResults[size].matches>=CAMPAIGN_CRITERIA.minimumSamplesPerLobby);
  if(!playtests)failures.push('multiplayer playtests');
  const review=evidence.deviationReview;
  const deviationsDocumented=object(review)&&review.valid===true&&review.source==='GAMEPLAY_SPEC.md'&&(review.none===true||(Number.isInteger(review.acceptedCount)&&review.acceptedCount>0));
  if(!deviationsDocumented)failures.push('deviation review');
  return {...RELEASE_GATE,checks,acceptance,replay,playtests,deviationsDocumented,ready:failures.length===0,blockers:[...new Set(failures)]};
}
export function publishedReleaseGate(){try{return evaluateReleaseGate(JSON.parse(readFileSync(RELEASE_ARTIFACT_URL,'utf8')));}catch{return evaluateReleaseGate();}}
export const pendingReleaseGate=()=>evaluateReleaseGate();
