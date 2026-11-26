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

test('A-R02 civil materials preserve exact shared snow boundary and distinguish used routes',()=>{
  for(let n=0;n<=336;n++)assert.deepEqual(field.surfaceWeightsAt(0,n),{packed:0,ballast:0,yard:0});
  for(let i=0;i<360;i++){
    const a=i*Math.PI/180;
    assert.deepEqual(field.surfaceWeightsAt(road.anchor.east+59*Math.sin(a),road.anchor.north+59*Math.cos(a)),{packed:0,ballast:0,yard:0});
  }
  assert.ok(field.surfaceWeightsAt(-35,159).packed>.9);
  assert.ok(field.surfaceWeightsAt(-64,146).packed>.5);
  const [b,r]=craterBeltTrackCorridor[3]!;
  const a=b*Math.PI/180;
  assert.ok(field.surfaceWeightsAt(road.anchor.east+r*Math.sin(a),road.anchor.north+r*Math.cos(a)).ballast>.8);
  assert.ok(field.surfaceWeightsAt(field.pads[0]!.center[0],field.pads[0]!.center[1]).yard>.8);
});
test('fractured outer shoulders are local real terrain with no B apron or road intrusion',()=>{
 for(const [e,n]of [[-208,105],[-216,265],[-170,304],[-164,51]]){
   let peak=0,count=0;
   for(let dx=-12;dx<=12;dx++)for(let dn=-9;dn<=9;dn++){
     const s=field.outcropAt(e+dx,n+dn);
     peak=Math.max(peak,s.lift);if(s.exposure>.15)count++;
   }
   assert.ok(peak>.21&&peak<.6&&count>30,JSON.stringify({e,n,peak,count}));
 }
 for(let n=0;n<=336;n++)assert.equal(field.outcropAt(0,n).lift,0);
 for(let e=-77;e<=0;e++)for(let n=153;n<=165;n++)assert.equal(field.outcropAt(e,n).lift,0);
 for(let i=0;i<360;i++){
   const a=i*Math.PI/180;
   assert.equal(field.outcropAt(road.anchor.east+59*Math.sin(a),road.anchor.north+59*Math.cos(a)).exposure,0);
 }
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
