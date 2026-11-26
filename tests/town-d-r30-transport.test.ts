import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {createTerrainGrid} from '../tools/voxel-tavern/town-blockout/terrain';
import {buildFrontRidgeR30Field} from '../tools/voxel-tavern/town-blockout/town-d-r30-front-ridge';
import {solveLowerRidgeRoad,tryConstrainedLowerRoadbed} from '../tools/voxel-tavern/town-blockout/town-d-r30-roadbed';
import {auditRidgeRoadCrossings} from '../tools/voxel-tavern/town-blockout/town-d-r30-road-survey';
import {mountRidgeRoadFurniture} from '../tools/voxel-tavern/town-blockout/town-d-r30-road-furniture';
import {mountRidgeCableFacilities,externalCableDockSupport,auditRidgeCableSweep} from '../tools/voxel-tavern/town-blockout/town-d-r30-cable-facilities';

test('lower road engineering fixture uses one graded field with actual net width and slope',()=>{
 const grid=createTerrainGrid(),field=buildFrontRidgeR30Field(grid.groundHeightAt,()=>1);
 const {route}=solveLowerRidgeRoad(field,()=>true);
 assert.ok(route.length>100);assert.equal(auditRidgeRoadCrossings(route).length,0);
 const result=tryConstrainedLowerRoadbed(field,route,()=>true);
 assert.ok(result.ok&&'field'in result);
 assert.ok(result.audit.samples>4000&&result.audit.maxGrade<=.12);
 assert.ok(result.cut<=8.00001&&result.fill<=8.00001);
 assert.equal(result.field.heightAt(290,300),field.heightAt(290,300));
 assert.equal(result.field.heightAt(526,329),18);
 for(const side of ['north','south','west','east'] as const)assert.deepEqual(result.field.edge(side),field.edge(side));
 assert.throws(()=>tryConstrainedLowerRoadbed(field,route,()=>false),/protected land/);
 const furniture=mountRidgeRoadFurniture(result.field,route,()=>true);
 try{assert.ok(furniture.postCount>0);assert.ok(furniture.railCount>0);for(const p of route)assert.equal(furniture.blocked(p.east,p.north,result.field.heightAt(p.east,p.north)!),false)}
 finally{furniture.dispose()}
});
test('cable candidate preserves the protected railway datum and clocks both cabins from surveyed spans',()=>{
 const grid=createTerrainGrid(),field=buildFrontRidgeR30Field(grid.groundHeightAt,(e,n)=>{
  const t=Math.min(1,Math.hypot(Math.max(0,Math.abs(e-526)-29),Math.max(0,Math.abs(n-329)-17))/15);return t*t*(3-2*t)
 });
 assert.equal(field.heightAt(526,329),26);
 const model=mountRidgeCableFacilities(new Group(),field);
 try{
  const s=model.survey;assert.equal(s.towers.filter(p=>p.station).length,3);assert.ok(s.minClearance>=-1e-6);
  assert.ok(s.length>500&&s.length<600);assert.ok(s.maxTower<60);
  const atStart=model.update(0);assert.equal(atStart[0]!.height,26);assert.equal(atStart[1]!.height,347);
  const atMiddle=model.update(s.lowerMetres/5*1000+500);
  assert.equal(atMiddle[0]!.station,'middle');assert.ok(Math.abs(atMiddle[0]!.height-140)<1e-6);
  const arrived=model.update(model.clock.oneWayMs);assert.ok(Math.abs(arrived[0]!.height-347)<1e-6);
  assert.equal(model.blocked(336,640,347),false);
  const proposed=mountRidgeCableFacilities(new Group(),field,true);
  try{
   assert.equal(proposed.survey.towers[0]!.north,354);
   assert.equal(model.survey.towers[0]!.north,329);
   assert.equal(externalCableDockSupport(526,346),26);
   assert.equal(externalCableDockSupport(526,354),26);
   assert.equal(externalCableDockSupport(530,354),undefined);
   assert.equal(externalCableDockSupport(526,358),undefined);
   for(let n=347;n<356;n+=.25)assert.equal(proposed.blocked(526,n,26),false);
   const sweep=auditRidgeCableSweep(field,proposed.survey);
   assert.equal(sweep.groundHits,0);assert.equal(sweep.productionReady,false);
  }finally{proposed.dispose()}
 }finally{model.dispose()}
});
