import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeededMap, MAP_TEMPLATES, REGION_PROFILES } from '../server/map.js';
import { hexGeometry, pointInHex } from '../public/hex.js';

function graphDistances(regions, source) {
  const distances=Array(regions.length).fill(Infinity);distances[source]=0;const queue=[source];
  for(let i=0;i<queue.length;i+=1)for(const next of regions[queue[i]].neighbours)if(distances[next]===Infinity){distances[next]=distances[queue[i]]+1;queue.push(next);}
  return distances;
}

test('official seeded templates are repeatable and satisfy map invariants', () => {
  for(const lobbySize of [20,30,40]) {
    const map=createSeededMap({lobbySize,seed:'repeatable'}),again=createSeededMap({lobbySize,seed:'repeatable'}),other=createSeededMap({lobbySize,seed:'different'});
    assert.deepEqual({columns:map.columns,rows:map.rows},MAP_TEMPLATES[lobbySize]);
    assert.equal(map.regions.length,lobbySize*8);assert.deepEqual(map,again);assert.notDeepEqual(map.regions.map(r=>r.profile),other.regions.map(r=>r.profile));
    const counts=Object.fromEntries(REGION_PROFILES.map(profile=>[profile,map.regions.filter(region=>region.profile===profile).length]));
    assert.deepEqual(new Set(Object.values(counts)),new Set([map.regions.length/4]));
    const visited=new Set([0]),queue=[0];for(let i=0;i<queue.length;i+=1)for(const id of map.regions[queue[i]].neighbours)if(!visited.has(id)){visited.add(id);queue.push(id);}
    assert.equal(visited.size,map.regions.length);
    for(const region of map.regions){assert.ok(region.neighbours.length<=6);for(const neighbour of region.neighbours)assert.ok(map.regions[neighbour].neighbours.includes(region.id));}
    const patches=Map.groupBy(map.regions,region=>region.profilePatch);for(const patch of patches.values()){assert.ok(patch.length>=2&&patch.length<=5);assert.equal(new Set(patch.map(r=>r.profile)).size,1);}
    assert.equal(map.pads.length,lobbySize);assert.equal(new Set(map.pads).size,lobbySize);
    const matrices=Object.fromEntries(map.pads.map(id=>[id,graphDistances(map.regions,id)]));
    for(const [index,id] of map.pads.entries()){assert.ok(map.regions[id].neighbours.length>=4);for(const other of map.pads.slice(index+1))assert.ok(matrices[id][other]>=3);const nearby=new Set(map.regions.filter(region=>matrices[id][region.id]<=2).map(region=>region.profile));assert.deepEqual(nearby,new Set(REGION_PROFILES));}
  }
});

test('hex geometry hit testing selects the polygon but not bounding-box corners', () => {
  for(const map of Object.values(MAP_TEMPLATES)){const region={column:Math.floor(map.columns/2),row:Math.floor(map.rows/2)},hex=hexGeometry(region,map,1120,700);assert.equal(pointInHex(region,hex.cx,hex.cy,map,1120,700),true);assert.equal(pointInHex(region,hex.cx+Math.sqrt(3)*hex.size/2-.1,hex.cy-hex.size+.1,map,1120,700),false);}
});
