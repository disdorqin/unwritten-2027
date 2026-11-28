import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildTownRailRoute} from '../tools/voxel-tavern/town-blockout/town-railway';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {mountProductionRidge} from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {buildSwitchbackCenterline} from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';
import {sampleNorthRidge350} from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';
import {planC2AscentRoad,mountC2AscentRoad} from '../tools/voxel-tavern/town-blockout/town-night-c2-front-ascent-road';
import {fitA33FrontAscent} from '../tools/voxel-tavern/town-blockout/town-a33-front-ascent-fit';
test('minimax earthwork lower bound follows a known grade-limited ridge',()=>{
 const pts=[0,10,20].map(east=>({east,north:0,height:0,cum:east}));
 const result=fitA33FrontAscent(pts,e=>e===10?12:0,.1,0,0);
 assert.ok(Math.abs(result.minimumMaxEarthwork-11)<.00001);
 assert.equal(result.possibleAt8m,false);assert.ok(result.actualGrade<=.1+1e-6);
});
test('C2 real ascent is fit against the actual public ground and old protection, never a synthetic field',()=>{
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),loop=buildTownRailRoute(grid).points,rail=buildCraterRailExtension(grid,road,loop);
 const ridge=mountProductionRidge(new Group(),grid,{loop,branch:rail.samples,rearConnectorCandidate:true});
 const points=buildSwitchbackCenterline(sampleNorthRidge350,grid.groundHeightAt);
 const plan=planC2AscentRoad(points);
 const asset=mountC2AscentRoad(ridge.field.heightAt,{points,field:ridge.field});
 try{
  const a=fitA33FrontAscent(plan,ridge.field.heightAt,.105),b=fitA33FrontAscent(plan,ridge.field.heightAt,.12);
  for(const fit of [a,b]){
   assert.equal(fit.points[0]!.height,140);assert.equal(fit.points.at(-1)!.height,347);
   assert.ok(fit.actualGrade<.120001);assert.ok(fit.minimumMaxEarthwork<=Math.max(fit.cut,fit.fill)+.00001);
  }
  let protectedStations=0,oldRoadConflict=0;
  for(const p of b.points){
   if(ridge.ownership.distance(p.east,p.north)<=0&&Math.abs(p.height-ridge.field.heightAt(p.east,p.north)!)>.025)protectedStations++;
   if(ridge.roads.some(r=>r.roadAt?.(p.east,p.north))&&Math.abs(p.height-ridge.field.heightAt(p.east,p.north)!)>.08)oldRoadConflict++;
  }
  const summarize=(f:typeof a)=>({length:f.length,minimumMaxEarthwork:f.minimumMaxEarthwork,cut:f.cut,fill:f.fill,cutAt:f.points[f.cutAt],fillAt:f.points[f.fillAt],grade:f.actualGrade,over8:f.over8,possibleAt8m:f.possibleAt8m});
  console.log(JSON.stringify({actualC2:asset.stats(),productionMount:asset.deltaReport.productionMount,design105:summarize(a),limit12:summarize(b),protectedStations,oldRoadConflict}));
  assert.ok(a.minimumMaxEarthwork<=Math.max(asset.stats().maxCut,asset.stats().maxFill)+.001);
  assert.ok(b.minimumMaxEarthwork<=a.minimumMaxEarthwork+.00001);
 }finally{asset.dispose();ridge.dispose();}
});
