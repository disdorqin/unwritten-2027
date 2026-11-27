import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundDreamChain} from '../tools/voxel-tavern/town-blockout/underground-dream-chain.js';
import {createUndergroundCampPickaxeAuthority} from '../src/presence/underground-camp-pickaxe.js';
import {createUndergroundMining} from '../src/presence/underground-mining.js';
import {createUndergroundMineGate} from '../src/presence/underground-mine-gate.js';
import type {UndergroundMiningCore,UndergroundMiningTargetView} from '../src/shared/underground-mining.js';
import {crystalCavernToWorld,crystalCavernTrailHeight,crystalCavernTrailEast} from '../tools/voxel-tavern/town-blockout/underground-crystal-cavern.js';
type Foot={east:number;north:number;height:number;domainId:string;playerId:string};
type Posture='standing'|'crouching';
type Action=NonNullable<ReturnType<Parameters<typeof createUndergroundMining>[0]['accept']>>;
const domain='underground/mine',playerId='journey-review';
test('one mounted first-mine journey: original fall, actual foot movement, tool, ore, gate and original lift return',async()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 let foot:Foot|undefined,now=1000,claimed=false,arrival=false,clear=false,sequence=0;
 let held:'pickaxe'|null=null,targets:readonly UndergroundMiningTargetView[]=[],cores:readonly UndergroundMiningCore[]=[];
 let claim:ReturnType<typeof createUndergroundCampPickaxeAuthority>|undefined,gate:ReturnType<typeof createUndergroundMineGate>|undefined;
 let mining:ReturnType<typeof createUndergroundMining>|undefined,action:Action|undefined;
 let fragments=0,coreCredits=0;
 let gateResult:unknown;
 const h=mountUndergroundDomainHost({parent,road,readAcceptedDomainFoot:()=>foot,
 campBridge:{now:()=>now,readWorldFoot:()=>foot,sit:()=>false,stand:()=>false,onSeatedChange:()=>{},isAimingAt:()=>true,showPickupNotice:()=>{},onRested:()=>{},
 pickaxeReceipt:{read:()=>({playerId,domainId:domain,claimed}),claim:(id,site)=>claim!(id,site)}},
 oreBridge:{acceptsSite:()=>true,readTargets:()=>targets,readCores:()=>cores,interaction:{readPlayerId:()=>playerId,readHeld:()=>held,canSee:()=>true,dispatch:intent=>{
  assert.ok(foot);action={sequence:++sequence,action:intent.action,targetId:intent.targetId,feet:{...foot,layer:foot.domainId},active:true,held};
  assert.ok(mining!.apply(intent.playerId,sequence));
 }}},
 crystalBridge:{acceptsFrame:()=>true,readGateStage:()=>gate?.state(),interaction:{readPlayerId:()=>playerId,isAimingAt:()=>true,dispatch:(id,a)=>{
  gateResult=a==='open-mine'?gate!.openFromMine(id):a==='open-crystal'?gate!.openFromCrystal(id):gate!.resolveTraversal(id);
 }}}
 });
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||!h.pickaxeContract||h.oreSurvey.kind!=='ready'||!h.oreActions||h.registration.kind!=='ready')assert.fail();
 const host=h,pc=h.pickaxeContract,ore=h.oreSurvey.ordinary,oreActions=h.oreActions;
 const c=h.crystalHost.contract!;
 const events:number[]=[];
 const chain=createUndergroundDreamChain({registration:h.registration,now:()=>now,playerId,readLocalFoot:()=>foot,onEvent:e=>{if(e.kind==='trip-started')events.push(e.trip.id)}});
 assert.equal(chain.kind,'ready');if(chain.kind!=='ready')assert.fail();
 let distance=0,steps=0,crouched=0;
 try{
  claim=createUndergroundCampPickaxeAuthority({site:pc.site,readAcceptedFoot:id=>id===playerId?foot:undefined,hasAcceptedMineArrival:()=>arrival,
  hasAcceptedPickaxeSight:()=>true,grantToolOnce:async()=>{if(claimed)return 'already-granted';claimed=true;return 'granted'}});
  mining=createUndergroundMining({ore,openings:[],reach:2,regrowMs:1800000,now:()=>now,strikeDelayMs:()=>400,accept:()=>action,
   commit(_id,_state,reward){if(reward?.kind==='fragment')fragments+=reward.amount;if(reward?.kind==='core')coreCredits+=reward.amount;return true}});
  gate=createUndergroundMineGate({winch:c.winch,crystalSwitch:c.returnSwitch,readAcceptedFoot:id=>id===playerId?foot:undefined,
   passage:{mine:c.mine,crystal:c.crystal,isAtThreshold:c.isAtThreshold,supportsLanding:c.supportsLanding},
   encounter:{isSectionCleared:()=>clear},now:()=>now,revealMs:1000});
  function sync(){const view=mining!.readLayer(domain);targets=view.targets;cores=view.cores;host.mounted.sync()}
  function set(p:{east:number;north:number;height:number;domainId:string}){foot={...p,playerId};sync()}
  function w(x:number,z:number){return host.mounted.toWorld([x,-91,z])!}
  function advance(p:{east:number;north:number},posture:Posture){
   const next=host.resolveUndergroundStep(foot!,p,posture);assert.ok(next,'actual move '+JSON.stringify({foot,p,posture}));
   distance+=Math.hypot(next.foot.east-foot!.east,next.foot.north-foot!.north);steps++;if(next.requiresCrouch)crouched++;
   foot={...next.foot,playerId};
  }
  // Review-only route search over the real existing mine collision. It
  // supplies no game movement authority: every chosen edge is replayed
  // through the accepted-foot host. Do not remove any physical obstacle.
  function mineWalk(target:{east:number;north:number;height:number}){
   const start=foot!;assert.equal(start.domainId,domain);
   const g=.5,to=host.toLocal(target)!,from=host.toLocal(start)!;
   type Node={x:number;z:number;p:{east:number;north:number;height:number};cost:number;priority:number;prev?:Node;posture:Posture};
   function edge(a:Node,p:{east:number;north:number}){
    for(const posture of ['standing','crouching'] as const){
     const m=host.resolveMineStep(a.p,p,posture);if(m)return {p:m.foot,posture};
    }
   }
   const root:Node={x:from[0],z:from[2],p:start,cost:0,priority:0,posture:'standing'};
   const queue:Node[]=[root],best=new Map<string,number>();let goal:Node|undefined;
   for(let i=0;queue.length&&i<18000;i++){
    queue.sort((a,b)=>b.priority-a.priority);const a=queue.pop()!;
    const d=Math.hypot(a.x-to[0],a.z-to[2]);
    if(d<=.82){const last=edge(a,target);if(last){goal={x:to[0],z:to[2],...last,cost:a.cost+d,priority:0,prev:a};break}}
    const gx=Math.round(a.x/g),gz=Math.round(a.z/g);
    for(const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
     const x=(gx+dx)*g,z=(gz+dz)*g,step=Math.hypot(x-a.x,z-a.z);if(step<.0001||step>.86)continue;
     const cost=a.cost+step,key=x+'/'+z;
     if(cost>=(best.get(key)??Infinity)-1e-9)continue;
     const m=edge(a,w(x,z));if(!m)continue;best.set(key,cost);
     queue.push({x,z,...m,cost,priority:cost+Math.hypot(x-to[0],z-to[2]),prev:a});
    }
   }
   assert.ok(goal,'no actual route '+JSON.stringify({from,to}));
   const path:Node[]=[];for(let n:Node|undefined=goal;n?.prev;n=n.prev)path.push(n);
   for(const n of path.reverse())advance(n.p,n.posture);
   assert.ok(Math.hypot(foot!.east-target.east,foot!.north-target.north,foot!.height-target.height)<.03);
   sync();
  }
  set({...chain.winchFoot,domainId:'west'});
  for(let i=0;i<180&&!chain.coverOpen();i++){chain.crankWinch(.25);now+=250}assert.ok(chain.coverOpen());
  set({...chain.shaftFoot,domainId:'west'});
  const first=chain.requestFirstFall()!;assert.ok(first);now+=25000;const landing=await chain.requestLanding(first.trip.id);assert.ok(landing);arrival=true;
  set({...landing,domainId:domain});
  assert.equal(host.resolveUndergroundStep(foot!,{east:foot!.east+.2,north:foot!.north},'standing'),undefined,'no lateral bypass from water surface');
  const settled=host.resolveUndergroundStep(foot!,foot!,'standing');assert.ok(settled?.waterSettle);assert.equal(settled.foot.height,-91.2);
  set(settled.foot);mineWalk(pc.approach);assert.ok(crouched>0);
  assert.equal(host.mounted.campPrompt()?.id,pc.siteId);assert.equal(await host.mounted.pressCamp(pc.siteId),'granted');held='pickaxe';sync();
  mineWalk(ore[0].foot);const strike='ore/strike/'+ore[0].target.id;
  for(let i=0;i<3;i++){assert.ok(oreActions.press(strike));now+=400;sync()}
  assert.equal(fragments,3);held=null;const pickup=oreActions.prompt();assert.equal(pickup?.action,'pickup');assert.ok(oreActions.press(pickup!.id));sync();assert.equal(coreCredits,ore[0].marker.amount);
  mineWalk(w(-1.62,138.02));assert.ok(host.crystalHost.press('crystal-gate/open-mine'));assert.equal(gateResult,'uncleared');
  // Combat completion is an explicit review receipt; no fabricated
  // combat reward or claim that all 28 actors were defeated by this test.
  clear=true;assert.ok(host.crystalHost.press('crystal-gate/open-mine'));assert.equal(gateResult,'ajar');now+=1001;sync();
  mineWalk(c.mine);assert.ok(host.crystalHost.press('crystal-gate/traverse'));
  const outbound=gateResult as NonNullable<ReturnType<typeof gate.resolveTraversal>>;assert.equal(outbound.landing.domainId,c.crystal.domainId);set(outbound.landing);
  const local=(n:number)=>crystalCavernToWorld(c.frame,[crystalCavernTrailEast(n),crystalCavernTrailHeight(n),n]);
  for(let n=-9.5;n<=20;n+=.5)advance(local(n),'standing');
  for(let n=19.5;n>=-9.5;n-=.5)advance(local(n),'standing');
  advance(c.crystal,'standing');assert.ok(host.crystalHost.press('crystal-gate/traverse'));
  const back=gateResult as NonNullable<ReturnType<typeof gate.resolveTraversal>>;assert.equal(back.landing.domainId,domain);set(back.landing);
  mineWalk({...chain.mineLanding,height:host.floorAt(chain.mineLanding.east,chain.mineLanding.north)!});assert.equal(chain.requestCageRide('up'),undefined);assert.equal(chain.pendingRide(),'up');now+=25000;chain.update();
  const up=chain.presentationTrip();assert.ok(up&&up.direction==='up');const wait=chain.requestLanding(up.id);now+=25000;chain.update();const returned=await wait;assert.deepEqual(returned,chain.shaftFoot);
  assert.equal(chain.phase(),'surface');assert.ok(steps>300&&distance>300);assert.equal(events.length,2);
  console.log(JSON.stringify({steps,distance,crouched,fragments,coreCredits,firstFall:true,returnRide:'legacy-authorized',combatClear:'fixture'}));
 }finally{host.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
