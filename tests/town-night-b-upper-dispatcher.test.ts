import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTownD2R30Ropeway} from '../tools/voxel-tavern/town-blockout/town-d2-r30-ropeway';
import {createZa36CableRepair} from '../src/shared/za36-cable-repair';
import {createNightBLine2Service} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-line2-service';
import {mountNightBUpperDispatcher} from '../tools/voxel-tavern/town-blockout/town-night-b-upper-dispatcher';
test('real C10 station position has one dispatcher and authoritative timetable/repair status without a second clock',()=>{
 const r=createTownD2R30Ropeway({controlPointSupports:false}),d=mountNightBUpperDispatcher(r);
 const state=createZa36CableRepair(2),dawn=1000000;let t:number|undefined=dawn;
 const s=createNightBLine2Service({ropeway:r,audit:{samples:1,minClearance:1,minMoving:1,groundHits:0,obstacleHits:0,missingHeights:0,externalSurveyed:true,candidateEnvelopeClear:true},state:state.snapshot,now:()=>t,daylight:()=>true,dockClear:()=>true,firstRun:{wokeAt:()=>dawn,openedAt:()=>undefined,dawnEpoch:()=>dawn}});
 try{
  assert.equal(d.group.parent,r.stations.stations['cloud-deck'].group);
  assert.equal(d.group.children.length,1);assert.ok(d.available(d.visitor));assert.equal(d.available(d.stand),false);
  assert.equal(d.blocked(d.stand.east,d.stand.north,d.stand.height),true);
  assert.equal(r.blocked(d.visitor.east,d.visitor.north,d.visitor.height),false);
  d.update(s,state.snapshot(),true);assert.match(d.notice()!,/未启用/);
  state.apply({kind:'wake',impact:'night-window'});
  d.update(s,state.snapshot(),true);assert.match(d.notice()!,/首次下行/);
  t=dawn+r.cable.legMs+10;state.apply({kind:'strike-rust'});
  d.update(s,state.snapshot(),true);assert.match(d.notice()!,/锈闸 1\/9/);
  t=undefined;d.update(s,state.snapshot(),false);assert.match(d.notice()!,/等待同步/);
  d.dispose();assert.equal(d.group.parent,null);assert.equal(d.available(d.visitor),false);
 }finally{d.dispose();r.dispose();}
});
