import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Raycaster, Vector3 } from 'three';
import { buildCraterOuterWorks } from '../tools/voxel-tavern/town-blockout/town-crater-outer-works';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';

const anchor={east:-120,north:185,rimHeight:12,yaw:1.364};
const flat={anchor,heightAt:()=>12};
function frame(origin:{east:number;north:number},bearingDeg:number,dx:number,dz:number) {
  const rad=bearingDeg*Math.PI/180;
  return {east:origin.east+dx*Math.cos(rad)+dz*Math.sin(rad),
    north:origin.north-dx*Math.sin(rad)+dz*Math.cos(rad)};
}
test('ZA36 R1: the 28m smelter and 20m instrument factory are hollow, not solid cuboids',()=>{
  const model=buildCraterOuterWorks(flat);
  assert.deepEqual(model.interiorEntrances.map(e=>e.id),
    ['smelter-plant','instrument-plant']);
  for(const entry of model.interiorEntrances){
    const outward=new Vector3(Math.sin(entry.yaw),0,Math.cos(entry.yaw));
    const sideways=new Vector3(-Math.cos(entry.yaw),0,Math.sin(entry.yaw));
    for(const offset of [-.6,0,.6]){
      const origin=new Vector3(entry.east,entry.height+1.35,-entry.north)
        .addScaledVector(outward,.48).addScaledVector(sideways,offset);
      const ray=new Raycaster(origin,outward.clone().negate(),0,3.0);
      const hits=ray.intersectObject(model.group,true);
      assert.equal(hits.length,0,`${entry.id}: door aperture blocked ${offset}m from center`);
    }
    assert.ok(entry.clearWidth>=3.5,'large freight/visitor doors cannot shrink to one metre');
  }
  assert.ok(model.group.children.length<=30,'interior machinery should share industrial material batches');
});
test('ZA36 R2: every instrument stair tread is a physical 3D surface with consistent rise',()=>{
  const model=buildCraterOuterWorks(flat);
  const shop=model.sites.find(s=>s.id==='instrument-plant')!;
  assert.ok(shop);
  let previous=0;
  for(let i=0;i<12;i++){
    const top=.34+i*.326;
    if(i>0)assert.ok(top>previous && top-previous<.35);
    previous=top;
    const p=frame(shop,307,6.55,3.33-i*.53);
    const cast=new Raycaster(new Vector3(p.east,shop.height+top+.55,-p.north),
      new Vector3(0,-1,0),0,1.2);
    const hits=cast.intersectObject(model.group,true);
    assert.ok(hits.length>0,`missing step ${i+1}/12`);
    assert.ok(hits[0]!.distance<.66,`step ${i+1} lost under overlying geometry`);
  }
  assert.ok(shop.topHeight && shop.topHeight>=17);
});
test('ZA36 R6: two actual interior machine handles turn four steps without altering world authority',()=>{
  const model=buildCraterOuterWorks(flat);
  assert.deepEqual(model.mechanisms.map(m=>m.id),
    ['smelter-cold-valve','instrument-calibration']);
  for(const machinery of model.mechanisms){
    assert.equal(model.actionAt(machinery.east,machinery.north,machinery.foot),machinery.id);
    assert.equal(model.actionAt(machinery.east,machinery.north,machinery.foot+2),undefined);
    assert.equal(model.actionAt(machinery.east+5,machinery.north,machinery.foot),undefined);
    assert.equal(model.group.getObjectByName('za36-manual-'+machinery.id),machinery.handle);
    const before=machinery.handle.rotation.z;
    assert.equal(before,0);
    for(const expected of [1,2,3,0]){
      assert.equal(model.turnMechanism(machinery.id),expected);
      assert.ok(Math.abs(machinery.handle.rotation.z-expected*Math.PI/2)<1e-7);
    }
    assert.equal(model.turnMechanism('invalid' as typeof machinery.id),undefined);
  }
  assert.equal(model.actionAt(0,0,12),undefined);
});
test('ZA36 R7: mainline canonical signs are reused without a parallel duplicate decal layer',()=>{
  const grid=createTerrainGrid();
  const west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  assert.equal(west.group.getObjectByName('za36-canonical-crater-signage'),undefined);
  const names=new Set(west.outerWorks.sites.map(s=>s.id));
  for(const required of [
    'smelter-sign','smelter-duty-board','instrument-sign','instrument-notice',
    'wall-gate-notice','collapse-sign-1','collapse-sign-2',
  ])assert.ok(names.has(required),`missing mainline sign: ${required}`);
  assert.ok(west.mouthWorks.sites.some(site=>site.id==='fence-gate-sign'));
  assert.equal(west.group.children.filter(g=>g.name==='crater-outer-works').length,1);
});
test('ZA36 R3: finished factory door elevations sample the genuine current crater terrain',()=>{
  const grid=createTerrainGrid();
  const west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const model=buildCraterOuterWorks(west);
  assert.equal(model.interiorEntrances.length,2);
  for(const door of model.interiorEntrances) {
    const ground=west.heightAt(door.east,door.north);
    assert.ok(ground!==undefined);
    assert.ok(door.height-ground>=0 && door.height-ground<=.15,
      'R3 lower-floor finish must match authority ground within 15cm');
  }
});
