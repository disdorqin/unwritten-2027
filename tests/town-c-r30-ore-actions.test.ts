import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMining,type UndergroundMiningReward} from '../src/presence/underground-mining.js';
import type {UndergroundMiningTargetView,UndergroundMiningCore} from '../src/shared/underground-mining.js';
import type {R30OreIntent} from '../tools/voxel-tavern/town-blockout/town-c-r30-ore-actions.js';
type Action=NonNullable<ReturnType<Parameters<typeof createUndergroundMining>[0]['accept']>>;
test('actual ore interaction dispatches only current reachable aimed strike and core receipts',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 let foot:{east:number;north:number;height:number;domainId:string}|undefined;
 let accepted=true,aim=true,held:'pickaxe'|'other'|null=null,now=1000,seq=0;
 let targets:readonly UndergroundMiningTargetView[]=[],cores:readonly UndergroundMiningCore[]=[];
 let action:Action|undefined,authority:ReturnType<typeof createUndergroundMining>|undefined;
 const requests:R30OreIntent[]=[],rewards:UndergroundMiningReward[]=[];
 const h=mountUndergroundDomainHost({parent,road,readAcceptedDomainFoot:()=>foot,
 oreBridge:{acceptsSite:()=>accepted,readTargets:()=>targets,readCores:()=>cores,
 interaction:{readPlayerId:()=> 'miner',readHeld:()=>held,canSee:()=>aim,dispatch:intent=>{
  requests.push(intent);assert.ok(foot);const sequence=++seq;
  action={sequence,action:intent.action,targetId:intent.targetId,feet:{...foot,layer:foot.domainId},active:true,held};
  assert.ok(authority!.apply(intent.playerId,sequence));
 }}}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||h.oreSurvey.kind!=='ready'||!h.oreActions)assert.fail();
 try{
  const ore=h.oreSurvey.ordinary,site=ore[0],actions=h.oreActions;
  authority=createUndergroundMining({ore,openings:[],reach:2,regrowMs:1800000,now:()=>now,strikeDelayMs:()=>400,
   accept:()=>action,commit(_id,_state,reward){if(reward)rewards.push(reward);return true}});
  const sync=()=>{const s=authority!.readLayer('underground/mine');targets=s.targets;cores=s.cores;h.mounted.sync()};
  sync();foot={...site.foot,domainId:'underground/mine'};assert.equal(actions.prompt(),undefined);
  held='pickaxe';const strike='ore/strike/'+site.target.id;assert.equal(actions.prompt()?.id,strike);
  aim=false;assert.equal(actions.press(strike),false);aim=true;
  accepted=false;assert.equal(actions.press(strike),false);accepted=true;
  const good=foot;foot={...good,domainId:'underground/crystal'};assert.equal(actions.press(strike),false);foot=good;
  for(let i=0;i<3;i++){
   assert.equal(actions.press(strike),true);
   const updated=authority.readLayer('underground/mine');targets=updated.targets;cores=updated.cores;
   assert.equal(actions.press(strike),false,'stale presentation cannot submit another strike');
   now+=400;sync();
  }
  assert.equal(requests.length,3);assert.equal(rewards.filter(r=>r.kind==='fragment').length,3);
  const pickup=actions.prompt();assert.equal(pickup?.action,'pickup');held=null;
  assert.equal(actions.press(pickup!.id),true);sync();
  assert.equal(actions.press(pickup!.id),false);assert.equal(rewards.filter(r=>r.kind==='core').length,1);
  assert.equal(cores.length,0);assert.equal(requests.length,4);
  now+=1800001;sync();held='pickaxe';assert.equal(actions.prompt()?.id,strike);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
