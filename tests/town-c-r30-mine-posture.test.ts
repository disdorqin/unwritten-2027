import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost,undergroundMineSpec} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';
test('standing blocked but real crouched capsule traverses whole collapse and can stand only after exit',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),h=mountUndergroundDomainHost({parent,road});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const mine=createUndergroundMineLayout(undergroundMineSpec),[start,end]=mine.crouchInterval;
  const world=(z:number)=>h.mounted.toWorld([0,-91,z])!;
  const mid=world((start+end)/2);
  assert.equal(h.passageAt(mid.east,mid.north),undefined);
  assert.equal(h.canStandUp(mid.east,mid.north),false);
  assert.equal(h.passageAt(mid.east,mid.north,'crouching')?.requiresCrouch,true);
  let p=world(start-.5);
  for(let z=start-.4;z<=end+.55;z+=.1){
   const next=world(z),result=h.resolveMineStep(p,next,'crouching');
   assert.ok(result,'actual passage failed at '+z);
   assert.equal(result.eyeHeight,1);p=result.foot;
  }
  const after=world(end+.35);assert.ok(h.canStandUp(after.east,after.north));
  assert.equal(h.resolveMineStep(world(start-.5),world(end+.5),'standing'),undefined);
  assert.equal(h.resolveMineStep(mid,{east:mid.east+20,north:mid.north},'crouching'),undefined);
 }finally{h.mounted.dispose()}
});
