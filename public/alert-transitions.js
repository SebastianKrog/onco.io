export class AlertTransitions {
  constructor(){this.occurrences=new Map();}
  key(kind,scope,authority){const transition=`${kind}:${scope}`,occurrence=(this.occurrences.get(transition)||0)+1;this.occurrences.set(transition,occurrence);return `${transition}:${authority??'local'}:${occurrence}`;}
  collect(state,previousState,myId){
    if(!previousState)return [];
    const me=state.players.find(p=>p.id===myId),before=previousState.players.find(p=>p.id===myId),alerts=[];
    if(!me||!before)return alerts;
    const add=(text,kind,scope='company',authority)=>alerts.push({text,key:this.key(kind,scope,authority)});
    for(const region of state.regions){const old=previousState.regions.find(item=>item.id===region.id),attackers=Object.keys(region.campaigns).filter(id=>id!==myId).sort(),oldAttackers=Object.keys(old?.campaigns||{}).filter(id=>id!==myId);
      if(region.ownerId===myId&&attackers.length&&!oldAttackers.length)add(`New supply contest at ${region.name}.`,'contest',region.id,attackers.join(','));
      if(old?.ownerId===myId&&region.ownerId!==myId)add(`${region.name} contract changed supplier.`,'loss',region.id,old.acquiredAt);
      if(region.ownerId===myId&&region.overCapacity&&!old?.overCapacity)add(`${region.name} is over capacity; production and arrivals are paused.`,'capacity',region.id,region.acquiredAt);
      if(region.ownerId===myId&&old?.programme?.pending&&region.programme&&!region.programme.pending)add(`${region.name} continuity programme is active.`,'programme-active',region.id,region.programme.startedAt);
      if(region.ownerId===myId&&old?.programme&&!region.programme)add(`${region.name} continuity programme ended.`,'programme-end',region.id,old.programme.startedAt);
    }
    for(const id of me.completed)if(!before.completed.includes(id))add(`${id} research complete; capability unlocked.`,'unlock',id,id);
    if(me.unusedManufacturing>0&&before.unusedManufacturing<=0)add('Manufacturing funding is unused; review factory capacity and product eligibility.','unused');
    const blocked=me.manufacturingFunding>0&&me.manufacturingSpend<=0,wasBlocked=before.manufacturingFunding>0&&before.manufacturingSpend<=0;
    if(blocked&&!wasBlocked)add('Production is blocked; review capacity, levels, and selected treatment.','blocked');
    if(me.dominance.holding&&!before.dominance?.holding)add(`Dominance hold started: ${me.dominance.regions}/${me.dominance.threshold} regions.`,'dominance','company',state.hold?.startedAt);
    return alerts;
  }
}
