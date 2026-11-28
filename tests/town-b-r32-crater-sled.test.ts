import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {buildTownRailRoute} from '../tools/voxel-tavern/town-blockout/town-railway';
import {ar30SurfacePort} from '../tools/voxel-tavern/town-blockout/town-a-r30-surface-port';
import {auditBR32CraterSled} from '../tools/voxel-tavern/town-blockout/town-b-r32-crater-sled';
import {createSledMotion} from '../tools/voxel-tavern/town-blockout/sled-motion';

test('a stopped braked sled can turn on steep uneven terrain without reverse oscillation',()=>{
 const motion=createSledMotion(),dt=1/60;
 motion.reset(0);
 for(let i=0;i<60;i++){
  const state=motion.step(dt,{forward:0,turn:1,brake:true},{grade:.6,surface:0,deepSnow:false});
  assert.equal(state.speed,0);assert.equal(state.rollingBack,false);assert.ok(Math.abs(state.heading-(i+1)*1.5*dt)<1e-9);
 }
 const state=motion.step(dt,{forward:1,turn:0},{grade:.08,surface:0,deepSnow:false});
 assert.ok(state.speed>0);
});
test('actual mounted crater geometry allows the same physical sled to descend, turn, return, park and remount',()=>{
 const grid=createTerrainGrid(),port=ar30SurfacePort(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n),{unifiedStory:port.story}),rail=buildCraterRailExtension(grid,road,buildTownRailRoute(grid).points),assembly=port.attach(road,rail);
 try{
  const report=auditBR32CraterSled(road,rail);
  console.log(JSON.stringify(report));
  assert.equal(report.hits,0);
  assert.ok(report.down.complete&&report.arrival?.complete&&report.upStart?.complete&&report.up?.complete);
  for(const leg of [report.down,report.arrival,report.upStart,report.up]){
   assert.ok(leg.mounted);assert.equal(leg.recoveries,0);assert.ok(leg.maxError<.4);assert.ok(leg.maxHeightError<.025);
  }
  assert.ok(report.down.distance>820&&report.up.distance>820);
  assert.equal(report.left,true);assert.equal(report.remounted,true);
 }finally{assembly.dispose();}
});
