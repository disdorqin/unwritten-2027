import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from 'three';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';
import {mountUndergroundDomainHost} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import {createUndergroundDreamChain,type DreamChainTrip} from '../tools/voxel-tavern/town-blockout/underground-dream-chain.js';
import {surveyR30ReturnRelocation} from '../tools/voxel-tavern/town-blockout/town-c-r30-return-relocation-candidate.js';
import {createR30ReturnRidePort,type R30ReturnRideAcceptance} from '../tools/voxel-tavern/town-blockout/town-c-r30-return-ride.js';
import {firstMineConnectionDatum} from '../src/shared/underground-second-mine-presence-domain.js';

test('same original lift serves certified new axis; first fall remains original and sealed candidates cannot activate it',async()=>{
 const parent=new Group(),road=mountWestCraterRoad(260,()=>10.7773);
 const h=mountUndergroundDomainHost({parent,road});
 assert.equal(h.kind,'ready');if(h.kind!=='ready'||h.registration.kind!=='ready')assert.fail();
 const {connection:c}=h.registration;
 const lower=surveyR30ReturnRelocation();
 // Exact measured B sealed headframe survey from B's unchanged
 // eac4b4e0 source at eba19280, rerun in its registered D-drive tree.
 // It certifies the shared geometric contract, NOT an actual opening.
 const axis={east:-124.5,north:177,height:-24.222694396972656};
 const approach={east:-124.8922405728251,north:178.91014327552406,height:-24.222694396972656};
 const survey={axis,approach,yaw:1.3631794670708894,apertureSide:2.2,roofSpan:.005188394161017129,
  dockHeight:-89.35458276044781,verticalSpan:65.13188836347516,radius:2.35,
  routeGap:.6410637054449796,grade:8.934161487632354e-14,reservationGap:2.6172508087167277,solidGap:3.3762456746660194,productionReady:false as const};
 assert.equal(survey.yaw,firstMineConnectionDatum.yaw);
 assert.ok(Math.abs(c.shaftFoot.height-axis.height)<.025);
 assert.ok(Math.hypot(axis.east-lower.world.east,axis.north-lower.world.north)<1e-6);
 assert.ok(Math.abs(survey.dockHeight-lower.world.height)<1e-6);
 const certificate:R30ReturnRideAcceptance={revision:'fixture-only',surfaceCut:true,mineRoofAndWestWallCut:true,oldStationRetired:true,continuousBore:true,
  physicalCageAndDock:true,existingAuthorityConnected:true,presentationConnected:true,approvedByTotalControl:true};
 let accepted:R30ReturnRideAcceptance|undefined,landingSupported=true;
 const opts={survey,surfaceDomain:c.shaftFoot.domainId,mineDomain:c.firstFallLanding.domainId,readAcceptance:()=>accepted,
 supportsFoot:(_stop:string,role:string)=>role!=='landing'||landingSupported};
 assert.equal(createR30ReturnRidePort({...opts,survey:{...survey,axis:{...axis,east:axis.east+.02}}}).kind,'blocked');
 const port=createR30ReturnRidePort(opts);assert.equal(port.kind,'ready');if(port.kind!=='ready')assert.fail();
 try{
  let now=1_000_000,foot={east:c.winch.east,north:c.winch.north,height:c.winch.height};
  const trips:DreamChainTrip[]=[];
  const chain=createUndergroundDreamChain({registration:h.registration,now:()=>now,playerId:'review',readLocalFoot:()=>foot,
   returnRide:port,onEvent:e=>{if(e.kind==='trip-started')trips.push(e.trip)}});
  assert.equal(chain.kind,'ready');if(chain.kind!=='ready')assert.fail();
  for(let i=0;i<180&&!chain.coverOpen();i++){chain.crankWinch(.25);now+=250}
  assert.ok(chain.coverOpen());foot={...chain.shaftFoot};
  const first=chain.requestFirstFall()!.trip;assert.equal(first.ridePath,undefined);
  now+=25000;assert.deepEqual(await chain.requestLanding(first.id),chain.mineLanding);
  assert.equal(chain.phase(),'mine');foot={...port.calls.mine};
  assert.equal(port.revision(),undefined);assert.equal(chain.requestCageRide('up'),undefined);assert.equal(chain.pendingRide(),undefined);
  accepted={...certificate,approvedByTotalControl:false};assert.equal(chain.requestCageRide('up'),undefined);assert.equal(chain.pendingRide(),undefined);
  accepted=certificate;
  foot={...chain.mineLanding};assert.equal(chain.requestCageRide('up'),undefined,'old pool is not the relocated call foot');
  foot={...port.calls.mine};assert.equal(chain.requestCageRide('up'),undefined);assert.equal(chain.pendingRide(),'up');
  assert.equal(chain.presentationTrip(),undefined,'empty cage is not a rider trip');
  now+=25000;chain.update();assert.equal(chain.pendingRide(),undefined);assert.equal(trips.length,1,'call is not a boarding receipt');
  assert.equal(chain.requestCageRide('up'),undefined,'caller must walk into dock');
  foot={...port.path.landing};const up=chain.requestCageRide('up')!;
  assert.ok(up);assert.deepEqual(up.ridePath,port.path);assert.deepEqual(chain.presentationTrip()?.ridePath,port.path);
  const landing=chain.requestLanding(up.id);
  const sample=h.mounted.shaftRide!.sample(up,now+12500)!;
  parent.updateMatrixWorld(true);const actual=h.mounted.shaftRide!.cage.getWorldPosition(new Vector3());
  assert.ok(Math.hypot(actual.x-axis.east,actual.z+axis.north)<1e-6);
  assert.ok(Math.abs(sample.eye.height-(axis.height+lower.world.height)/2-1.59)<1e-6);
  accepted=undefined;now+=25000;chain.update();assert.equal(chain.phase(),'mine','revocation cannot land');
  accepted=certificate;landingSupported=false;chain.update();assert.equal(chain.phase(),'mine','uncertified receiving floor cannot land');
  landingSupported=true;chain.update();assert.deepEqual(await landing,port.path.shaft);assert.equal(chain.phase(),'surface');
  foot={...port.path.shaft};const down=chain.requestCageRide('down')!;assert.ok(down);assert.equal(down.first,false);
  now+=25000;chain.update();assert.deepEqual(await chain.requestLanding(down.id),port.path.landing);assert.equal(chain.phase(),'mine');
  assert.equal(trips.length,3);
 }finally{h.mounted.dispose()}
 assert.equal(parent.children.length,0);
});
