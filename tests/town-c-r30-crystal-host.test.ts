import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Raycaster,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundMineGate} from '../src/presence/underground-mine-gate.js';
import {crystalCavernTrailEast,crystalCavernTrailHeight,crystalCavernToWorld,crystalCavernPlan} from '../tools/voxel-tavern/town-blockout/underground-crystal-cavern.js';
import {r30CrystalDomain} from '../tools/voxel-tavern/town-blockout/town-c-r30-crystal-support.js';
test('registered crystal spine uses existing gate authority, actual wall opening and continuous geometric support',()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 let accepted=false,cleared=false,now=0,gate:ReturnType<typeof createUndergroundMineGate>|undefined;
 let foot:{playerId:string;domainId:string;east:number;north:number;height:number}|undefined;
 const h=mountUndergroundDomainHost({parent,road,readAcceptedDomainFoot:()=>foot,
 crystalBridge:{acceptsFrame:()=>accepted,readGateStage:()=>gate?.state(),readLightBudget:()=>2},
 interlayerRide:{lowerOpeningCertified:()=>true,read:()=>undefined,now:()=>now}});
 assert.equal(h.kind,'ready');if(h.kind!=='ready')assert.fail();
 try{
  const ch=h.crystalHost!,c=ch.contract!;
  assert.ok(c);const gateFoot=h.mounted.toWorld([0,-91,138.8])!;
  const getCavern=()=>ch.mounted;
  h.mounted.sync();assert.equal(getCavern(),undefined);assert.equal(h.mounted.hasCrystalMouth(),false);
  assert.equal(h.passageAt(gateFoot.east,gateFoot.north),undefined);
  accepted=true;h.mounted.sync();const cavern=getCavern();assert.ok(cavern);assert.equal(h.mounted.hasCrystalMouth(),true);assert.ok(h.mounted.hasUpperLiftAperture());
  assert.equal(cavern.group.visible,false);
  gate=createUndergroundMineGate({winch:c.winch,crystalSwitch:c.returnSwitch,readAcceptedFoot:()=>foot,
    passage:{mine:c.mine,crystal:c.crystal,isAtThreshold:c.isAtThreshold,supportsLanding:c.supportsLanding},
    encounter:{isSectionCleared:()=>cleared},now:()=>now,revealMs:1500});
  foot={...c.winch,playerId:'player'};
  assert.equal(gate.openFromMine('player'),'uncleared');cleared=true;
  assert.equal(gate.openFromMine('player'),'ajar');h.mounted.sync();assert.equal(h.passageAt(gateFoot.east,gateFoot.north),undefined);
  now=1501;h.mounted.sync();assert.equal(ch.stage(),'open');
  assert.ok(h.passageAt(gateFoot.east,gateFoot.north));
  foot={...c.mine,playerId:'player'};
  const entry=gate.resolveTraversal('player');assert.equal(entry?.landing.domainId,r30CrystalDomain);
  assert.equal(ch.passageAt(r30CrystalDomain,c.crystal.east,c.crystal.north),undefined);
  foot={...entry!.landing,playerId:'player'};h.mounted.sync();
  assert.equal(cavern.group.visible,true);
  assert.equal(cavern.lights.filter(l=>l.visible).length,2);
  parent.updateMatrixWorld(true);
  const mesh=cavern.group.getObjectByName('r30-crystal-route-floor')!;
  for(let n=-9.9;n<=98.5;n+=.2){
   const p=crystalCavernToWorld(c.frame,[crystalCavernTrailEast(n),crystalCavernTrailHeight(n),n]);
   const pass=ch.passageAt(r30CrystalDomain,p.east,p.north);
   assert.ok(pass,'route failed '+n);
   assert.ok(Math.abs(pass.floor-p.height)<.06);
   const ray=new Raycaster(new Vector3(p.east,p.height+.2,-p.north),new Vector3(0,-1,0),0,.4).intersectObject(mesh)[0];
   assert.ok(ray&&Math.abs(ray.point.y-pass.floor)<.001,'floor mismatch '+n);
  }
  const quay=crystalCavernPlan.quay,p=crystalCavernToWorld(c.frame,[quay.east,quay.height,quay.north]);
  assert.ok(ch.passageAt(r30CrystalDomain,p.east,p.north));
  const outside=crystalCavernToWorld(c.frame,[65,0,55]);assert.equal(ch.passageAt(r30CrystalDomain,outside.east,outside.north),undefined);
  foot={...c.crystal,playerId:'player'};
  assert.equal(gate.resolveTraversal('player')?.landing.domainId,'underground/mine');
  accepted=false;h.mounted.sync();assert.equal(ch.stage(),'closed');assert.equal(cavern.group.visible,false);
  assert.equal(gate.resolveTraversal('player'),undefined);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
