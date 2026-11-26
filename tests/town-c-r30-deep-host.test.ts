import assert from 'node:assert/strict';
import test from 'node:test';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundWaterState} from '../src/presence/underground-water-state.js';
import {secondMineRegisteredFeet,secondMineDomainId,secondMineToWorld} from '../src/shared/underground-second-mine-presence-domain.js';
import {townDayMs} from '../src/shared/town-night-window.js';
test('actual first host prepares second mine from the same accepted water and only exposes accepted-domain collision',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 let now=0,connected=false,domain='underground/mine',foot={...secondMineRegisteredFeet.entry};
 const water=createUndergroundWaterState({dawnEpoch:0,now:()=>now});
 const h=mountUndergroundDomainHost({parent,road,waterBridge:{readWaterSnapshot:()=>connected?water.tonight():undefined},
 readAcceptedDomainFoot:()=>({domainId:domain,...foot})});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  h.mounted.sync();assert.equal(h.deepHost.status(),'awaiting-water');
  assert.equal(parent.children.length,1);
  connected=true;h.mounted.sync();assert.equal(h.deepHost.status(),'awaiting-domain');
  const second=h.deepHost.mounted!;
  assert.ok(second&&!second.group.visible);
  assert.ok(h.deepHost.supportsArrival(secondMineDomainId,foot));
  assert.equal(h.deepHost.passageAt(secondMineDomainId,foot.east,foot.north),undefined);
  domain=secondMineDomainId;h.mounted.sync();assert.equal(h.deepHost.status(),'ready');
  assert.ok(second.group.visible);assert.equal(h.deepHost.passageAt(domain,foot.east,foot.north)?.floor,-140);
  assert.equal(h.deepHost.passageAt('underground/mine',foot.east,foot.north),undefined);
  const river=secondMineToWorld({east:0,north:137,height:0});
  assert.equal(h.deepHost.passageAt(domain,river.east,river.north),undefined);
  now=2*townDayMs;h.mounted.sync();assert.equal(second.getRiverState(),'low');
  assert.equal(h.deepHost.passageAt(domain,river.east,river.north)?.floor,-140.7);
  connected=false;h.mounted.sync();assert.equal(h.deepHost.status(),'awaiting-water');assert.equal(second.group.visible,false);
  assert.equal(h.deepHost.supportsArrival(domain,foot),false);
  connected=true;h.mounted.sync();assert.equal(h.deepHost.mounted,second,'reuse scene after reconnect');
  foot={...foot,height:-90};h.mounted.sync();assert.equal(h.deepHost.status(),'awaiting-domain');
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);assert.equal(h.deepHost.status(),'disposed');
});
