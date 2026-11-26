import assert from 'node:assert/strict';
import test from 'node:test';
import {Group,Vector3,Raycaster} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundWaterState} from '../src/presence/underground-water-state.js';
import {createWarriorCityCandidate} from '../tools/voxel-tavern/town-blockout/underground-warrior-city-candidate.js';
import {createUndergroundPalaceShell} from '../tools/fixtures/underground-palace-d-shell-snapshot.js';
import {r30DeepDomains,r30LinkDomain,r30DeepMouths,type R30DeepAssemblyBridge} from '../tools/voxel-tavern/town-blockout/town-c-r30-deep-assembly.js';
import {r30DeepFrames,r30DepthLinks,r30LinkPoint,r30DeepWorldFeet} from '../tools/voxel-tavern/town-blockout/town-c-r30-deep-layer-contract.js';
/** The old palace is a test-only faithful source snapshot. Mouth and room
 * acceptance below are deliberate test inputs, not actual C2 authorization. */
test('registered deep assembly mounts real local source geometry, joins graded links, denies absent or revoked acceptance',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),water=createUndergroundWaterState({dawnEpoch:0,now:()=>0});
 let accepted=false,mouths=false,linkRooms=false,waterAvailable=true;
 let foot:{domainId:string;east:number;north:number;height:number}={domainId:r30DeepDomains.minus140,...r30DeepWorldFeet.minus140.exit};
 let city:ReturnType<typeof createWarriorCityCandidate>|undefined,palace:ReturnType<typeof createUndergroundPalaceShell>|undefined;
 let mounts=0;
 const bridge:R30DeepAssemblyBridge={
  acceptsLayer:()=>accepted,
  mountLayer(layer){
   mounts++;
   if(layer==='minus165'){
    city=createWarriorCityCandidate();
    const scene=city;
    return {group:scene.group,passageLocal(e,n,r,h){if(h<=1.8&&scene.canStand(e,n,0,r))return {floor:0,clearance:1.8}},
     acceptsMouth:()=>mouths,dispose:scene.dispose};
   }
   palace=createUndergroundPalaceShell();const scene=palace;
   return {group:scene.group,passageLocal(e,n,r,h){const y=scene.floorAt(e,n);if(y!==undefined&&h<=1.8&&scene.canStand(e,n,r))return {floor:y,clearance:1.8}},
    acceptsMouth:()=>mouths,dispose:scene.dispose};
  },
  acceptsSecondMineMouth:()=>mouths,
  acceptsLink:()=>linkRooms,
 };
 const host=mountUndergroundDomainHost({parent,road,deepAssemblyBridge:bridge,
  waterBridge:{readWaterSnapshot:()=>waterAvailable?water.tonight():undefined},readAcceptedDomainFoot:()=>foot});
 assert.equal(host.kind,'ready');if(host.kind!=='ready')assert.fail();
 try{
  const a=host.deepAssembly;
  host.mounted.sync();assert.equal(mounts,0);assert.deepEqual(a.openLinks(),[]);
  accepted=true;host.mounted.sync();assert.equal(mounts,2);
  assert.deepEqual(a.availableLayers(),['minus165','minus190']);assert.deepEqual(a.openLinks(),[]);
  assert.ok(city&&palace);
  for(const [layer,g] of [['minus165',city.group],['minus190',palace.group]] as const){
   parent.updateMatrixWorld(true);
   const q=g.getWorldPosition(new Vector3()),p=r30DeepFrames[layer].worldOffset;
   assert.ok(Math.hypot(q.x-p.east,q.y-p.height,q.z+p.north)<1e-6);
   assert.equal(g.visible,false);
  }
  mouths=true;host.mounted.sync();assert.deepEqual(a.openLinks(),[],'room authorization is separate from socket');
  linkRooms=true;host.mounted.sync();assert.equal(a.openLinks().length,2);
  const links=r30DepthLinks;
  for(const link of links){
   const domain=r30LinkDomain(link),contract=a.contracts.find(c=>c.id===link.id)!;
   foot={...contract.entry};host.mounted.sync();
   assert.equal(a.resolveHandoff({...foot,east:foot.east+10},domain),undefined);
   const handoff=a.resolveHandoff(foot,domain);assert.deepEqual(handoff?.to,contract.intoLinkFromStart);
   assert.equal(a.passageAt(domain,foot.east,foot.north),undefined,'render/arrival preflight never switches domain');
   foot={...handoff!.to};host.mounted.sync();assert.equal(a.activeDomain(),domain);
   const start=r30LinkPoint(link,0)!,next=r30LinkPoint(link,.5)!;
   assert.ok(host.domainPassageAt(domain,start.east,start.north));
   assert.equal(host.domainPassageAt(r30DeepDomains.minus140,start.east,start.north),undefined);
   const move=host.resolveUndergroundStep(foot,next,'standing');
   assert.ok(move&&Math.abs(move.foot.height-next.height)<1e-6&&move.foot.domainId===domain);
   assert.equal(host.resolveUndergroundStep({...foot,height:foot.height+.2},next,'standing'),undefined);
   const group=parent.getObjectByName('r30-depth-corridor/'+link.id)!;
   const floor=group.getObjectByName('depth-link-floor')!;
   parent.updateMatrixWorld(true);
   assert.equal(group.visible,true);
   for(let t=0;t<=link.length;t+=.25){
    const p=r30LinkPoint(link,t)!,q=a.passageAt(domain,p.east,p.north);
    assert.ok(q&&Math.abs(q.floor-p.height)<1e-6);
    const hit=new Raycaster(new Vector3(p.east,p.height+.3,-p.north),new Vector3(0,-1,0),0,.6).intersectObject(floor)[0];
    if(t>1e-5&&t<link.length-1e-5)assert.ok(hit&&Math.abs(hit.point.y-p.height)<.001,link.id+' floor '+t);
   }
   foot={...contract.intoLinkFromEnd};host.mounted.sync();
   assert.deepEqual(a.resolveHandoff(foot,contract.exit.domainId)?.to,contract.exit);
   foot={...contract.exit};host.mounted.sync();assert.equal(a.activeDomain(),contract.exit.domainId);
   assert.equal(a.passageAt(contract.exit.domainId,foot.east,foot.north)?.floor,foot.height);
  }
  assert.equal(a.supportsArrival(r30DeepDomains.minus190,r30DeepWorldFeet.minus190.exit),true);
  const first=a.contracts[0];foot={...first.intoLinkFromStart};host.mounted.sync();waterAvailable=false;host.mounted.sync();
  assert.equal(a.openLinks().includes(first.id),false);assert.equal(a.passageAt(first.domainId,foot.east,foot.north),undefined);
  accepted=false;host.mounted.sync();assert.deepEqual(a.availableLayers(),[]);assert.deepEqual(a.openLinks(),[]);
  assert.equal(city.group.visible,false);assert.equal(palace.group.visible,false);assert.equal(mounts,2);
 }finally{host.mounted.dispose()}
 assert.equal(parent.children.length,0);
 assert.equal(r30DeepMouths['minus140-to-minus165'].from.at,198);
 assert.equal(r30DeepMouths['minus165-to-minus190'].to.at,0);
});
