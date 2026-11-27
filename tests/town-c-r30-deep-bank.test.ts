import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {firstMineDeepWorks as plan} from '../src/shared/town-c-first-mine-deep-works.js';
test('surveyed deep bank dressing keeps both retreat paths, actual wet strip and ore/encounter approaches',()=>{
 const parent=new Group(),h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773)});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const bank=h.deepBank!;assert.equal(bank.faces.length,59);assert.equal(bank.feet.length,11);assert.ok(bank.parts.length>2600);
  const p=(x:number,z:number,y=-91)=>h.mounted.toWorld([x,y,z])!;
  const pass=(x:number,z:number)=>{const q=p(x,z);return h.passageAt(q.east,q.north)};
  parent.updateMatrixWorld(true);
  const rock=h.mounted.group.getObjectByName('underground-mine-rock')!;
  for(const f of bank.faces){
   const q=p(f.x,f.z,-90),a=p(f.x+f.nx*.4,f.z+f.nz*.4,-90),v=new Vector3(q.east-a.east,0,-q.north+a.north).normalize();
   const hit=new Raycaster(new Vector3(a.east,a.height,-a.north),v,0,.5).intersectObject(rock)[0];
   assert.ok(hit&&Math.abs(hit.distance-.4)<.002);
  }
  for(const f of bank.feet){
   assert.equal(pass(f.x,f.z),undefined,f.id);
   assert.ok([-.3,0,.3].some(dx=>[-.3,0,.3].some(dz=>{const q=p(f.x+dx*f.w,f.z+dz*f.d);return new Raycaster(new Vector3(q.east,q.height+f.h+.1,-q.north),new Vector3(0,-1,0),0,f.h+.2).intersectObject(bank.group,true).length>0})),f.id);
  }
  for(const path of [plan.westPath,plan.eastDryPath])for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1);
   for(let j=0;j<=n;j++){
    const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n;
    // The historical route crosses U19 rail. Fixed station footprints
    // can occupy its exact centre; preserve a traversable lane nearby.
    assert.ok([0,-.5,.5,-1,1,-1.5,1.5].some(dx=>pass(x+dx,z)?.waterDepth===0),'dry retreat '+x+','+z);
   }
  }
  for(let z=114;z<=136;z+=.5){const q=pass(5.8,z);assert.ok(q&&Math.abs(q.waterDepth-.12)<.001)}
  assert.equal(h.oreSurvey.kind,'ready');assert.equal(h.encounterSurvey?.ready,true);assert.equal(h.mainline?.kind,'ready');
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
