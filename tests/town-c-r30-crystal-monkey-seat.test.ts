import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {crystalCavernToWorld,crystalCavernTrailEast,crystalCavernTrailHeight} from '../tools/voxel-tavern/town-blockout/underground-crystal-cavern.js';
test('monkey socket preserves old horizontal anchors, surveyed feet and only accepted resonance pickup',()=>{
 const parent=new Group();let foot:{domainId:string;east:number;north:number;height:number}|undefined;
 let frameAccepted=true,siteAccepted=false,atOrigin=true,resonant=false,aim=true,requests=0;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>foot,
 crystalBridge:{acceptsFrame:()=>frameAccepted,readGateStage:()=>'open',monkeySeat:{acceptsSite:()=>siteAccepted,read:()=>({atOrigin,resonant}),readPlayerId:()=> 'p',isAimingAt:()=>aim,dispatch:(p,id)=>{assert.equal(p,'p');assert.equal(id,'star-stone:monkey');requests++}}}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  h.mounted.sync();const ch=h.crystalHost,c=ch.contract!,seat=ch.monkey!,s=seat.site;
  assert.ok(seat);assert.equal(seat.stoneMesh?.visible,false);
  assert.equal(s.base.east,s.legacyBase.east);assert.equal(s.base.north,s.legacyBase.north);
  assert.ok(Math.abs(s.stand.height-s.legacyStand.height-.28169072164948)<.001);
  foot={...c.crystal};h.mounted.sync();
  const walk=(p:{east:number;north:number})=>{
   const a=foot!,steps=Math.max(1,Math.ceil(Math.hypot(a.east-p.east,a.north-p.north)/.08));
   for(let i=1;i<=steps;i++){
    const q={east:a.east+(p.east-a.east)*i/steps,north:a.north+(p.north-a.north)*i/steps},next=h.resolveUndergroundStep(foot!,q,'standing');
    assert.ok(next,'route '+i+'/'+steps);foot=next.foot;
   }
  };
  for(let n=-9.8;n<9.25;n+=.2)walk(crystalCavernToWorld(c.frame,[crystalCavernTrailEast(n),crystalCavernTrailHeight(n),n]));
  walk(crystalCavernToWorld(c.frame,[crystalCavernTrailEast(9.25),crystalCavernTrailHeight(9.25),9.25]));walk(s.stand);
  assert.ok(Math.abs(foot!.height-s.stand.height)<.001);
  assert.equal(ch.passageAt(s.domainId,s.base.east,s.base.north),undefined);
  parent.updateMatrixWorld(true);
  const floor=ch.mounted!.group.getObjectByName('r30-crystal-route-floor')!;
  const hits=new Raycaster(new Vector3(s.stand.east,s.stand.height+.2,-s.stand.north),new Vector3(0,-1,0),0,.4).intersectObject(floor);
  assert.ok(hits[0]&&Math.abs(hits[0].point.y-s.stand.height)<.001);
  assert.equal(seat.press(s.id),false);siteAccepted=true;h.mounted.sync();assert.equal(seat.stoneMesh?.visible,true);
  assert.equal(seat.press(s.id),false);resonant=true;aim=false;h.mounted.sync();assert.equal(seat.press(s.id),false);
  aim=true;assert.ok(seat.press(s.id));assert.equal(requests,1);assert.equal(seat.stoneMesh?.visible,true,'dispatch alone must not remove stone');
  atOrigin=false;h.mounted.sync();assert.equal(seat.stoneMesh?.visible,false);assert.equal(seat.press(s.id),false);
  atOrigin=true;h.mounted.sync();assert.equal(seat.stoneMesh?.visible,true,'authority return');
  frameAccepted=false;assert.equal(seat.press(s.id),false);h.mounted.sync();assert.equal(seat.stoneMesh?.visible,false);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
