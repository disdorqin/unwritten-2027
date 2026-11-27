import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {crystalCavernToWorld,crystalCavernTrailEast,crystalCavernTrailHeight} from '../tools/voxel-tavern/town-blockout/underground-crystal-cavern.js';
import {r30CrystalDomain} from '../tools/voxel-tavern/town-blockout/town-c-r30-crystal-support.js';
test('accepted crystal position selects nearest original six crystal fixtures within public residual budget',()=>{
 const parent=new Group();let foot:{domainId:string;east:number;north:number;height:number}|undefined,budget=2,accepted=true;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>foot,
  crystalBridge:{acceptsFrame:()=>accepted,readGateStage:()=>'open',readLightBudget:()=>budget}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  h.mounted.sync();const ch=h.crystalHost,c=ch.contract!,lights=ch.mounted!.lights;
  assert.equal(lights.length,6);assert.equal(lights.some(l=>l.visible),false);
  const set=(n:number,e=crystalCavernTrailEast(n))=>{
   const y=crystalCavernTrailHeight(n);
   foot={domainId:r30CrystalDomain,...crystalCavernToWorld(c.frame,[e,y,n])};h.mounted.sync();
   const rank=lights.map((l,i)=>({i,d:Math.hypot(l.position.x-e,l.position.y-y,-l.position.z-n)})).sort((a,b)=>a.d-b.d||a.i-b.i);
   const actual=lights.flatMap((l,i)=>l.visible?[i]:[]);
   assert.deepEqual(actual,rank.slice(0,Math.min(4,Math.max(0,Math.floor(budget)))).map(x=>x.i).sort((a,b)=>a-b));
   return actual;
  };
  const first=set(-9.9),middle=set(55),far=set(94);
  assert.notDeepEqual(first,far);assert.notDeepEqual(middle,far);
  budget=20;assert.equal(set(76,24.5).length,4);
  budget=0;assert.equal(set(76,24.5).length,0);
  budget=2;set(55);foot={...foot!,domainId:'underground/mine'};h.mounted.sync();assert.equal(lights.some(l=>l.visible),false);
  set(55);accepted=false;h.mounted.sync();assert.equal(lights.some(l=>l.visible),false);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
