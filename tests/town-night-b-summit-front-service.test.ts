import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createZa36CableRepair} from '../src/shared/za36-cable-repair';
import {createNightBFrontService} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-front-service';
import {createTerrainGrid} from '../tools/voxel-tavern/town-blockout/terrain';
import {buildFrontRidgeR30Field} from '../tools/voxel-tavern/town-blockout/town-d-r30-front-ridge';
import {mountRidgeCableFacilities,auditRidgeCableSweep} from '../tools/voxel-tavern/town-blockout/town-d-r30-cable-facilities';
import {Group} from 'three';
import {createNightBCableRideHost} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-ride-host';
import {auditNightBFrontOpenFacilities} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-front-sweep';
test('front service uses surveyed dual cabins, actual repair authority and terminal dwell',()=>{
 const grid=createTerrainGrid(),field=buildFrontRidgeR30Field(grid.groundHeightAt,()=>1);
 const facilities=mountRidgeCableFacilities(new Group(),field,true,false,true);
 try {
 const s=facilities.survey,raw=auditRidgeCableSweep(field,s),repair=createZa36CableRepair(1);
 // Isolated candidate fixture has no other buildings; NOT a production obstacle certificate.
 const own=auditNightBFrontOpenFacilities(field,facilities);assert.equal(own.ownHits,0);assert.equal(own.externalSurveyed,false);assert.equal(own.candidateEnvelopeClear,false);
 const audit=auditNightBFrontOpenFacilities(field,facilities,()=>false);assert.ok(audit.candidateEnvelopeClear);assert.ok(audit.probes>100000);console.log('front isolated sweep',JSON.stringify(audit));let t=0,day=true,sync=true,deck=true;
 const input={survey:s,audit,state:()=>sync?repair.snapshot():undefined,now:()=>t,daylight:()=>day,dockClear:()=>deck};
 const service=createNightBFrontService(input);
 const base=service.cabinsAt(0)[0]!.feet;assert.equal(service.board(base,0),undefined);
 repair.apply({kind:'wake',impact:'sled'});assert.equal(service.board(base,0),undefined);
 for(let i=0;i<9;i++)repair.apply({kind:'strike-rust'});
 repair.apply({kind:'pull-brake'});repair.apply({kind:'pry-cable',effort:1});
 for(let i=0;i<3;i++)repair.apply({kind:'tighten-cable'});
 for(let i=0;i<4;i++){repair.apply({kind:'take-weight',index:i});repair.apply({kind:'hang-weight',index:i});}
 assert.ok(service.physical);assert.ok(!createNightBFrontService({...input,audit:raw}).physical);
 const ride=service.board(base,0);assert.ok(ride);
 t=9999;assert.equal(service.ridePose(ride)?.station,'base');
 t=11_000;assert.equal(service.ridePose(ride)?.station,null);assert.equal(service.exit(ride),undefined);
 t=10_000+s.lowerMetres/5*1000+5000;assert.equal(service.ridePose(ride)?.station,'middle');
 assert.ok(service.exit(ride));day=false;assert.equal(service.board(service.ridePose(ride)!.feet,0),undefined);
 assert.ok(service.ridePose(ride));day=true;
 t=service.clock.oneWayMs+5000;assert.equal(service.ridePose(ride)?.station,'summit');assert.ok(service.exit(ride));
 deck=false;assert.equal(service.exit(ride),undefined);deck=true;sync=false;assert.equal(service.board(service.ridePose(ride)!.feet,0),undefined);
 for(const time of [0,9999,11000,service.clock.oneWayMs,service.clock.oneWayMs+9999,service.clock.cycleMs-10]){
  const actual=facilities.update(service.presentationMs(time));
  for(const [i,c] of service.cabinsAt(time).entries())assert.ok(Math.hypot(c.feet.east-actual[i]!.east,c.feet.north-actual[i]!.north,c.feet.height-actual[i]!.height)<1e-7);
 }
 // First-run production adapter keeps both actual surveyed lanes, but only
 // car zero moves during the initial downhill run and reposition.
 const epoch=Date.UTC(2026,0,1);let wake:number|undefined,opened:number|undefined;
 const partial=createZa36CableRepair(1);
 const first=createNightBFrontService({...input,state:()=>partial.snapshot(),now:()=>t,firstRun:{wokeAt:()=>wake,openedAt:()=>opened,dawnEpoch:()=>epoch}});
 t=epoch+1000;const initial=first.present();assert.ok(initial.every(c=>c.station==='summit'));assert.equal(first.board(initial[0]!.feet,0),undefined);
 wake=t;partial.apply({kind:'wake',impact:'sled'});
 const firstRide=first.board(initial[0]!.feet,0);assert.ok(firstRide);assert.equal(first.board(initial[1]!.feet,1),undefined);
 t=wake+first.firstMs/2;assert.equal(first.ridePose(firstRide)?.station,null);assert.equal(first.exit(firstRide),undefined);
 t=wake+first.firstMs;assert.equal(first.ridePose(firstRide)?.station,'middle');assert.ok(first.exit(firstRide));assert.equal(first.board(first.ridePose(firstRide)!.feet,0),undefined);
 for(let i=0;i<9;i++)partial.apply({kind:'strike-rust'});
 partial.apply({kind:'pull-brake'});partial.apply({kind:'pry-cable',effort:1});for(let i=0;i<3;i++)partial.apply({kind:'tighten-cable'});
 for(let i=0;i<4;i++){partial.apply({kind:'take-weight',index:i});partial.apply({kind:'hang-weight',index:i});}
 opened=t;assert.equal(first.present()[0]!.station,'middle');assert.equal(first.serviceOpen(),false);
 t=opened+first.repositionMs-1;const before=first.present();assert.ok(before[0]!.distanceMetres<.01);assert.equal(before[1]!.station,'summit');
 t=opened+first.repositionMs;assert.equal(first.present()[0]!.station,'base');assert.equal(first.serviceOpen(),true);
 assert.ok(Math.hypot(before[0]!.feet.east-first.present()[0]!.feet.east,before[0]!.feet.north-first.present()[0]!.feet.north,before[0]!.feet.height-first.present()[0]!.feet.height)<.01);
 const host=createNightBCableRideHost({front:first,frontFacilities:facilities,upperOrigin:{east:300,north:676},domain:()=> 'town',acceptLanding:()=>true});
 assert.ok(host.frontBound);host.updateVisuals();assert.ok(host.board(first.present()[0]!.feet,1,0));
 t+=15000;host.updateVisuals();const moving=host.pose()!;
 assert.equal(moving.station,null);assert.equal(host.exit(),undefined);
 const car=facilities.group.getObjectByName('d-r30-cable-cabin--1')!;
 assert.ok(Math.hypot(car.position.x-moving.feet.east,car.position.y-moving.feet.height,car.position.z+moving.feet.north)<1e-8);
 t=opened+first.repositionMs+first.clock.oneWayMs+1000;host.updateVisuals();const summitExit=host.exit();assert.ok(summitExit);assert.equal(host.riding(),false);
 if(!first.serviceOpen()){assert.equal(host.board(summitExit,1,0),false);t=epoch+600000+1000;}
 assert.ok(host.board(summitExit,1,0));t+=first.clock.oneWayMs;host.updateVisuals();const baseExit=host.exit();assert.ok(baseExit);assert.equal(host.riding(),false);if(first.serviceOpen())assert.ok(host.board(baseExit,1,0));
 const closed=mountRidgeCableFacilities(new Group(),field,true,true,true);
 try{const blockedHost=createNightBCableRideHost({front:first,frontFacilities:closed,upperOrigin:{east:300,north:676},domain:()=> 'town',acceptLanding:()=>true});assert.equal(blockedHost.frontBound,false);}finally{closed.dispose();}
 }finally{facilities.dispose();}
});
