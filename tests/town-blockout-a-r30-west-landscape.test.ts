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
  assert.ok(field.surfaceWeightsAt(-55.3,176.65).packed>.55);
  assert.equal(field.surfaceWeightsAt(-64.63075545125356,183.25).packed,0);
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
test('fractured shoulder slabs are physically supported and keep the south traverse clear',()=>{
 const stacks=road.outerWorks.shoulderStacks;
 assert.ok(stacks.length>=33,JSON.stringify({count:stacks.length}));
 for(const s of stacks){
   assert.ok(s.top>s.bottom);
   assert.ok(road.outerWorks.floors.some(b=>Math.abs(b.max[1]-s.top)<1e-5&&Math.abs(b.min[1]-s.bottom)<1e-5&&Math.abs((b.min[0]+b.max[0])/2-s.east)<1e-5&&Math.abs((b.min[2]+b.max[2])/2+s.north)<1e-5));
   assert.ok(Math.hypot(s.east-road.anchor.east,s.north-road.anchor.north)>70);
   if(s.east>=-175&&s.east<=-150&&s.north>=40&&s.north<=60)assert.ok(Math.abs(s.north-51)>2.4);
 }
});
test('four outer shoulders expose layered, collision-bearing strata on the actual carrier',()=>{
 const ribs=road.outerWorks.shoulderRibs;
 for(const id of ['shoulder-west','shoulder-northwest','shoulder-north','shoulder-south']){
   const group=ribs.filter(r=>r.id===id);
   assert.ok(group.length>=6,JSON.stringify({id,count:group.length}));
   assert.ok(group.some(r=>r.support.min[1]<road.heightAt(r.east,r.north)!&&r.support.max[1]>road.heightAt(r.east,r.north)!));
   for(const r of group)assert.ok(road.outerWorks.floors.includes(r.support));
 }
});
test('old approach rocks are replaced by grounded supports outside the north footway',()=>{
 const pieces=road.outerWorks.approachRockSupports;
 assert.equal(pieces.length,16);
 for(const b of pieces){
   assert.ok(road.outerWorks.floors.includes(b));
   assert.ok(b.min[0]>-10&&b.max[0]<-2);
   assert.ok(b.max[1]>b.min[1]);
 }
});
test('all eight outer clusters have grounded fragmented rock and dead pine supports',()=>{
 const pieces=road.outerWorks.outerClusterPieces;
 assert.equal(pieces.length,48);
 for(let i=1;i<=8;i++){
  const local=pieces.filter(p=>p.id==='outer-cluster-'+i);
  assert.equal(local.filter(p=>p.kind==='rock').length,4);
  assert.equal(local.filter(p=>p.kind==='pine').length,2);
  const site=road.outerWorks.sites.find(s=>s.id==='outer-cluster-'+i)!;
  for(const p of local){
   const b=p.support;
   assert.ok(Math.hypot(p.east-site.east,p.north-site.north)<10);
   assert.ok(b.min[1]<road.heightAt(p.east,p.north)!);
   assert.ok(b.max[1]>road.heightAt(p.east,p.north)!);
   assert.ok((p.kind==='pine'?road.outerWorks.colliders:road.outerWorks.floors).includes(b));
  }
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
