import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mesh } from 'three';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { mountZa36CraterOuterworks } from '../tools/voxel-tavern/town-blockout/town-za36-crater-outerworks';

function fixture() {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  return { road, works: mountZa36CraterOuterworks(road) };
}
test('ZA-36 batch 17 stage 1 industrial outside has all large silhouette structures on real ground', () => {
  const { road, works: w } = fixture();
  assert.equal(w.group.name, 'za36-crater-outside-complex');
  assert.equal(w.statistics().towers, 3);
  const byId=(id:string)=>w.sites.find(s=>s.id===id)!;
  assert.ok(byId('core-supply-station'));
  assert.ok(byId('crater-assembly-ground'));
  assert.ok(byId('north-watch-shelter'));
  assert.equal(byId('abandoned-smeltery').footprint[0],28);
  assert.ok(byId('instrument-workshop').footprint[0]>=20);
  assert.ok(byId('instrument-workshop').structureHeight>=8);
  for (const id of ['ancient-gate-tower','north-watch-tower','fallen-west-tower']) {
    assert.ok(byId(id).structureHeight >= 12 && byId(id).structureHeight <= 15);
  }
  assert.ok(w.sites.every(s=>s.height===road.heightAt(s.east,s.north)));
  assert.ok(w.sites.every(s=>Math.hypot(s.east-road.anchor.east,
    s.north-road.anchor.north)>56));
  assert.ok(w.statistics().instances>720,'industrial complexes must have real dressing, not empty shells');
  assert.equal(w.statistics().batches,9,'eight structural materials plus dedicated warm window glass');
  assert.equal(w.statistics().signs,4);
  assert.equal(w.pointLights.length,3);
});
test('ZA-36 round 2: 310m approach wall has a genuine gate, fence ring has clearance at the road', () => {
  const { road, works:w }=fixture();
  assert.equal(w.gate.north,159);
  const fullLength=336-26;
  assert.ok(fullLength>=300);
  assert.ok(w.wallParts.length>=65);
  assert.ok(w.wallParts.every(p=>Math.abs(p.north-w.gate.north)>=w.gate.halfWidth+2),
    'no invisible wall face at official E0 gate');
  assert.ok(Math.hypot(w.fenceGate.east+120,w.fenceGate.north-185)>80);
  assert.ok(Math.abs(w.fenceGate.north-159)<.01,
    'fence gate MUST line up with the town-to-lip approach, not a radial bearing');
  assert.ok(w.fenceParts.length>=85);
  assert.ok(w.fenceParts.every(p=>Math.hypot(p.east-w.fenceGate.east,
    p.north-w.fenceGate.north)>7));
  assert.ok(w.fenceParts.every(p=>Math.hypot(p.east-road.anchor.east,p.north-road.anchor.north)>=80));
  assert.ok(w.fenceParts.every(p=>p.east<0));
  const wFloor=road.heightAt(-11.8,120)!;
  const gateFloor=road.heightAt(-11.8,159)!;
  assert.equal(road.fenceBlocks(-11.8,120,wFloor,.27),true,
    'five-metre visible masonry actually stops a player body');
  assert.equal(road.fenceBlocks(-11.8,159,gateFloor,.27),false,
    'the official eleven-metre archway must be truly traversable');
  assert.equal(road.fenceBlocks(-11.8,120,wFloor+6,.27),false,
    'collision only exists where the visible wall stands');
  assert.equal(road.fenceBlocks(-8.5,120,wFloor,.27),false,
    'do not insert an unseen collision wall ahead of masonry');
  assert.equal(road.fenceBlocks(w.fenceGate.east,w.fenceGate.north,
    road.heightAt(w.fenceGate.east,w.fenceGate.north)!, .27),false,
    'the fenced gate is opened by a real material gap, not a hidden blocker');
});
test('ZA-36 round 3: 16px materials, readable signs, no enormous mesh/draw-call explosion', () => {
  const {works:w}=fixture();
  let draws=0,tris=0,instanced=0,lights=0;
  w.group.traverse(o=>{
    if((o as {isLight?:boolean}).isLight) lights++;
    if(!(o as Mesh).isMesh)return;
    draws++;
    const mesh=o as Mesh & {count?:number};
    if((mesh as {isInstancedMesh?:boolean}).isInstancedMesh) {
      instanced++;
      const mat=mesh.material as {map?: {image:{width:number;height:number}}};
      assert.equal(mat.map?.image?.width,16);
      assert.equal(mat.map?.image?.height,16);
    }
    const geom=mesh.geometry;
    tris+=(geom.index?.count??geom.attributes.position.count)/3*(mesh.count??1);
  });
  assert.equal(instanced,9);
  assert.ok(draws<=13,`expected <=13 static draw meshes, got ${draws}`);
  assert.ok(tris<20000,`expected <20k triangles, got ${tris}`);
  assert.equal(lights,3);
  assert.ok(w.group.children.some(node=>node.userData.publicText==='入坑登记 · 天黑前出坑'));
  assert.ok(w.group.children.some(node=>node.userData.publicText==='夜里不入'));
  assert.ok(!w.group.children.some(node=>JSON.stringify(node.userData).includes('船骸')),
    'do not seed spaceship wreckage inside the crater');
});
test('ZA-36 round 4: look/listen/do action hotspots and daytime/nightside fire feedback', () => {
  const {works:w}=fixture();
  assert.deepEqual([...new Set(w.actions.map(a=>a.id))].sort(),
    ['firewood','map','registration','survey','telescope']);
  for(const action of w.actions) {
    assert.equal(w.actionAt(action.east,action.north,action.height)?.id,action.id);
    assert.equal(w.actionAt(action.east,action.north,action.height+10),undefined);
  }
  assert.equal(w.actionAt(0,0,0),undefined);
  const fire=w.pointLights.find(light=>light.name==='za36-empty-north-shelter-night-brazier')!;
  const supply=w.pointLights.find(light=>light.name==='za36-supply-night-window')!;
  assert.equal(w.isFireFed(),false);
  w.setNight(false);
  assert.equal(fire.intensity,0);
  assert.equal(supply.intensity,0);
  assert.equal(w.firewood(),true);
  assert.equal(fire.intensity,0,'visuals must not emit extra light in daytime');
  w.setNight(true);
  assert.ok(fire.intensity>1);
  assert.ok(supply.intensity>.5);
  assert.equal(w.firewood(),false);
  assert.ok(fire.intensity<.4);
});
