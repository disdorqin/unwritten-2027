import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {firstMineShallowWorks as plan} from '../src/shared/town-c-first-mine-shallow-works.js';
test('three decorated shallow galleries preserve the actual exploratory loop and encounter feet',()=>{
 const parent=new Group(),h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773)});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const a=h.shallowGallery!;assert.equal(a.frames.length,17);assert.ok(a.bays.length>=4);assert.ok(a.parts.length>1000);
  const at=(x:number,z:number)=>h.mounted.toWorld([x,-91,z])!;
  const pass=(x:number,z:number)=>{const p=at(x,z);return h.passageAt(p.east,p.north)};
  parent.updateMatrixWorld(true);
  for(const f of a.footprints){
   const p=at(f.x,f.z);assert.equal(pass(f.x,f.z),undefined,f.id);
   // A reserved solid footprint must have visible geometry. Shelved
   // items can have open centres, so check nine vertical rays.
   assert.ok([-0.3,0,.3].some(dx=>[-.3,0,.3].some(dz=>{
    const q=at(f.x+dx*f.w,f.z+dz*f.d);
    return new Raycaster(new Vector3(q.east,q.height+f.h+.1,-q.north),new Vector3(0,-1,0),0,f.h+.2).intersectObject(a.group,true).length>0
   })),f.id);
  }
  let distance=0;
  for(const [i,b] of plan.path.slice(1).entries()){
   const a=plan.path[i],n=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.ceil(n/.1);distance+=n;
   for(let k=0;k<=steps;k++){const x=a[0]+(b[0]-a[0])*k/steps,z=a[1]+(b[1]-a[1])*k/steps;assert.ok(pass(x,z),x+','+z)}
  }
  assert.ok(distance>230);assert.ok(a.bays.every(b=>pass(...b.approach)));
  const way=h.shallowWayfinding!;assert.equal(way.boards.length,5);assert.equal(way.markers.length,19);
  for(const m of way.markers){
   const q=plan.path[m.segment],r=plan.path[m.segment+1];
   assert.ok((q[0]-r[0])*m.dx+(q[1]-r[1])*m.dz>0);
   for(let k=0;k<=5;k++)assert.ok(pass(m.x+m.dx*k*.1,m.z+m.dz*k*.1));
  }
  for(const b of way.boards)assert.ok(a.frames.some(f=>f.x===b.x&&f.z===b.z));
  assert.equal(h.oreSurvey.kind,'ready');assert.equal(h.encounterSurvey?.ready,true);assert.equal(h.encounterSurvey?.groups.length,16);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
