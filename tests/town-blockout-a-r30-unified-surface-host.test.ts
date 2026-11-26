import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {ar30HistoricSupport,surveyAR30InscriptionAccess,ar30HostTracks,assertAR30SurfaceLifecycle,assertAR30SurfaceAttachment} from '../tools/voxel-tavern/town-blockout/town-a-r30-unified-surface-host';
import {ar30SurfacePort} from '../tools/voxel-tavern/town-blockout/town-a-r30-surface-port';
const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),rail=buildCraterRailExtension(grid,road);
test('actual inscription path consumes stairs and deck, both directions, all three rails',()=>{
 const q=surveyAR30InscriptionAccess(road,rail);
 assert.equal(q.points.length,13);assert.ok(q.maxStep<=.43&&q.maxStep>=.22);
 assert.ok(q.trackGap>2.19&&q.steps>1000&&q.bodyGap>=.27);
 assert.equal(ar30HostTracks(rail)[2],rail.sidingSamples);
});
test('missing floor or added blocker invalidates actual route',()=>{
 const saved=rail.group.userData.floors;
 rail.group.userData.floors=[];
 try{assert.throws(()=>surveyAR30InscriptionAccess(road,rail));}finally{rail.group.userData.floors=saved;}
 const old=road.group.userData.colliders;
 const p=rail.stationWalkRoutes.find(r=>r.id==='inscription-access')!.points.at(-2)!;
 road.group.userData.colliders=[...old,{min:[p.east-.5,p.height,-p.north-.5],max:[p.east+.5,p.height+2,-p.north+.5]}];
 try{assert.throws(()=>surveyAR30InscriptionAccess(road,rail),/blocked/);}finally{road.group.userData.colliders=old;}
});
test('public host rejects half-mounted B ground and incomplete attachment',()=>{
 assertAR30SurfaceLifecycle(road,undefined);
 const ground=road.group.getObjectByName('meteor-crater-walk-mesh')!;
 const previous=ground.userData.bR30UnifiedRelief;
 ground.userData.bR30UnifiedRelief=true;
 try{assert.throws(()=>assertAR30SurfaceLifecycle(road,undefined),/installed together/);}finally{ground.userData.bR30UnifiedRelief=previous;}
 assert.throws(()=>assertAR30SurfaceAttachment(road,rail),/Incomplete/);
});
test('legacy port remains dormant, historic supports respect movement ceiling',()=>{
 assert.equal(ar30SurfacePort(),undefined);
 const s={historic:{route:[],supportedHeight:(e:number)=>e===1?5:undefined},productionReady:false as const,dispose(){}};
 assert.equal(ar30HistoricSupport(undefined,1,0,6),undefined);
 assert.equal(ar30HistoricSupport(s,1,0,4.99),undefined);
 assert.equal(ar30HistoricSupport(s,1,0,5),5);
 assert.equal(ar30HistoricSupport(s,2,0,6),undefined);
});
