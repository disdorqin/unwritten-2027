import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost,undergroundMineSpec} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundWaterState} from '../src/presence/underground-water-state.js';
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';
import {cutR30UpperLiftFloor} from '../tools/voxel-tavern/town-blockout/town-c-r30-upper-aperture.js';
import {r30InterlayerLiftSite as site,type R30InterlayerRide} from '../tools/voxel-tavern/town-blockout/town-c-r30-interlayer-lift.js';
test('upper shaft cut removes exactly the certified 2.2m square from existing floor',()=>{
 const mine=createUndergroundMineLayout(undergroundMineSpec);
 const cut=cutR30UpperLiftFloor(mine.mesh.rock);
 assert.equal(cut.kind,'ready');if(cut.kind!=='ready')assert.fail();
 assert.ok(Math.abs(cut.removed-4.84)<.001);
 assert.equal(cutR30UpperLiftFloor(new Float32Array()).kind,'unsupported-floor');
});
test('real mesh aperture and closed hatch only open for certified accepted ride, then reclose',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 let lower=false,waterAvailable=false,now=1000,ride:R30InterlayerRide|undefined;
 const water=createUndergroundWaterState({dawnEpoch:0,now:()=>0});
 const h=mountUndergroundDomainHost({parent,road,waterBridge:{readWaterSnapshot:()=>waterAvailable?water.tonight():undefined},interlayerRide:{lowerOpeningCertified:()=>lower,read:()=>ride,now:()=>now}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const mesh=h.mounted.group.getObjectByName('underground-mine-rock')!;
  const lift=h.interlayerLift!,p=site.upper.foot;
  function floorHit(){
   parent.updateMatrixWorld(true);
   return new Raycaster(new Vector3(p.east,p.height+.45,-p.north),new Vector3(0,-1,0),0,.9).intersectObject(mesh)[0];
  }
  assert.ok(floorHit());h.mounted.sync();assert.equal(h.mounted.hasUpperLiftAperture(),false);
  lower=true;h.mounted.sync();assert.equal(h.mounted.hasUpperLiftAperture(),false,'no physical lower scene');
  waterAvailable=true;h.mounted.sync();assert.equal(h.deepHost.mounted?.lowerAperturePrepared(),true);
  assert.equal(h.mounted.hasUpperLiftAperture(),true);assert.equal(floorHit(),undefined);
  assert.ok(lift.hatch.visible&&!lift.guard.visible);assert.equal(h.passageAt(p.east,p.north)?.floor,-91);
  ride={id:1,linkId:'mine1-mine2-lift',riderId:'accepted-rider',fromDomain:site.upper.domainId,toDomain:site.lower.domainId,departedAt:1000,travelMs:25000};
  now=13500;h.mounted.sync();
  assert.equal(lift.hatch.visible,false);assert.equal(lift.guard.visible,true);
  assert.equal(h.passageAt(p.east,p.north),undefined);
  lower=false;h.mounted.sync();assert.ok(lift.hatch.visible);assert.equal(h.passageAt(p.east,p.north)?.floor,-91);
  lower=true;now=26000;h.mounted.sync();assert.ok(lift.hatch.visible);assert.equal(lift.guard.visible,false);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
