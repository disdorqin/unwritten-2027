import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundWaterState} from '../src/presence/underground-water-state.js';
import {r30InterlayerLiftSite as site,splitR30LiftAperture,sampleR30InterlayerRide,type R30InterlayerRide} from '../tools/voxel-tavern/town-blockout/town-c-r30-interlayer-lift.js';
const ride:R30InterlayerRide={id:1,linkId:'mine1-mine2-lift',riderId:'accepted-test-rider',fromDomain:site.upper.domainId,toDomain:site.lower.domainId,departedAt:1000,travelMs:25000};
test('49m shaft station models align to the registered feet and preserve a real walkable approach',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),water=createUndergroundWaterState({dawnEpoch:0,now:()=>0});
 let domain=site.upper.domainId;
 const h=mountUndergroundDomainHost({parent,road,waterBridge:{readWaterSnapshot:()=>water.tonight()},
 readAcceptedDomainFoot:()=>({domainId:domain,...(domain===site.upper.domainId?site.upper.foot:site.lower.foot)})});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const lift=h.interlayerLift!;
  assert.ok(lift.parts>300);assert.equal(site.depth,49);assert.equal(lift.bore.visible,false);
  h.mounted.sync();parent.updateMatrixWorld(true);
  const p=lift.upper.getWorldPosition(new Vector3()),q=lift.lower.getWorldPosition(new Vector3());
  assert.ok(Math.hypot(p.x-site.upper.foot.east,p.y-site.upper.foot.height,p.z+site.upper.foot.north)<1e-6);
  assert.ok(Math.hypot(q.x-site.lower.foot.east,q.y-site.lower.foot.height,q.z+site.lower.foot.north)<1e-6);
  for(let i=0;i<=20;i++){
   const a=site.approach.upper,b=site.upper.foot,e=a.east+(b.east-a.east)*i/20,n=a.north+(b.north-a.north)*i/20;
   assert.equal(h.passageAt(e,n)?.floor,-91);
  }
  assert.ok(h.deepHost.supportsArrival(site.lower.domainId,site.lower.foot));
  domain=site.lower.domainId;h.mounted.sync();
  assert.equal(lift.lower.visible,true);assert.equal(lift.upper.visible,false);
  for(let i=0;i<=20;i++){
   const a=site.approach.lower,b=site.lower.foot,e=a.east+(b.east-a.east)*i/20,n=a.north+(b.north-a.north)*i/20;
   assert.equal(h.deepHost.passageAt(domain,e,n)?.floor,-140);
  }
  assert.equal(lift.present(ride,13500,false),undefined);assert.equal(lift.bore.visible,false);
  assert.equal(lift.present(ride,13500,true)?.height,-115.5);assert.ok(lift.bore.visible);
  assert.equal(lift.present(ride,26000,true)?.arrived,true);assert.equal(lift.cage.visible,false);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
test('aperture leaves 4 nonoverlapping shell strips and accepted travel never changes the endpoint',()=>{
 const rect={minX:-6,maxX:6,minZ:0,maxZ:24},hole={minX:-1.1,maxX:1.1,minZ:.9,maxZ:3.1};
 const parts=splitR30LiftAperture(rect,hole);
 assert.equal(parts.length,4);assert.ok(Math.abs(parts.reduce((sum,p)=>sum+(p.maxX-p.minX)*(p.maxZ-p.minZ),0)-(288-4.84))<1e-8);
 assert.equal(sampleR30InterlayerRide(ride,999),undefined);
 assert.equal(sampleR30InterlayerRide({...ride,toDomain:'west'},13500),undefined);
 assert.equal(sampleR30InterlayerRide(ride,1000)?.height,-91);
 assert.equal(sampleR30InterlayerRide(ride,26000)?.height,-140);
 assert.equal(sampleR30InterlayerRide({...ride,fromDomain:ride.toDomain,toDomain:ride.fromDomain},26000)?.height,-91);
});
