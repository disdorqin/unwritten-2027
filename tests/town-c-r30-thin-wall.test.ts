import assert from 'node:assert/strict';
import test from 'node:test';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost,undergroundMineSpec} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMining} from '../src/presence/underground-mining.js';
import type {UndergroundMiningTargetView} from '../src/shared/underground-mining.js';
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';
const layer='underground/mine';
type Action=NonNullable<ReturnType<Parameters<typeof createUndergroundMining>[0]['accept']>>;
test('both authored walls are solid until original mining authority confirms final strike; no mineral reward',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 let targets:readonly UndergroundMiningTargetView[]|undefined,action:Action|undefined,now=1000,rewards=0;
 const host=mountUndergroundDomainHost({parent,road,readAcceptedMiningTargets:()=>targets});
 assert.equal(host.kind,'ready');if(host.kind!=='ready')assert.fail();
 try{
  const walls=host.thinWalls,sites=walls.sites;
  assert.equal(sites.length,2);
  const authority=createUndergroundMining({ore:[],openings:sites,reach:2,regrowMs:1800000,
    now:()=>now,strikeDelayMs:()=>400,accept:()=>action,commit(_p,_s,reward){if(reward)rewards++;return true}});
  const world=(x:number,z:number)=>host.mounted.toWorld([x,-91,z])!;
  const query=(x:number,z:number)=>{const p=world(x,z);return host.passageAt(p.east,p.north)};
  const raw=createUndergroundMineLayout(undergroundMineSpec);
  assert.equal(raw.queryPassage(6.1,59.6,.27,1.8),undefined);
  assert.equal(raw.queryPassage(-50,70.05,.27,1.8),undefined);
  let seq=0;
  for(const [i,site] of sites.entries()){
   const [x,z,ax,az,bx,bz]=i===0?[6.1,59.6,5,59.6,11,59.6]:[-50,70.05,-50,69,-50,73];
   const wall=walls.group.getObjectByName(site.id)!.getObjectByName('intact-rock')!;
   const p=world(x,z),a=world(ax,az);
   assert.ok(query(ax,az));assert.equal(query(x,z),undefined);assert.equal(wall.visible,true);
   parent.updateMatrixWorld(true);
   const v=new Vector3(p.east,p.height+1.05,-p.north),start=new Vector3(a.east,a.height+1.05,-a.north);
   const ray=new Raycaster(start,v.clone().sub(start).normalize(),0,3);
   assert.ok(ray.intersectObject(wall,true).length);
   targets=authority.readLayer(layer).targets;host.mounted.sync();
   for(let hit=1;hit<=site.strikes;hit++){
    action={sequence:++seq,action:'strike',targetId:site.id,feet:{layer,...a},active:true,held:'pickaxe'};
    const receipt=authority.apply('player',seq);assert.ok(receipt?.action==='strike'&&receipt.target.hits===hit);assert.equal(receipt.core,undefined);
    now+=400;targets=authority.readLayer(layer).targets;host.mounted.sync();
    assert.equal(wall.visible,hit<site.strikes);
    assert.equal(!!query(x,z),hit===site.strikes);
   }
   let foot=a;
   const count=Math.ceil(Math.hypot(bx-ax,bz-az)/.1);
   for(let j=1;j<=count;j++){
    const next=world(ax+(bx-ax)*j/count,az+(bz-az)*j/count);
    const step=host.resolveMineStep(foot,next,'standing');assert.ok(step,'step '+j+' for '+site.id);foot=step.foot;
   }
   assert.equal(foot.height,-91);
  }
  assert.equal(rewards,0);assert.equal(authority.readLayer(layer).cores.length,0);
  // Reconnection projects persistent authority state; malformed/missing
  // snapshot does not turn a wall into a client-authored opening.
  const accepted=authority.readLayer(layer).targets;
  targets=accepted.map(t=>({...t,at:{...t.at,east:t.at.east+1}}));host.mounted.sync();
  assert.equal(query(6.1,59.6),undefined);assert.equal(query(-50,70.05),undefined);
  targets=accepted;host.mounted.sync();assert.ok(query(6.1,59.6));assert.ok(query(-50,70.05));
 }finally{host.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
