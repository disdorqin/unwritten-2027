import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundWaterState} from '../src/presence/underground-water-state.js';
import {r30DeepDomains,r30LinkDomain,r30DeepMouths} from '../tools/voxel-tavern/town-blockout/town-c-r30-deep-assembly.js';
import {r30DeepFrames,r30DepthLinks,r30DeepWorldFeet,r30LayerWorld,r30LinkPoint} from '../tools/voxel-tavern/town-blockout/town-c-r30-deep-layer-contract.js';
import {r30InterlayerLiftSite as lift,type R30InterlayerRide} from '../tools/voxel-tavern/town-blockout/town-c-r30-interlayer-lift.js';
type Foot={domainId:string;east:number;north:number;height:number};
test('real pinned C2 shells, actual mouths and original C movement host connect bidirectionally',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),water=createUndergroundWaterState({dawnEpoch:0,now:()=>0});
 let roomAccepted=false,waterAvailable=true,linkAccepted=true;
 let foot:Foot={domainId:r30DeepDomains.minus140,...r30DeepWorldFeet.minus140.exit};
 const mounted=mountUndergroundDomainHost({parent,road,readAcceptedDomainFoot:()=>foot,
  waterBridge:{readWaterSnapshot:()=>waterAvailable?water.tonight():undefined},
  deepRooms:{acceptsRoom:()=>roomAccepted,acceptsFrame:()=>roomAccepted,acceptsLink:()=>linkAccepted}});
 assert.equal(mounted.kind,'ready');if(mounted.kind!=='ready')assert.fail();const host=mounted;
 try{
  const a=host.deepAssembly;
  host.mounted.sync();assert.equal(a.openLinks().length,0);
  const stop=parent.getObjectByName('r30-depth-stop/minus140-to-minus165/from')!;
  assert.ok(stop.visible);
  const probe=r30LayerWorld(r30DeepFrames.minus140,{east:0,north:197.6,height:0});
  assert.ok(host.deepHost.mounted!.passageAt(probe.east,probe.north),'C2 physical aperture exists');
  assert.equal(host.domainPassageAt(foot.domainId,probe.east,probe.north),undefined,'closed physical stop blocks it');
  const ray=new Raycaster(new Vector3(foot.east,foot.height+1.5,-foot.north),
   new Vector3(probe.east-foot.east,0,-probe.north+foot.north).normalize(),0,3);
  parent.updateMatrixWorld(true);assert.ok(ray.intersectObject(stop,true).length);
  roomAccepted=true;host.mounted.sync();assert.equal(stop.visible,false);
  assert.ok(host.domainPassageAt(foot.domainId,probe.east,probe.north));
  linkAccepted=false;
  assert.equal(host.domainPassageAt(foot.domainId,probe.east,probe.north),undefined,'permission revoked before render sync');
  host.mounted.sync();assert.ok(stop.visible);
  linkAccepted=true;host.mounted.sync();assert.equal(stop.visible,false);
  assert.deepEqual(a.availableLayers(),['minus165','minus190']);assert.equal(a.openLinks().length,2);
  assert.ok(parent.getObjectByName('town-c2-r30-tavern-dressing'));assert.ok(parent.getObjectByName('town-c2-r30-remnant-ring'));
  let steps=0,distance=0;
  function walk(target:{east:number;north:number}){
   const start={...foot},d=Math.hypot(target.east-start.east,target.north-start.north),n=Math.max(1,Math.ceil(d/1.0));
   for(let i=1;i<=n;i++){
    const dest={east:start.east+(target.east-start.east)*i/n,north:start.north+(target.north-start.north)*i/n};
    const next=host.resolveUndergroundStep(foot,dest,'standing');
    assert.ok(next,'blocked '+foot.domainId+' '+JSON.stringify(dest));foot=next.foot;steps++;
   }distance+=d;
  }
  function transfer(domain:string){
   const result=a.resolveHandoff(foot,domain);
   assert.ok(result,'handoff '+foot.domainId+' -> '+domain);foot={...result.to};host.mounted.sync();
  }
  const city=r30DeepDomains.minus165,palace=r30DeepDomains.minus190;
  for(const link of r30DepthLinks)for(const side of ['from','to'] as const){
   const mouth=r30DeepMouths[link.id as keyof typeof r30DeepMouths][side];
   const gate=parent.getObjectByName('r30-depth-stop/'+link.id+'/'+side);
   assert.ok(gate&&!gate.visible);
   const p=r30LayerWorld(r30DeepFrames[mouth.layer],{east:mouth.axis==='east'?mouth.at:mouth.centre,north:mouth.axis==='north'?mouth.at:mouth.centre,height:0});
   assert.equal(a.blocksLayerBoundary(r30DeepDomains[mouth.layer],p),false);
   linkAccepted=false;assert.equal(a.blocksLayerBoundary(r30DeepDomains[mouth.layer],p),true);
   linkAccepted=true;
  }
  const cityPoint=(e:number)=>r30LayerWorld(r30DeepFrames.minus165,{east:e,north:0,height:0});
  const palacePoint=(e:number,n:number)=>r30LayerWorld(r30DeepFrames.minus190,{east:e,north:n,height:0});
  const palaceRoute=[[0,.5],[0,8.5],[0,17],[0,38],[0,50],[12,50],[12,64],[8,64],[8,74],[8,89],[0,93],[0,101.5],[0,112],[0,125.4]] as const;
  for(const [i,link] of r30DepthLinks.entries()){
   transfer(r30LinkDomain(link));linkAccepted=false;assert.equal(host.domainPassageAt(foot.domainId,foot.east,foot.north),undefined);linkAccepted=true;
   walk(link.end);transfer(i===0?city:palace);
   if(i===0)walk(cityPoint(179));
  }
  for(const p of palaceRoute.slice(1))walk(palacePoint(p[0],p[1]));assert.ok(Math.abs(foot.height-r30DeepWorldFeet.minus190.exit.height)<.001);
  for(const p of palaceRoute.slice(0,-1).reverse())walk(palacePoint(p[0],p[1]));
  for(const i of [1,0]){
   const link=r30DepthLinks[i];transfer(r30LinkDomain(link));walk(link.start);transfer(i===1?city:r30DeepDomains.minus140);
   if(i===1)walk(cityPoint(1));
  }
  assert.ok(Math.hypot(foot.east-r30DeepWorldFeet.minus140.exit.east,foot.north-r30DeepWorldFeet.minus140.exit.north)<.001);
  assert.ok(steps>1000&&distance>1100);
  console.log(JSON.stringify({steps,distance,links:a.openLinks(),sceneSource:'C2@24c56fb1'}));
  waterAvailable=false;assert.equal(host.deepHost.acceptsMouth(a.contracts[0].mouths.from),false);
  roomAccepted=false;host.mounted.sync();assert.equal(a.openLinks().length,0);
 }finally{host.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
test('actual lower roof shutter and upper floor are coupled to the same accepted interlayer ride',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),water=createUndergroundWaterState({dawnEpoch:0,now:()=>0});
 let now=1000,certified=false,ride:R30InterlayerRide|undefined;
 const host=mountUndergroundDomainHost({parent,road,readAcceptedDomainFoot:()=>({domainId:lift.lower.domainId,...lift.lower.foot}),
  waterBridge:{readWaterSnapshot:()=>water.tonight()},interlayerRide:{lowerOpeningCertified:()=>certified,read:()=>ride,now:()=>now}});
 assert.equal(host.kind,'ready');if(host.kind!=='ready')assert.fail();
 try{
  host.mounted.sync();const mine=host.deepHost.mounted!;
  const ray=()=>{parent.updateMatrixWorld(true);return new Raycaster(new Vector3(lift.lower.foot.east,lift.lower.foot.height+4,-lift.lower.foot.north),new Vector3(0,1,0),0,2).intersectObject(mine.group,true).filter(h=>{let o:typeof h.object|null=h.object;while(o){if(!o.visible)return false;o=o.parent}return true})};
  assert.ok(ray().length,'lower cap visible and solid before permission');assert.equal(host.mounted.hasUpperLiftAperture(),false);
  certified=true;host.mounted.sync();assert.equal(host.mounted.hasUpperLiftAperture(),true);assert.ok(ray().length);
  ride={id:1,linkId:'mine1-mine2-lift',riderId:'fixture',fromDomain:lift.upper.domainId,toDomain:lift.lower.domainId,departedAt:1000,travelMs:25000};now=13500;host.mounted.sync();
  assert.equal(ray().length,0,'physical lower roof no longer intersects cage axis');assert.equal(mine.passageAt(lift.lower.foot.east,lift.lower.foot.north),undefined);
  now=26000;host.mounted.sync();assert.ok(ray().length);assert.ok(mine.passageAt(lift.lower.foot.east,lift.lower.foot.north));
 }finally{host.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
