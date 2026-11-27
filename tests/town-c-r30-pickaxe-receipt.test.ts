import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundCampPickaxeAuthority} from '../src/presence/underground-camp-pickaxe.js';
test('the original old tool uses accepted profile receipts and never grants from the scene',async()=>{
 const parent=new Group(),domainId='underground/mine';
 let player='a',foot:{east:number;north:number;height:number;domainId:string}|undefined,accepted=false,notices=0,fail=true;
 const claimed=new Set<string>();
 let claim:ReturnType<typeof createUndergroundCampPickaxeAuthority>|undefined;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),
 readAcceptedDomainFoot:()=>accepted?foot:undefined,
 campBridge:{now:()=>1000,readWorldFoot:()=>foot,sit:()=>true,stand:()=>true,onSeatedChange:()=>{},isAimingAt:()=>true,showPickupNotice:()=>notices++,onRested:()=>{},
 pickaxeReceipt:{read:()=>accepted?{playerId:player,domainId,claimed:claimed.has(player)}:undefined,claim:(id,site)=>claim!(id,site)}}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||!h.pickaxeContract)assert.fail();
 try{
  const c=h.pickaxeContract;
  claim=createUndergroundCampPickaxeAuthority({site:c.site,readAcceptedFoot:id=>accepted&&id===player&&foot?{...foot,playerId:id}:undefined,
   hasAcceptedMineArrival:()=>accepted,hasAcceptedPickaxeSight:()=>true,grantToolOnce:async(id)=>{if(fail)return 'rejected';if(claimed.has(id))return 'already-granted';claimed.add(id);return 'granted'}});
  foot={...c.approach,domainId};h.mounted.sync();
  const mesh=h.mounted.group.getObjectByName(c.siteId)!;assert.ok(mesh);
  assert.equal(h.mounted.campPrompt()?.id===c.siteId,false);assert.equal(mesh.visible,false);
  accepted=true;h.mounted.sync();assert.equal(h.mounted.campPrompt()?.id,c.siteId);assert.equal(mesh.visible,true);
  assert.equal(await h.mounted.pressCamp(c.siteId),'rejected');assert.equal(mesh.visible,true);assert.equal(notices,0);
  fail=false;assert.equal(await h.mounted.pressCamp(c.siteId),'granted');assert.equal(mesh.visible,false);assert.equal(notices,1);
  assert.equal(await h.mounted.pressCamp(c.siteId),'unavailable');
  player='b';h.mounted.sync();assert.equal(mesh.visible,true);assert.equal(await h.mounted.pressCamp(c.siteId),'granted');assert.equal(notices,2);
  player='a';h.mounted.sync();assert.equal(mesh.visible,false);assert.equal(claimed.size,2);
  accepted=false;h.mounted.sync();assert.equal(h.mounted.campPrompt()?.id===c.siteId,false);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
