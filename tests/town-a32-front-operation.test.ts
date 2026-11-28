import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {createTownRailway} from '../tools/voxel-tavern/town-blockout/town-railway';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {mountProductionRidge} from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {buildRailwayStation} from '../tools/voxel-tavern/town-blockout/landmark-station';
test('front production owner installs exactly one real async facility and repair fixtures after 16 grounded route targets',async()=>{
 const grid=createTerrainGrid(),root=new Group(),west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),rail=createTownRailway(grid,()=>0),branch=buildCraterRailExtension(grid,west,rail.route.points),hall=buildRailwayStation();
 hall.position.set(526,26,-329);root.add(rail.group,branch.group,hall);
 const ridge=mountProductionRidge(root,grid,{loop:rail.route.points,branch:branch.samples,rearConnectorCandidate:true});
 try{
  const old=ridge.facilities?.group;
  const ok=await ridge.preparePublicFrontCable({state:()=>undefined,now:()=>undefined,daylight:()=>undefined,firstRun:{wokeAt:()=>undefined,openedAt:()=>undefined,dawnEpoch:()=>undefined}},[rail.group,branch.group,hall],{yieldTask:async()=>{}});
  assert.ok(ok,JSON.stringify({reason:ridge.frontCablePrepareResult,routeAudit:ridge.frontRouteAudit,slices:ridge.frontAuditSlices}));
  assert.ok(ridge.frontOperation?.repairProps?.ready);
  assert.equal(old?.parent,null);assert.equal(ridge.transportReady,true);
  assert.equal(ridge.frontOperation?.audit.samples,29068);
  assert.ok(ridge.frontAuditSlices&&ridge.frontAuditSlices.count>1);
 }finally{ridge.dispose();}
});
