import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {r30ReturnBay as site,r30ReturnBayFloor,r30ReturnBayFixtures} from '../src/shared/town-c-r30-return-bay.js';
import {isMinePresenceFoot} from '../src/shared/underground-mine-presence-domain.js';
test('separate return station has two reachable real feet, a solid roof and no unauthorized exit',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),h=mountUndergroundDomainHost({parent,road});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const bay=h.returnBay,contract=bay.contract!;assert.ok(bay.parts.length>=100);assert.ok(contract);
  assert.equal(contract.productionReady,false);assert.equal(contract.returnSurface,undefined);
  const world=(x:number,z:number)=>h.mounted.toWorld([x,r30ReturnBayFloor(z),z])!;
  assert.ok(Math.hypot(contract.dock.east-h.mounted.poolWorld.east,contract.dock.north-h.mounted.poolWorld.north)>14);
  for(const p of [contract.call,contract.dock])assert.ok(isMinePresenceFoot(p.east,p.north,p.height));
  const meshes=['underground-mine-rock','underground-mine-rail'].map(name=>h.mounted.group.getObjectByName(name)!);
  parent.updateMatrixWorld(true);
  let foot=world(0,15.8);
  const path=[[site.dock.x,site.dock.z],[-3,15.8],[site.call.x,site.call.z]] as const;
  let ax=0,az=15.8;
  for(const [x,z] of path){
   const count=Math.ceil(Math.hypot(x-ax,z-az)/.08);
   for(let i=1;i<=count;i++){
    const p=world(ax+(x-ax)*i/count,az+(z-az)*i/count);
    const step=h.resolveMineStep(foot,p,'standing');assert.ok(step,'blocked '+x+'/'+z+'/'+i);
    const hit=new Raycaster(new Vector3(p.east,p.height+.3,-p.north),new Vector3(0,-1,0),0,.6).intersectObjects(meshes)[0];
    assert.ok(hit&&Math.abs(hit.point.y-p.height)<.001);foot=step.foot;
   }
   ax=x;az=z;
  }
  for(const p of [contract.dock,contract.call]){
   const ceiling=new Raycaster(new Vector3(p.east,p.height+.25,-p.north),new Vector3(0,1,0),0,4).intersectObjects(meshes)[0];
   assert.ok(ceiling&&Math.abs(ceiling.point.y-p.height-3.5)<.001);
  }
  for(const p of bay.parts){
   if(p.fixture===undefined)continue;
   const f=r30ReturnBayFixtures[p.fixture];
   assert.ok(Math.abs(p.at[0]-f.x)+p.size[0]/2<=f.width/2+1e-6);
   assert.ok(Math.abs(p.at[2]-f.z)+p.size[2]/2<=f.depth/2+1e-6);
   assert.ok(p.at[1]+p.size[1]/2<=r30ReturnBayFloor(f.z)+f.height+1e-6);
  }
  const lever=world(site.lever.x,site.lever.z);assert.equal(h.passageAt(lever.east,lever.north),undefined);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
