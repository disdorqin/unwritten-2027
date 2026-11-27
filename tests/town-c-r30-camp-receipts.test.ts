import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PointLight} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createLampLedger} from '../src/presence/lamp-ledger.js';
test('camp story uses accepted profile catalogue and original lamp ledger receipt, not local reward or optimistic light',async()=>{
 const parent=new Group(),ledger=createLampLedger(),known=new Set<string>(),lit:string[]=[];
 let player='a',domainId='underground/mine',budget=4,accepted=true,allow=false,aim=true,calls=0;
 let foot:{east:number;north:number;height:number}|undefined;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),
  readAcceptedDomainFoot:()=>accepted&&foot?{...foot,domainId}:undefined,
  campBridge:{now:()=>1000,readWorldFoot:()=>foot,sit:()=>false,stand:()=>false,onSeatedChange:()=>{},isAimingAt:()=>aim,showPickupNotice:()=>{},onRested:()=>{},
  storyReceipts:{read:()=>({playerId:player,domainId,holdsLamp:ledger.holdsLamp(player),bowlKnown:known.has(player),litNicheIds:[...lit]}),
   readLightBudget:()=>budget,recordBowl:async(id)=>{calls++;if(!allow)return 'rejected';if(known.has(id))return 'already-recorded';known.add(id);return 'recorded'},
   offerLamp:async(id,niche)=>{if(!allow||lit.includes(niche)||!ledger.placeAtNiche(id))return false;lit.push(niche);return true}}}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||!h.mounted.camp)assert.fail();
 try{
  const camp=h.mounted.camp,bowl=camp.dining.bowl;
  const set=(p:readonly[number,number,number])=>{foot=h.mounted.toWorld(p)!;h.mounted.sync()};
  const countLights=()=>{let count=0;camp.group.traverse(o=>{if(o instanceof PointLight&&o.visible)count++});return count};
  set(bowl.approach);
  assert.equal(h.mounted.campPrompt()?.kind,'bowl');
  const bowlId=h.mounted.campPrompt()!.id;
  aim=false;assert.equal(await h.mounted.pressCamp(bowlId),'rejected');assert.equal(calls,0);
  aim=true;assert.equal(await h.mounted.pressCamp(bowlId),'rejected');assert.equal(calls,1);
  allow=true;assert.equal(await h.mounted.pressCamp(bowlId),'bowl-recorded');
  assert.equal(await h.mounted.pressCamp(bowlId),'bowl-known');assert.equal(calls,2);
  player='b';h.mounted.sync();assert.equal(await h.mounted.pressCamp(bowlId),'bowl-recorded');assert.equal(known.size,2);
  const empty=camp.memorial.niches.filter(n=>!n.hasSpentLamp);
  for(const [i,niche] of empty.entries()){
   player='lamp-'+i;ledger.register(player);ledger.issue(player);
   set([niche.position[0],camp.memorial.approach[1],camp.memorial.approach[2]]);
   const id='offer-lamp:'+niche.id;
   assert.equal(h.mounted.campPrompt()?.id,id);
   allow=false;assert.equal(await h.mounted.pressCamp(id),'rejected');assert.equal(ledger.holdsLamp(player),true);
   assert.equal(h.offeringsSnapshot()?.litNicheIds.length,i);
   allow=true;assert.equal(await h.mounted.pressCamp(id),'lamp-offered');assert.equal(ledger.record(player)?.stage,'placed');
   assert.equal(h.offeringsSnapshot()?.litNicheIds.length,i+1);
  }
  assert.equal(h.offeringsSnapshot()?.extraCampLightCount,2);
  assert.equal(countLights(),4);budget=1;h.mounted.sync();assert.equal(countLights(),1);
  budget=0;h.mounted.sync();assert.equal(countLights(),0);assert.equal(h.offeringsSnapshot()?.litNicheIds.length,3);
  domainId='west';h.mounted.sync();assert.equal(h.mounted.campPrompt(),undefined);assert.equal(countLights(),0);
  domainId='underground/mine';accepted=false;h.mounted.sync();assert.equal(h.mounted.campPrompt(),undefined);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
