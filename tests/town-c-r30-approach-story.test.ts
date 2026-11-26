import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
test('mine approach fixtures sit on real supports, stay off without shared budget and preserve the safe collapse path',()=>{
 const parent=new Group();let foot:{east:number;north:number;height:number;domainId:string}|undefined,budget=0;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>foot,readIntroLightBudget:()=>budget});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||!h.approachStory)assert.fail();
 try{
  const a=h.approachStory;assert.equal(a.lanterns.length,3);assert.equal(a.boxes.length,2);assert.ok(a.parts>=64);
  const lit=()=>a.lanterns.filter(l=>l.light.visible).length;
  const point=(x:number,z:number)=>h.mounted.toWorld([x,-91,z])!;
  const at=point(0,22.4),p=h.passageAt(at.east,at.north)!;
  foot={...at,height:p.floor,domainId:'underground/mine'};
  h.mounted.sync();assert.equal(lit(),0);budget=1;h.mounted.sync();assert.equal(lit(),1);
  assert.ok(a.lanterns[1].light.visible);budget=9;h.mounted.sync();assert.ok(lit()<=2);
  foot={...foot,domainId:'underground/crystal'};h.mounted.sync();assert.equal(lit(),0);
  foot=undefined;h.mounted.sync();assert.equal(lit(),0);
  parent.updateMatrixWorld(true);
  for(const f of a.boxes){
   const p=point(f.x,f.z);assert.equal(h.passageAt(p.east,p.north),undefined);
   assert.ok(new Raycaster(new Vector3(p.east,f.maxY+.2,-p.north),new Vector3(0,-1,0),0,f.maxY-f.minY+.3).intersectObject(a.group,true).length);
  }
  let prev=point(0,28);prev.height=h.passageAt(prev.east,prev.north)!.floor;
  for(let z=28.08;z<=35.9;z+=.08){const q=point(0,z),step=h.resolveMineStep(prev,q,'crouching');assert.ok(step,'retreat '+z);prev=step.foot}
  assert.equal(h.tutorialCart?.kind,'ready');assert.equal(h.encounterSurvey?.ready,true);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
