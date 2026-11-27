import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
test('horse memorial seat supports the original offering-gated request and preserves memorial approaches',()=>{
 const parent=new Group();let foot:{domainId:string;east:number;north:number;height:number}|undefined;
 let approved=false,offering=false,atOrigin=true,aim=true,player='p',requests=0;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>foot,
 horseSeatBridge:{acceptsSite:()=>approved,read:()=>({playerId:player,atOrigin,offeringAccepted:offering}),isAimingAt:()=>aim,dispatch:(id,key)=>{assert.equal(id,'p');assert.equal(key,'star-stone:horse');requests++}}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||!h.horseSeat)assert.fail();
 try{
  const seat=h.horseSeat,s=seat.site,mem=h.mounted.camp!.memorial;
  assert.equal(seat.stone.visible,false);
  const m=h.mounted.toWorld(mem.approach)!;
  foot={...m,domainId:s.domainId};h.mounted.sync();
  const walk=(p:{east:number;north:number})=>{const a=foot!,count=Math.max(1,Math.ceil(Math.hypot(a.east-p.east,a.north-p.north)/.08));
   for(let i=1;i<=count;i++){const q={east:a.east+(p.east-a.east)*i/count,north:a.north+(p.north-a.north)*i/count},next=h.resolveUndergroundStep(foot!,q,'standing');assert.ok(next,'step '+i);foot=next.foot}};
  walk(s.stand);assert.equal(h.passageAt(s.base.east,s.base.north),undefined);
  parent.updateMatrixWorld(true);
  assert.ok(new Raycaster(new Vector3(s.base.east,s.base.height+1,-s.base.north),new Vector3(0,-1,0),0,1.1).intersectObject(seat.group,true).length);
  assert.ok(Math.hypot(s.base.east-s.legacyBase.east,s.base.north-s.legacyBase.north)>6);
  assert.equal(seat.press(s.id),false);approved=true;h.mounted.sync();assert.equal(seat.stone.visible,true);
  assert.equal(seat.press(s.id),false);offering=true;aim=false;assert.equal(seat.press(s.id),false);
  aim=true;assert.ok(seat.press(s.id));assert.equal(requests,1);assert.equal(seat.stone.visible,true);
  atOrigin=false;h.mounted.sync();assert.equal(seat.stone.visible,false);assert.equal(seat.press(s.id),false);
  atOrigin=true;h.mounted.sync();player='q';offering=false;assert.equal(seat.press(s.id),false);
  walk(m);assert.ok(h.passageAt(m.east,m.north));
  for(const n of mem.niches){const q=h.mounted.toWorld([n.position[0],mem.approach[1],mem.approach[2]])!;assert.ok(h.passageAt(q.east,q.north))}
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
