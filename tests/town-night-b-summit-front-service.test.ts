import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createZa36CableRepair} from '../src/shared/za36-cable-repair';
import {createNightBFrontService} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-front-service';
import {createTerrainGrid} from '../tools/voxel-tavern/town-blockout/terrain';
import {buildFrontRidgeR30Field} from '../tools/voxel-tavern/town-blockout/town-d-r30-front-ridge';
import {mountRidgeCableFacilities,auditRidgeCableSweep} from '../tools/voxel-tavern/town-blockout/town-d-r30-cable-facilities';
import {Group} from 'three';
test('front service uses surveyed dual cabins, actual repair authority and terminal dwell',()=>{
 const grid=createTerrainGrid(),field=buildFrontRidgeR30Field(grid.groundHeightAt,()=>1);
 const facilities=mountRidgeCableFacilities(new Group(),field,true,false);
 try {
 const s=facilities.survey,raw=auditRidgeCableSweep(field,s),repair=createZa36CableRepair(1);
 // Isolated candidate fixture has no other buildings; NOT a production obstacle certificate.
 const audit=auditRidgeCableSweep(field,s,()=>false);let t=0,day=true,sync=true,deck=true;
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
 }finally{facilities.dispose();}
});
