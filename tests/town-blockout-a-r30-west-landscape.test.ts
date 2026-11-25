import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Raycaster,Vector3,type Mesh} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {createWestLandscape} from '../tools/voxel-tavern/town-blockout/town-a-r30-west-landscape';
import {craterBeltTrackCorridor} from '../tools/voxel-tavern/town-blockout/town-crater-outer-works';

const grid=createTerrainGrid();
const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const field=createWestLandscape(road.anchor,59,336,craterBeltTrackCorridor);
road.group.updateMatrixWorld(true);

test('A-R02 creates substantial asymmetric terrain while preserving the civil footprint',()=>{
  let low=0,high=0,changed=0,maxStep=0;
  for(let e=-240;e<0;e++)for(let n=0;n<336;n++){
    const v=field.offsetAt(e,n);
    low=Math.min(low,v);high=Math.max(high,v);
    if(Math.abs(v)>.05)changed++;
    maxStep=Math.max(maxStep,Math.abs(field.offsetAt(e+1,n)-v),Math.abs(field.offsetAt(e,n+1)-v));
  }
  assert.ok(high>=4&&high<=6&&low<=-1&&low>=-3);
  assert.ok(changed>25000);
  assert.ok(maxStep<.65);
  for(const p of field.pads)for(let dx=-p.radius;dx<=p.radius;dx++)for(let dn=-p.radius;dn<=p.radius;dn++){
    if(Math.hypot(dx,dn)<=p.radius)assert.equal(field.offsetAt(p.center[0]+dx,p.center[1]+dn),0,p.id);
  }
  for(let e=-77;e<=0;e++)for(let n=153;n<=165;n++)assert.equal(field.offsetAt(e,n),0);
  for(let n=0;n<=336;n++)assert.equal(field.offsetAt(0,n),0);
});

test('A-R02 relief is real rendered collision support, not decorative overlay',()=>{
  const carriers=road.group.children.filter(o=>o.name==='meteor-crater-west-ground') as Mesh[];
  const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
  let moved=0;
  for(let e=-235;e<=-65;e+=7)for(let n=5;n<330;n+=7){
    if(Math.abs(field.offsetAt(e,n))<.08)continue;
    ray.ray.origin.set(e,100,-n);
    const hit=ray.intersectObjects(carriers,false)[0];
    assert.ok(hit,JSON.stringify({e,n}));
    assert.ok(Math.abs(hit.point.y-road.heightAt(e,n)!)<.0001);
    assert.ok(Math.abs(hit.point.y-(road.anchor.rimHeight+field.offsetAt(e,n)))<.0001);
    moved++;
  }
  assert.ok(moved>350);
  assert.ok(carriers.every(m=>m.geometry.getAttribute('color').count===m.geometry.getAttribute('position').count));
});
