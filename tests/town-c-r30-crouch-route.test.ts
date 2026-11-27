import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
type Foot={east:number;north:number;height:number;domainId:string};
test('real low collapse has two readable exits and cannot be crossed upright in either direction',()=>{
 const parent=new Group();let accepted:Foot|undefined;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>accepted});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const route=h.crouchRoute;assert.equal(route.entries.length,2);assert.ok(route.parts>=56);
  const foot=(z:number,posture:'standing'|'crouching')=>{
   const p=h.mounted.toWorld([0,-91,z])!;
   const floor=h.floorAt(p.east,p.north,posture);assert.notEqual(floor,undefined);
   return {...p,height:floor!,domainId:'underground/mine'};
  };
  for(const [a,b] of [[31.18,35.82],[35.82,31.18]]){
   accepted=foot(a,'standing');assert.equal(h.crouchGuidance()?.mode,'standing-clear');
   const n=Math.ceil(Math.abs(b-a)/.08);let low=0;
   for(let k=1;k<=n;k++){
    const z=a+(b-a)*k/n,to=foot(z,'crouching'),p=h.resolveUndergroundStep(accepted,to,'crouching');
    assert.ok(p,'crouched retreat at '+z);
    if(p.requiresCrouch){low++;assert.equal(h.canStandUpInDomain(accepted.domainId,p.foot.east,p.foot.north),false);assert.equal(h.resolveUndergroundStep(accepted,to,'standing'),undefined)}
    accepted=p.foot;
    if(p.requiresCrouch)assert.equal(h.crouchGuidance()?.mode,'keep-crouched');
   }
   assert.ok(low>30);assert.equal(h.crouchGuidance()?.mode,'standing-clear');assert.ok(h.canStandUpInDomain(accepted.domainId,accepted.east,accepted.north));
  }
  accepted=foot(31.4,'standing');assert.equal(h.crouchGuidance()?.mode,'crouch-ahead');
  accepted={...accepted,domainId:'underground/crystal'};assert.equal(h.crouchGuidance(),undefined);
  accepted=undefined;assert.equal(h.crouchGuidance(),undefined);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
