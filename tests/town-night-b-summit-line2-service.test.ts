import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTownD2R30Ropeway} from '../tools/voxel-tavern/town-blockout/town-d2-r30-ropeway';
import {createTownD2R30Collision} from '../tools/voxel-tavern/town-blockout/town-d2-r30-collision';
import {createTownD2R30CableTowers} from '../tools/voxel-tavern/town-blockout/town-d2-r30-cable-towers';
import {auditNightBSummitCable,createNightBLine2Service,type SummitSweepProbe} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-line2-service';
import {createZa36CableRepair} from '../src/shared/za36-cable-repair';
test('line two uses actual same-source terrain, twin towers, physical docks and shared repair clock',t=>{
 const r=createTownD2R30Ropeway({controlPointSupports:false}),g=createTownD2R30Collision(),tower=createTownD2R30CableTowers();t.after(()=>{r.dispose();g.dispose();tower.dispose()});
 // Isolated station/tower geometry only. Production must add ALL external obstacles.
 const blocked=(p:SummitSweepProbe)=>{
  for(const x of [-1.22,0,1.22])for(const z of [-1.52,0,1.52]){
   const e=p.feet.east+x*Math.cos(p.heading)+z*Math.sin(p.heading),n=p.feet.north-x*Math.sin(p.heading)+z*Math.cos(p.heading);
   for(const dh of [0,.6])if(r.blocked(e,n,p.feet.height+dh,.1)||tower.blocked(e,n,p.feet.height+dh,.1))return true;
  }return false;
 };
 const audit=auditNightBSummitCable(r,g.surfaceAt,blocked);assert.equal(audit.groundHits,0);assert.equal(audit.obstacleHits,0);assert.equal(audit.missingHeights,0);assert.ok(audit.minMoving>.25);assert.ok(audit.candidateEnvelopeClear);console.log('isolated line2 sweep',JSON.stringify(audit));
 const unverified=auditNightBSummitCable(r,g.surfaceAt);assert.equal(unverified.candidateEnvelopeClear,false);
 const obstruction=auditNightBSummitCable(r,g.surfaceAt,p=>p.distance>200&&p.distance<201);assert.ok(obstruction.obstacleHits>0);assert.equal(obstruction.candidateEnvelopeClear,false);
 const authority=createZa36CableRepair(2);let now:number|undefined=0,day=true,clear=true,synced=true;
 const input={ropeway:r,audit,state:()=>synced?authority.snapshot():undefined,now:()=>now,daylight:()=>day,dockClear:(_s:'cloud-deck'|'summit',p:{east:number;north:number;height:number})=>clear&&Math.abs((r.supportAt(p.east,p.north)??Infinity)-p.height)<.05&&!r.blocked(p.east,p.north,p.height)};
 const a=createNightBLine2Service(input),b=createNightBLine2Service(input);
 const start=r.cable.ropes[0].dock('cloud-deck').approach;assert.equal(a.board(start,0),undefined);
 for(const event of [{kind:'wake',impact:'sled'},...Array.from({length:9},()=>({kind:'strike-rust'})),{kind:'pull-brake'},{kind:'pry-cable',effort:1},...Array.from({length:3},()=>({kind:'tighten-cable'})),...[0,1,2,3].flatMap(index=>[{kind:'take-weight',index},{kind:'hang-weight',index}])] as Parameters<typeof authority.apply>[0][])authority.apply(event);
 assert.equal(a.serviceOpen(),true);assert.equal(createNightBLine2Service({...input,audit:unverified}).serviceOpen(),false);
 const ride=a.board(start,0);assert.ok(ride);assert.deepEqual(ride,b.board(start,0));
 now=110000;assert.equal(a.ridePose(ride)?.whiteout,true);assert.deepEqual(a.ridePose(ride),b.ridePose(ride));assert.equal(a.exit(ride),undefined);
 now=r.cable.legMs+1000;assert.deepEqual(a.exit(ride),r.cable.ropes[0].dock('summit').approach);
 clear=false;assert.equal(a.exit(ride),undefined);clear=true;day=false;assert.equal(a.board(r.cable.ropes[0].dock('summit').approach,0),undefined);assert.ok(a.exit(ride));
 day=true;now=r.cable.cycleMs+1000;assert.deepEqual(a.exit(ride),start);synced=false;assert.equal(a.board(start,0),undefined);now=undefined;assert.equal(a.ridePose(ride),undefined);
 const epoch=Date.UTC(2026,0,1);let wake:number|undefined,opened:number|undefined;
 const partial=createZa36CableRepair(2);now=epoch+1000;
 const first=createNightBLine2Service({...input,state:()=>partial.snapshot(),firstRun:{wokeAt:()=>wake,openedAt:()=>opened,dawnEpoch:()=>epoch}});
 const upper=r.cable.ropes[0].dock('summit').approach,other=r.cable.ropes[1].dock('summit').approach;
 assert.ok(first.present().every(c=>c.station==='summit'));assert.equal(first.board(upper,0),undefined);
 wake=now;partial.apply({kind:'wake',impact:'night-window'});
 const released=first.board(upper,0);assert.ok(released);assert.equal(first.board(other,1),undefined);
 now=wake+110000;const moving=first.ridePose(released)!;assert.ok(moving.whiteout);assert.equal(first.exit(released),undefined);
 first.present();const car=r.group.getObjectByName('summit-line2-cabin-0')!;
 assert.ok(Math.hypot(car.position.x-moving.ropePoint.east,car.position.y-moving.ropePoint.height,car.position.z+moving.ropePoint.north)<1e-8);
 assert.equal(first.present()[1]!.station,'summit');
 now=wake+first.firstMs;assert.deepEqual(first.exit(released),start);assert.equal(first.board(start,0),undefined);const stopped=first.present();
 for(const event of [{kind:'wake',impact:'sled'},...Array.from({length:9},()=>({kind:'strike-rust'})),{kind:'pull-brake'},{kind:'pry-cable',effort:1},...Array.from({length:3},()=>({kind:'tighten-cable'})),...[0,1,2,3].flatMap(index=>[{kind:'take-weight',index},{kind:'hang-weight',index}])] as Parameters<typeof partial.apply>[0][])partial.apply(event);
 opened=now;assert.ok(first.serviceOpen() || first.dispatch()?.parked);assert.deepEqual(first.present().map(c=>c.ropePoint),stopped.map(c=>c.ropePoint));
 // A fresh adapter uses exactly the same immutable timestamps after reconnect.
 const rejoin=createNightBLine2Service({...input,state:()=>partial.snapshot(),firstRun:{wokeAt:()=>wake,openedAt:()=>opened,dawnEpoch:()=>epoch}});
 assert.deepEqual(rejoin.present(),first.present());
});
