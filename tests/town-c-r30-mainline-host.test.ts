import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3,InstancedMesh,Matrix4} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMainlineCart} from '../src/presence/underground-mainline-cart.js';
import type {R30MainlineBridge} from '../tools/voxel-tavern/town-blockout/town-c-r30-mainline-host.js';
import type {UndergroundMainlinePoint} from '../src/shared/underground-mainline-track.js';
test('real 123m U19 host: track support and railheads, repair, low-speed ride, switch, station and recall',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 let accepted=false,now=1000,foot:UndergroundMainlinePoint|undefined,authority:ReturnType<typeof createUndergroundMainlineCart>|undefined;
 let intents:Parameters<R30MainlineBridge['dispatch']>[0][]=[];
 const layer='underground/mine';
 const bridge:R30MainlineBridge={acceptsRoute:()=>accepted,readSnapshot:()=>authority?.snapshot(),
  readViewer:()=>foot&&{domainId:layer,playerId:'miner',foot},readLightBudget:()=>2,
  canSee:()=>true,dispatch:i=>intents.push(i)};
 const h=mountUndergroundDomainHost({parent,road,mainlineBridge:bridge});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const m=h.mainline;assert.equal(m?.kind,'ready');if(m?.kind!=='ready')assert.fail();
  const {route,scene}=m;assert.ok(route.length>123&&route.length<124);
  assert.equal(scene.r30Dressing!.footprints.filter(f=>f.role!=='dead-siding-buffer').length,6);
  assert.equal(scene.r30Dressing!.sidingBuilt,true);
  assert.equal(scene.cart.visible,false);assert.equal(scene.prompt(),undefined);
  const art=scene.r30Repair!;assert.equal(art.stages.length,10);assert.ok(art.stages.every(s=>s.damaged.visible&&!s.restored.visible));
  const floorMeshes=['underground-mine-rock','underground-mine-rail'].map(n=>h.mounted.group.getObjectByName(n)!);
  const rail=scene.group.getObjectByName('u19/r30-continuous-running-rails')!;
  parent.updateMatrixWorld(true);
  for(let t=0;t<route.length;t+=.2){
   const p=route.sample(t),f=p.position;
   assert.ok(h.passageAt(f.east,f.north),'route '+t);
   const hit=new Raycaster(new Vector3(f.east,-90.7,-f.north),new Vector3(0,-1,0),0,.6).intersectObjects(floorMeshes)[0];
   assert.ok(hit&&Math.abs(hit.point.y+91)<.001);
   for(const side of [-.5,.5]){
    const e=f.east+Math.cos(p.heading)*side,n=f.north+Math.sin(p.heading)*side;
    const contact=new Raycaster(new Vector3(e,-90.7,-n),new Vector3(0,-1,0),0,.5).intersectObject(rail)[0];
    assert.ok(contact&&Math.abs(contact.point.y-(-91+scene.railHead))<.001,'rail contact '+t+'/'+side);
   }
  }
  authority=createUndergroundMainlineCart({route,now:()=>now,readAcceptedFoot:id=>foot&&{...foot,domainId:layer,playerId:id},
    canUse:(_id,f,_t,kind)=>kind==='leave'||!!h.passageAt(f.east,f.north),
    canTransferOre:()=>false,playerCarryCapacity:()=>10,save:()=>{},
    config:{acceleration:.8,brakeDeceleration:1.5,maxSpeed:4,safeTurnoutSpeed:2,safeCurveSpeed:2,
     recallMetresPerSecond:3,maximumTickMs:1000,actionReachMetres:1.7}});
  const a=authority,rev=()=>a.snapshot().revision;accepted=true;h.mounted.sync();
  assert.equal(scene.cart.visible,true);assert.equal(scene.r30Dressing!.lamps.filter(l=>l.visible).length,2);
  // The cart model's actual wheel bottoms rest on the real rail heads.
  parent.updateMatrixWorld(true);
  const wheels=scene.cart.getObjectByName('mine-cart-four-rail-wheels') as InstancedMesh;
  wheels.geometry.computeBoundingBox();const matrix=new Matrix4();
  for(let i=0;i<wheels.count;i++){
   wheels.getMatrixAt(i,matrix);matrix.premultiply(wheels.matrixWorld);
   const b=wheels.geometry.boundingBox!.clone().applyMatrix4(matrix),center=b.getCenter(new Vector3());
   assert.ok(Math.abs(b.min.y-(-91+scene.railHead))<.001);
   const hit=new Raycaster(new Vector3(center.x,b.min.y+.2,center.z),new Vector3(0,-1,0),0,.4).intersectObject(rail)[0];
   // Rear axle extends beyond the exact station datum, so check the two
   // forward wheels; the end cap is checked on the full run below.
   assert.ok(hit&&Math.abs(hit.point.y-b.min.y)<.001);
  }
  for(const fault of ['sleepers','gauge','turnout-rust'] as const){
   foot=route.work[fault].position;
   const verbs=fault==='sleepers'?Array(3).fill('carry-sleeper'):fault==='gauge'?Array(3).fill('pry-gauge'):['knock-rust','knock-rust','knock-rust','apply-oil'];
   for(const verb of verbs){
    h.mounted.sync();assert.ok(scene.press('repair'));const i=intents.pop()!;
    assert.equal(i.fault,fault);assert.equal(i.verb,verb);
    const before=a.snapshot().faults[fault];assert.equal(art.stages.find(s=>s.fault===fault&&s.index===before)?.damaged.visible,true);
    assert.notEqual(a.repair('miner',i.revision,fault,verb),'rejected');now+=100;h.mounted.sync();
    assert.equal(art.stages.find(s=>s.fault===fault&&s.index===before)?.restored.visible,true);
   }
  }
  assert.equal(a.snapshot().mode,'stopped');assert.ok(art.stages.every(s=>!s.damaged.visible&&s.restored.visible));
  h.mounted.sync();foot=m.motion.boardingFoot();assert.ok(foot&&h.passageAt(foot.east,foot.north));assert.equal(h.passageAt(route.work.camp.position.east,route.work.camp.position.north),undefined);
  assert.ok(scene.press('board'));assert.ok(a.board('miner',rev()));h.mounted.sync();assert.ok(m.motion.riderPose('miner'));assert.equal(m.motion.riderPose('other'),undefined);assert.ok(a.go('miner',rev()));
  function rollUntilStop(){
   for(let i=0;i<1400&&a.snapshot().mode==='rolling';i++){
    const s=a.snapshot(),brake=s.speed>1.45;
    if(s.brakeHeld!==brake)assert.ok(a.brake('miner',rev(),brake));
    now+=200;assert.ok(a.tick(rev()));
    foot=route.sample(a.snapshot().chainage).position;
   }
   assert.equal(a.snapshot().mode,'stopped');
   assert.equal(a.snapshot().riderId,'miner');
  }
  rollUntilStop();assert.equal(a.snapshot().chainage,route.turnoutMetres);
  h.mounted.sync();const atSwitch=m.motion.riderPose('miner');assert.ok(atSwitch?.canLeave);const exit=m.motion.leaveFoot('miner');assert.ok(exit);assert.ok(a.leave('miner',rev()));foot=exit;h.mounted.sync();assert.ok(h.passageAt(foot.east,foot.north));assert.ok(scene.press('turnout',false,'gate'));
  assert.equal(intents.at(-1)?.target,'gate');assert.ok(a.switchTurnout('miner',rev(),'gate'));
  h.mounted.sync();foot=m.motion.boardingFoot();assert.ok(foot);assert.ok(a.board('miner',rev()));assert.ok(a.go('miner',rev()));rollUntilStop();
  assert.equal(a.snapshot().chainage,route.length);h.mounted.sync();
  assert.ok(m.motion.leaveFoot('miner'));assert.ok(a.leave('miner',rev()));foot=route.work.camp.position;h.mounted.sync();assert.equal(m.motion.riderPose('miner'),undefined);
  assert.ok(scene.press('winch',true));assert.ok(a.recall('miner',rev()));
  for(let i=0;i<100&&a.snapshot().mode==='recalling';i++){now+=1000;assert.ok(a.recallHold('miner',rev()))}
  assert.equal(a.snapshot().chainage,0);assert.equal(a.snapshot().riderId,undefined);h.mounted.sync();
  assert.equal(scene.cart.visible,true);
  foot=m.motion.boardingFoot();assert.ok(foot);assert.ok(a.board('miner',rev()));assert.ok(a.go('miner',rev()));h.mounted.sync();
  assert.equal(m.motion.leaveFoot('miner'),undefined);assert.equal(m.motion.riderPose('miner')?.canLeave,false);
  for(let i=0;i<500&&a.snapshot().mode==='rolling';i++){
   now+=200;assert.ok(a.tick(rev()));foot=route.sample(a.snapshot().chainage).position;
  }
  h.mounted.sync();assert.equal(a.snapshot().mode,'derailed');assert.equal(a.snapshot().riderId,'miner');
  const crash=m.motion.riderPose('miner');assert.equal(crash?.mode,'derailed');assert.ok(crash?.canLeave);
  assert.ok(m.motion.leaveFoot('miner'));assert.ok(scene.cart.visible);assert.ok(scene.press('leave'));assert.equal(intents.at(-1)?.role,'leave');
  accepted=false;h.mounted.sync();assert.equal(scene.cart.visible,false);assert.equal(m.motion.riderPose('miner'),undefined);
  assert.equal(scene.press('board'),false);assert.ok(art.stages.every(s=>s.damaged.visible&&!s.restored.visible));
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
