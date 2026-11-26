import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {r30DeepFrames,r30DeepWorldFeet,r30DeepLocalFeet,r30DepthLinks,r30CheckExistingSecondFrame,r30LayerWorld,r30LayerLocal,r30LinkPoint,r30LinkRibs,r30RibProfile,validateR30DeepReceivingFeet} from '../tools/voxel-tavern/town-blockout/town-c-r30-deep-layer-contract.js';
import {mountR30DepthCorridor} from '../tools/voxel-tavern/town-blockout/town-c-r30-depth-corridor.js';
import {createWarriorCityCandidate} from '../tools/voxel-tavern/town-blockout/underground-warrior-city-candidate.js';
import {createUndergroundPalaceShell} from '../tools/fixtures/underground-palace-d-shell-snapshot.js';
import {canStandSecondMine} from '../src/shared/underground-second-mine-layout.js';
test('C-R04 frames preserve existing second mine and align real local receiving feet',()=>{
 assert.ok(r30CheckExistingSecondFrame());
 const city=createWarriorCityCandidate(),palace=createUndergroundPalaceShell();
 try{
  const checked=validateR30DeepReceivingFeet((layer,p)=>layer==='minus140'?
   (['high','middle','low'] as const).every(s=>canStandSecondMine(p.east,p.north,s)):
   layer==='minus165'?city.canStand(p.east,p.north,p.height):
   palace.canStand(p.east,p.north)&&Math.abs(palace.floorAt(p.east,p.north)!-p.height)<1e-6);
  assert.deepEqual(checked,{minus140:true,minus165:true,minus190:true,productionReady:false});
  for(const layer of ['minus140','minus165','minus190'] as const){
   const frame=r30DeepFrames[layer],p=r30DeepLocalFeet[layer].entry,w=r30DeepWorldFeet[layer].entry,back=r30LayerLocal(frame,w);
   assert.ok(Math.hypot(back.east-p.east,back.north-p.north,back.height-p.height)<1e-6);
   const v=r30LayerWorld(frame,p),g=new Group();g.position.set(frame.worldOffset.east,frame.worldOffset.height,-frame.worldOffset.north);g.rotation.y=frame.yaw;g.updateMatrixWorld(true);
   const actual=g.localToWorld(new Vector3(p.east,p.height,-p.north));
   assert.ok(Math.hypot(actual.x-v.east,actual.y-v.height,actual.z+v.north)<1e-6);
  }
  assert.equal(r30DeepWorldFeet.minus190.antechamber.height,-190);
  assert.equal(palace.canStand(0,125.8),false,'closed vault is not an exit');
 }finally{city.dispose();palace.dispose()}
});
test('both actual connector meshes have continuous support, original depth and safe grade',()=>{
 const parent=new Group();
 for(const link of r30DepthLinks){
  assert.ok(link.grade<=.2&&link.width>=2.5);
  assert.equal(mountR30DepthCorridor(parent,link,()=>false).kind,'unregistered-endpoints');
  const m=mountR30DepthCorridor(parent,link,()=>true);
  assert.equal(m.kind,'ready');if(m.kind!=='ready')assert.fail();
  parent.updateMatrixWorld(true);
  const mesh=m.group.getObjectByName('depth-link-floor')!;
  for(let t=0;t<link.length;t+=.4){
   const p=r30LinkPoint(link,t)!;
   const q=m.passageAt(p.east,p.north)!;
   assert.ok(Math.abs(q.floor-p.height)<1e-6);
   const hit=new Raycaster(new Vector3(p.east,p.height+1,-p.north),new Vector3(0,-1,0),0,2).intersectObject(mesh)[0];
   assert.ok(hit&&Math.abs(hit.point.y-p.height)<.001);
  }
  const ribs=r30LinkRibs(link),half=link.width/2;
  assert.equal(m.ribCount,ribs.length);assert.equal(m.parts,ribs.length*13);
  assert.equal(m.lanternCount,Math.ceil(ribs.length/2));assert.equal(m.wayfindingCount,m.lanternCount*2);
  const lamps=m.group.getObjectByName('depth-link-lantern-glass')!;
  const first=r30LinkPoint(link,ribs[0],half-.045)!;
  assert.ok(new Raycaster(new Vector3(first.east,first.height+3,-first.north),new Vector3(0,-1,0),0,1).intersectObject(lamps,true).length);
  const clear=r30LinkPoint(link,ribs[0],half-.46)!;
  assert.ok(m.passageAt(clear.east,clear.north));
  for(const t of ribs){
   for(const side of [-1,1]){
    const post=r30LinkPoint(link,t,side*(half-.08))!,near=r30LinkPoint(link,t,side*(half-.32))!,clear=r30LinkPoint(link,t,side*(half-.46))!;
    assert.ok(new Raycaster(new Vector3(post.east,post.height+1,-post.north),new Vector3(0,-1,0),0,1.1).intersectObject(m.group.getObjectByName('depth-link-ribs/rock')!,true).length);
    assert.equal(m.passageAt(near.east,near.north),undefined,'capsule overlaps real timber foot');
    assert.ok(m.passageAt(clear.east,clear.north));
    const between=r30LinkPoint(link,t+.8,side*(half-.32))!;assert.ok(m.passageAt(between.east,between.north));
   }
   const p=r30LinkPoint(link,t)!;
   const overhead=new Raycaster(new Vector3(p.east,p.height+1.8,-p.north),new Vector3(0,1,0),0,2).intersectObject(m.group.getObjectByName('depth-link-ribs/wood')!,true)[0];
   assert.ok(overhead&&overhead.point.y-p.height>=link.clearance-r30RibProfile.beamDepth-.001);
  }
  const end=r30LinkPoint(link,link.length)!;
  assert.ok(Math.hypot(end.east-link.end.east,end.north-link.end.north,end.height-link.end.height)<1e-6);
  const edge=r30LinkPoint(link,5,link.width/2)!;assert.equal(m.passageAt(edge.east,edge.north),undefined);
  m.dispose();
 }
 assert.equal(parent.children.length,0);
});
