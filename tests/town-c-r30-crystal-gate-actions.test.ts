import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMineGate} from '../src/presence/underground-mine-gate.js';
import {crystalCavernToWorld} from '../tools/voxel-tavern/town-blockout/underground-crystal-cavern.js';
import type {R30CrystalGateAction} from '../tools/voxel-tavern/town-blockout/town-c-r30-crystal-host.js';
test('real gate levers reject occupied mesh and submit only existing authority actions from legal feet',()=>{
 const parent=new Group();let foot:{playerId:string;domainId:string;east:number;north:number;height:number}|undefined;
 let accepted=true,aim=true,clear=false,now=0,gate:ReturnType<typeof createUndergroundMineGate>|undefined;
 let actions:R30CrystalGateAction[]=[],result:unknown;
 const h=mountUndergroundDomainHost({parent,road:mountWestCraterRoad(260,()=>10.7773),readAcceptedDomainFoot:()=>foot,
 crystalBridge:{acceptsFrame:()=>accepted,readGateStage:()=>gate?.state(),
 interaction:{readPlayerId:()=>foot?.playerId,isAimingAt:()=>aim,dispatch:(id,a)=>{
 actions.push(a);result=a==='open-mine'?gate!.openFromMine(id):a==='open-crystal'?gate!.openFromCrystal(id):gate!.resolveTraversal(id);
 }}}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const ch=h.crystalHost,c=ch.contract!;
  h.mounted.sync();
  const newGate=()=>createUndergroundMineGate({winch:c.winch,crystalSwitch:c.returnSwitch,readAcceptedFoot:()=>foot,
   passage:{mine:c.mine,crystal:c.crystal,isAtThreshold:c.isAtThreshold,supportsLanding:c.supportsLanding},
   encounter:{isSectionCleared:()=>clear},now:()=>now,revealMs:1000});
  gate=newGate();const local=(x:number,z:number)=>({playerId:'p',domainId:c.mine.domainId,...h.mounted.toWorld([x,-91,z])!});
  assert.equal(h.passageAt(c.winch.east,c.winch.north),undefined);
  foot=local(-1.55,136.1);assert.ok(h.passageAt(foot.east,foot.north));h.mounted.sync();
  const walk=(p:{east:number;north:number})=>{
   const a=foot!,steps=Math.max(1,Math.ceil(Math.hypot(a.east-p.east,a.north-p.north)/.08));
   for(let i=1;i<=steps;i++){
    const q={east:a.east+(p.east-a.east)*i/steps,north:a.north+(p.north-a.north)*i/steps};
    const next=h.resolveUndergroundStep(foot!,q,'standing');assert.ok(next,'approach '+i+'/'+steps);foot={...next.foot,playerId:'p'};
   }
  };
  walk(local(-1.62,138.02));
  aim=false;assert.equal(ch.prompt(),undefined);aim=true;
  assert.equal(ch.prompt()?.id,'crystal-gate/open-mine');
  assert.equal(ch.press('wrong'),false);assert.equal(ch.press('crystal-gate/open-mine'),true);assert.equal(result,'uncleared');
  clear=true;assert.equal(ch.press('crystal-gate/open-mine'),true);assert.equal(result,'ajar');h.mounted.sync();
  assert.equal(ch.prompt(),undefined);now=1001;h.mounted.sync();
  walk(local(-1.62,138.34));walk(local(0,138.34));walk(c.mine);
  assert.equal(ch.prompt()?.id,'crystal-gate/traverse');assert.ok(ch.press('crystal-gate/traverse'));
  const entry=gate.resolveTraversal('p')!;assert.equal(entry.landing.domainId,c.crystal.domainId);
  foot={...entry.landing,playerId:'p'};h.mounted.sync();
  // A new run may close the leaf while a player is still in the cavern.
  gate=newGate();h.mounted.sync();
  const p=crystalCavernToWorld(c.frame,[.76,-.064,-7.8]);walk(p);
  assert.equal(ch.prompt()?.id,'crystal-gate/open-crystal');assert.ok(ch.press('crystal-gate/open-crystal'));assert.equal(result,'ajar');
  now=2002;h.mounted.sync();walk(c.crystal);
  assert.equal(ch.prompt()?.id,'crystal-gate/traverse');
  // No stale gate crossing or collision permission during the interval
  // between a revoked registration and the next render sync.
  accepted=false;assert.equal(ch.press('crystal-gate/traverse'),false);
  assert.equal(ch.stage(),'closed');assert.equal(gate.resolveTraversal('p'),undefined);
  assert.equal(ch.passageAt(c.crystal.domainId,c.crystal.east,c.crystal.north),undefined);
  accepted=true;assert.ok(ch.press('crystal-gate/traverse'));assert.equal(gate.resolveTraversal('p')?.landing.domainId,c.mine.domainId);
  assert.deepEqual(actions,['open-mine','open-mine','traverse','open-crystal','traverse']);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
