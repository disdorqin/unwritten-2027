import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Box3,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import type {U19MineCartSnapshot} from '../src/presence/underground-mainline-cart.js';
import type {UndergroundMainlinePoint as Point} from '../src/shared/underground-mainline-track.js';
test('real gate buffer preserves cart and pedestrian clearance, boards show accepted state only',()=>{
 const parent=new Group();let state:U19MineCartSnapshot|undefined,approved=false,foot:Point|undefined;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),
 mainlineBridge:{acceptsRoute:()=>approved,readSnapshot:()=>state,readViewer:()=>foot&&{playerId:'miner',domainId:'underground/mine',foot},readLightBudget:()=>2,canSee:()=>true,dispatch:()=>{}}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||h.mainline?.kind!=='ready')assert.fail();
 try{
  const {scene,route,motion}=h.mainline,t=scene.r30Terminal!;
  assert.ok(t.bufferBuilt);assert.equal(t.boards.length,2);assert.ok(t.parts>=31);
  const camp=t.boards.find(b=>b.role==='camp')!,gate=t.boards.find(b=>b.role==='gate')!;
  assert.equal(camp.state,'unregistered');assert.equal(gate.state,'unregistered');
  const p=t.bufferCenter;assert.equal(h.passageAt(p.east,p.north),undefined);
  parent.updateMatrixWorld(true);assert.ok(new Raycaster(new Vector3(p.east,p.height+1,-p.north),new Vector3(0,-1,0),0,1).intersectObject(t.group,true).length);
  const at=(x:number,z:number)=>h.mounted.toWorld([x,-91,z])!;
  for(let z=136.5;z<=138.42;z+=.06){
   const l=at(-1.25,z),r=at(1.25,z);
   assert.ok(h.passageAt(l.east,l.north)||h.passageAt(r.east,r.north),'pedestrian bypass '+z);
  }
  for(let m=route.length-3;m<=route.length;m+=.05){const q=route.sample(m).position;assert.equal(t.blocks(q.east,q.north,q.height,.82,2.4),false)}
  let revision=0;
  const publish=(patch:Partial<U19MineCartSnapshot>={})=>{
   state={revision:++revision,lastAtMs:1000+revision,mode:'stopped',chainage:route.length,speed:0,brakeHeld:false,turnout:'gate',faults:{sleepers:3,gauge:3,'turnout-rust':4},cargo:{oreId:'',pieces:0},...patch};h.mounted.sync();
  };
  publish();assert.equal(gate.state,'unregistered');
  approved=true;publish({cargo:{oreId:'ore',pieces:9}});assert.equal(gate.state,'loaded');assert.equal(gate.count,9);assert.equal(camp.state,'away-loaded');
  parent.updateMatrixWorld(true);const cart=new Box3().setFromObject(scene.cart);
  const pose=route.sample(route.length),front=pose.position;
  const projected=[cart.min.x,cart.max.x].flatMap(e=>[cart.min.z,cart.max.z].map(z=>-(e-front.east)*Math.sin(pose.heading)+(-z-front.north)*Math.cos(pose.heading)));
  assert.ok(Math.max(...projected)<1.04,'cart nose does not penetrate end stop');
  foot=motion.boardingFoot();assert.ok(foot);assert.ok(scene.prompt('unload'));
  publish({riderId:'miner',cargo:{oreId:'ore',pieces:9}});assert.equal(gate.state,'occupied');assert.equal(scene.prompt('unload'),undefined);assert.equal(scene.prompt('go'),undefined);assert.ok(motion.leaveFoot('miner'));
  publish();foot=motion.boardingFoot();assert.equal(gate.state,'empty');assert.equal(camp.state,'away-empty');assert.equal(scene.prompt('unload'),undefined);
  publish({mode:'recalling',chainage:route.length-5,recallOperator:'miner'});assert.equal(gate.state,'recalling');assert.equal(camp.state,'recalling');
  publish({chainage:0});assert.equal(camp.state,'empty');assert.equal(gate.state,'away-empty');
  approved=false;h.mounted.sync();assert.equal(camp.state,'unregistered');assert.equal(gate.state,'unregistered');assert.equal(scene.prompt('load'),undefined);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
