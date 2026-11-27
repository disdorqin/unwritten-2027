import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3,Box3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMineCart} from '../src/presence/underground-mine-cart.js';
import type {MineCartSnapshot,MineCartPush,MineCartPoint as Point} from '../src/shared/underground-mine-cart-track.js';
test('U7 original two-push toy is usable on actual sloped rails and leaves a pedestrian detour',()=>{
 const parent=new Group();let approved=false,foot:Point|undefined,domainId='underground/mine',snapshot:MineCartSnapshot|undefined,rolls=0;
 let authority:ReturnType<typeof createUndergroundMineCart>|undefined;
 const requests:MineCartPush[]=[];
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),
 tutorialCartBridge:{acceptsTrack:()=>approved,readSnapshot:()=>snapshot,readViewer:()=>foot&&{playerId:'miner',domainId,foot},
  canSee:()=>true,dispatch:(_id,r)=>requests.push(r),onRoll:()=>rolls++}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||h.tutorialCart?.kind!=='ready')assert.fail();
 try{
  const a=h.tutorialCart,track=a.track;assert.ok(track.length>1.4&&track.length<1.41);
  assert.equal(a.group.visible,false);assert.equal(a.prompt(),undefined);
  authority=createUndergroundMineCart({track,domainId,pushReach:.65,readAcceptedFoot:id=>foot&&{playerId:id,domainId,...foot},
   canRoll:()=>true});
  approved=true;snapshot=authority.snapshot();h.mounted.sync();
  assert.equal(a.group.visible,true);
  parent.updateMatrixWorld(true);const rail=h.mounted.group.getObjectByName('underground-mine-rail')!;
  for(const side of [-.5,.5]){
   const p=track.point(0),e=p.east+Math.cos(track.heading)*side,n=p.north+Math.sin(track.heading)*side;
   const hit=new Raycaster(new Vector3(e,p.height+.2,-n),new Vector3(0,-1,0),0,.4).intersectObject(rail)[0];
   assert.ok(hit&&Math.abs(hit.point.y-p.height)<.001);
  }
  const at=track.point(0);assert.equal(h.passageAt(at.east,at.north),undefined);
  for(const [direction,step] of [[1,0],[1,1],[-1,2],[-1,1]] as const){
   foot=track.approach(step,direction);assert.ok(h.passageAt(foot.east,foot.north));
   assert.ok(a.press('u7/push/'+direction));const r=requests.pop()!;
   assert.equal(r.direction,direction);const next=authority.push('miner',r);assert.ok(next);
   assert.equal(authority.push('miner',r),undefined,'stale revision');
   snapshot=next;h.mounted.sync();a.update(1);
   const p=track.point(next.step);assert.ok(Math.hypot(a.group.position.x-p.east,a.group.position.z+p.north,a.group.position.y-p.height)<.001);
   assert.equal(h.passageAt(p.east,p.north),undefined);
  }
  assert.equal(rolls,4);
  const before=track.point(0),after=track.point(2),side=(p:Point)=>({east:p.east+Math.cos(track.heading)*1.25,north:p.north+Math.sin(track.heading)*1.25,height:p.height});
  let prev=side(before);
  for(let i=1;i<=30;i++){
   const to=side(track.point(2*i/30)),move=h.resolveMineStep(prev,to,'standing');assert.ok(move,'side bypass '+i);prev=move.foot;
  }
  domainId='underground/crystal';foot=track.approach(0,1);assert.equal(a.prompt(),undefined);
  domainId='underground/mine';snapshot={step:2,revision:0};h.mounted.sync();assert.equal(a.group.visible,false);assert.equal(a.prompt(),undefined);
  snapshot=authority.snapshot();h.mounted.sync();assert.equal(a.group.visible,true);
  approved=false;h.mounted.sync();assert.equal(a.group.visible,false);assert.ok(h.passageAt(at.east,at.north));
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
