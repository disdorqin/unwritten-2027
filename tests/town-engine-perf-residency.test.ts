import test from 'node:test';
import assert from 'node:assert/strict';
import {planResidency,drawableTier,type PerfTier} from '../tools/voxel-tavern/town-blockout/engine-perf/residency';
const chunk={id:'sample',revision:'r1',west:0,east:64,south:0,north:64,staticGeometry:true};
test('residency is distance-based and unaffected by facing',()=>{
 const foot={east:64,north:32};
 for(let yaw=0;yaw<360;yaw++)assert.equal(planResidency(chunk,{...foot,...({yaw} as object)}).tier,'near');
 assert.equal(planResidency(chunk,{east:180,north:32}).tier,'near');
 assert.equal(planResidency(chunk,{east:180,north:32}).simulate,false);
});
test('demotion uses hysteresis, promotion is immediate',()=>{
 assert.equal(planResidency(chunk,{east:205,north:32},'near').tier,'near');
 assert.equal(planResidency(chunk,{east:225,north:32},'near').tier,'middle');
 assert.equal(planResidency(chunk,{east:180,north:32},'far').tier,'near');
});
test('missing replacement retains ready coverage',()=>{
 assert.equal(drawableTier('far','near',new Set<PerfTier>(['far'])),'far');
 assert.equal(drawableTier('far','near',new Set<PerfTier>(['far','near'])),'near');
});
