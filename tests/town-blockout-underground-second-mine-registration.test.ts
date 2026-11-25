import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost,undergroundMineSpec} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';
import {isMinePresenceFoot,toMinePresencePose} from '../src/shared/underground-mine-presence-domain.js';
import {firstMineConnectionDatum,firstMineDownFootLocal,firstMineDownFoot,secondMineWorldFrame,secondMineRegisteredFeet,secondMineConnections,secondMinePresenceBounds,secondMinePresenceEndpoint,resolveRegisteredSecondMine,toSecondMinePresencePose,fromSecondMinePresencePose,isSecondMinePresenceFoot,secondMineToWorld,secondMineToLocal} from '../src/shared/underground-second-mine-presence-domain.js';
import {secondMineSurvey} from '../src/shared/town-c-second-mine-survey.js';
import {mountRegisteredSecondMineDomain} from '../tools/voxel-tavern/town-blockout/town-c-second-mine-domain.js';
import {createUndergroundWaterState} from '../src/presence/underground-water-state.js';
import {townDayMs} from '../src/shared/town-night-window.js';
import {readRecord,RECORD_BYTES} from '../src/presence/protocol.js';
import {writePresencePose} from '../tools/voxel-tavern/town-blockout/town-presence-motion.js';

const close=(a:number,b:number,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,a+' != '+b);
test('registered first mine expansion includes every geometry vertex and real -140 departure',()=>{
 const road=mountWestCraterRoad(260,()=>10.7773),host=mountUndergroundDomainHost({parent:new Group(),road});
 assert.equal(host.kind,'ready');if(host.kind!=='ready')assert.fail();
 try{
  close(road.anchor.yaw,firstMineConnectionDatum.yaw);
  const m=createUndergroundMineLayout(undergroundMineSpec),[x,y,z]=firstMineDownFootLocal;
  assert.equal(m.queryPassage(x,z,.27,1.8,'closed')?.floor,y);
  const actual=host.mounted.toWorld(firstMineDownFootLocal)!;
  for(const k of ['east','north','height'] as const)close(actual[k],firstMineDownFoot[k]);
  assert.ok(toMinePresencePose(actual));
  for(const a of Object.values(m.mesh))for(let i=0;i<a.length;i+=3){
   const p=host.mounted.toWorld([a[i],a[i+1],a[i+2]])!;
   assert.ok(isMinePresenceFoot(p.east,p.north,p.height),'first mine geometry overflow '+JSON.stringify(p));
  }
  assert.ok(!isMinePresenceFoot(actual.east,actual.north,-140));
 }finally{host.mounted.dispose()}
});
test('registered second room keeps feet separate and round-trips unchanged wire record',()=>{
 const r=resolveRegisteredSecondMine();assert.equal(r.kind,'ready');
 assert.equal(secondMinePresenceEndpoint('/presence/poll/join'),'/presence-mine-2/poll/join');
 close(firstMineDownFoot.east,secondMineRegisteredFeet.entry.east);
 close(firstMineDownFoot.north,secondMineRegisteredFeet.entry.north);
 assert.equal(firstMineDownFoot.height-secondMineRegisteredFeet.entry.height,49);
 assert.equal(secondMineConnections.towardWarrior.arrivalStatus,'awaiting-city-registration');
 assert.ok(Math.max(...Object.values(secondMinePresenceBounds))<=655.35);
 for(const e of [-66,66])for(const n of [0,198]){
  const p=secondMineToWorld({east:e,north:n,height:-.7});
  assert.ok(isSecondMinePresenceFoot(p.east,p.north,p.height));
 }
 for(const p of Object.values(secondMineRegisteredFeet)){
  assert.ok(!isMinePresenceFoot(p.east,p.north,p.height));
  const wire=toSecondMinePresencePose({...p,yaw:1.3})!,buffer=new DataView(new ArrayBuffer(RECORD_BYTES));
  writePresencePose(wire,42,buffer);
  const data=readRecord(new Uint8Array(buffer.buffer))!;
  const back=fromSecondMinePresencePose({east:data.east/100,north:data.north/100,height:data.height/100})!;
  for(const k of ['east','north','height'] as const)close(back[k],p[k],.0051);
 }
 assert.ok(!toSecondMinePresencePose({...secondMineRegisteredFeet.entry,height:-90}));
 assert.ok(!toSecondMinePresencePose({...secondMineRegisteredFeet.exit,height:-165}));
 assert.ok(!fromSecondMinePresencePose({east:241,north:0,height:15}));
});
test('production scene uses the same registered frame and actual water state; dry route all phases',()=>{
 const parent=new Group();let now=0;
 const authority=createUndergroundWaterState({dawnEpoch:0,now:()=>now});
 const m=mountRegisteredSecondMineDomain({parent,readAcceptedWater:authority.tonight});
 assert.equal(m.kind,'ready');if(m.kind!=='ready')assert.fail();
 try{
  m.group.updateMatrixWorld(true);
  const local=secondMineSurvey.anchors.entry,rendered=m.group.localToWorld(new Vector3(local.east,0,-local.north));
  close(rendered.x,secondMineRegisteredFeet.entry.east);close(-rendered.z,secondMineRegisteredFeet.entry.north);close(rendered.y,-140);
  for(const [night,level] of ['high','middle','low'].entries()){
   now=night*townDayMs;assert.ok(m.sync());assert.equal(m.getRiverState(),level);
   const route=[secondMineSurvey.anchors.entry,...secondMineSurvey.anchors.bypass,secondMineSurvey.anchors.exit];
   for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],n=Math.ceil(Math.hypot(a.east-b.east,a.north-b.north)*4);
    for(let j=0;j<=n;j++){
     const q=secondMineToWorld({east:a.east+(b.east-a.east)*j/n,north:a.north+(b.north-a.north)*j/n,height:0});
     assert.equal(m.passageAt(q.east,q.north)?.floor,-140);
    }
   }
  }
  const q=secondMineToLocal(secondMineRegisteredFeet.exit);close(q.north,196);
 }finally{m.dispose()}
 assert.equal(parent.children.length,0);
});
