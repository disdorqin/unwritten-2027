import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Matrix4,Box3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMainlineCart,type U19MineCartSnapshot} from '../src/presence/underground-mainline-cart.js';
import type {UndergroundMainlinePoint} from '../src/shared/underground-mainline-track.js';
test('two accepted players share one cart and projected cargo; failed or stale transaction cannot change the ore bin',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 let state:U19MineCartSnapshot|undefined,viewer='miner',foot:UndergroundMainlinePoint|undefined;
 const h=mountUndergroundDomainHost({parent,road,mainlineBridge:{
  acceptsRoute:()=>true,readSnapshot:()=>state,readViewer:()=>foot&&{playerId:viewer,domainId:'underground/mine',foot},
  readLightBudget:()=>0,canSee:()=>true,dispatch:()=>{}
 }});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||h.mainline?.kind!=='ready')assert.fail();
 try{
  const {route,scene,motion}=h.mainline,art=scene.r30Cargo!;
  let time=1000,fail=false;
  const inventories=new Map([['miner',10],['helper',0]]);
  // Fixture-only atomic ledger: exercise the original authority's save
  // callback, not a new production inventory implementation.
  const a=createUndergroundMainlineCart({route,now:()=>time,
   initial:{revision:0,mode:'stopped',lastAtMs:1000,chainage:0,speed:0,brakeHeld:false,turnout:'gate',faults:{sleepers:3,gauge:3,'turnout-rust':4},cargo:{oreId:'',pieces:0}},
   readAcceptedFoot:id=>foot&&{...foot,domainId:route.domainId,playerId:id},
   canUse:()=>true,playerCarryCapacity:()=>10,
   canTransferOre:(id,ore,n,dir)=>ore==='fixture-ore'&&(dir==='unload'||(inventories.get(id)??0)>=n),
   save(s,transfer){if(fail)throw Error('fixture escrow rollback');if(transfer)inventories.set(transfer.playerId,(inventories.get(transfer.playerId)??0)+(transfer.direction==='load'?-transfer.pieces:transfer.pieces));state=s},
   config:{acceleration:.8,brakeDeceleration:1.5,maxSpeed:4,safeTurnoutSpeed:2,safeCurveSpeed:2,recallMetresPerSecond:3,maximumTickMs:1000,actionReachMetres:1.7}});
  const sync=()=>{state=a.snapshot();h.mounted.sync()},rev=()=>a.snapshot().revision;
  sync();foot=motion.boardingFoot();assert.ok(foot);assert.equal(art.mesh.count,0);assert.equal(scene.prompt('unload'),undefined);
  assert.ok(a.cargo('miner',rev(),'load','fixture-ore',10));sync();assert.equal(inventories.get('miner'),0);assert.equal(art.mesh.count,30);assert.equal(art.group.visible,true);
  const box=new Box3();art.mesh.geometry.computeBoundingBox();
  for(let i=0;i<art.mesh.count;i++){const matrix=new Matrix4();art.mesh.getMatrixAt(i,matrix);box.copy(art.mesh.geometry.boundingBox!).applyMatrix4(matrix);assert.ok(box.min.x>-.40&&box.max.x<.40&&box.min.z>-.51&&box.max.z<.51&&box.min.y>=.36&&box.max.y<.73)}
  const revision=rev();fail=true;assert.throws(()=>a.cargo('helper',revision,'unload','fixture-ore',3),/rollback/);sync();assert.equal(art.mesh.count,30);assert.equal(inventories.get('helper'),0);
  fail=false;assert.ok(a.cargo('helper',revision,'unload','fixture-ore',3));sync();assert.equal(art.mesh.count,21);assert.equal(inventories.get('helper'),3);
  assert.equal(a.cargo('helper',revision,'unload','fixture-ore',3),false);
  assert.ok(a.board('miner',rev()));sync();assert.equal(a.board('helper',rev()),false);assert.equal(motion.riderPose('helper'),undefined);assert.ok(motion.riderPose('miner'));
  assert.equal(a.cargo('helper',rev(),'unload','fixture-ore',7),false);assert.ok(a.leave('miner',rev()));sync();viewer='helper';foot=motion.boardingFoot();assert.ok(foot);assert.ok(scene.prompt('unload'));
  assert.ok(a.cargo('helper',rev(),'unload','fixture-ore',7));sync();assert.equal(art.mesh.count,0);assert.equal(art.group.visible,false);assert.equal(inventories.get('helper'),10);
  assert.equal(scene.prompt('unload'),undefined);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
