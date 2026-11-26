import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Box3,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost,undergroundMineSpec} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';
test('retired rail equipment has real bounds and west haulage route remains traversable',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773),host=mountUndergroundDomainHost({parent,road});
 assert.equal(host.kind,'ready');if(host.kind!=='ready')assert.fail();
 try{
  const bay=host.mounted.workbay!;assert.equal(bay.cartCount,2);assert.ok(bay.parts>350);
  const mine=createUndergroundMineLayout(undergroundMineSpec);
  for(const b of bay.boxes){
   assert.ok(b.min.x>=-20&&b.max.x<=-4.2&&b.min.z>=71.6&&b.max.z<=81.1);
   assert.ok(b.min.y>=-91.001&&b.max.y<=-84.6);
  }
  for(const x of [-10.1,-16.1]){
   const p:{east:number;north:number;height:number}=host.mounted.toWorld([x,-91,73.45])!;
   assert.equal(host.passageAt(p.east,p.north),undefined);
  }
  const world=(x:number,z:number)=>host.mounted.toWorld([x,-91,z])!;
  let foot=world(0,76);
  for(let x=-.1;x>=-30.01;x-=.1){
   const next=world(x,76),move=host.resolveMineStep(foot,next,'standing');
   assert.ok(move,'blocked west haulage at '+x);foot=move.foot;
  }
  // The original middle nest and former cart workface remain independently accessible.
  for(const [x,z] of [[-25,79.5],[-22,74.3],[-13,77.9]]){
   const p=world(x,z);assert.ok(host.passageAt(p.east,p.north),'approach '+x+','+z);
  }
  const desk=world(-16.25,79.95);
  assert.equal(host.passageAt(desk.east,desk.north),undefined);
 }finally{host.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
