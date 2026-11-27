import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {createTownRailway} from '../tools/voxel-tavern/town-blockout/town-railway';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {mountProductionRidge} from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {buildRearRidgeConnector} from '../tools/voxel-tavern/town-blockout/town-d-r30-rear-connector';
import {mountRidgeRoadFurniture} from '../tools/voxel-tavern/town-blockout/town-d-r30-road-furniture';
import {mountRidgeRetainingBanks} from '../tools/voxel-tavern/town-blockout/town-d-r30-retaining-banks';
import {mountRidgeForest,ridgeForestRouteClearance} from '../tools/voxel-tavern/town-blockout/town-d-r30-forest';
import {mountNorthRidgeMiddleStation} from '../tools/voxel-tavern/town-blockout/north-ridge-middle-station';
test('separate broad rear landform candidate certifies the long corridor joining old endpoints, never overwrites old field',()=>{
 const g=createTerrainGrid(),r=createTownRailway(g,()=>0),b=buildCraterRailExtension(g,mountWestCraterRoad(worldBounds.depth,n=>g.groundHeightAt(0,n)),r.route.points),p=mountProductionRidge(new Group(),g,{loop:r.route.points,branch:b.samples});
 const before=p.field.elevation.slice(),q=buildRearRidgeConnector(p.field,p.roads,p.ownership.distance);
 assert.ok(q.ok&&'road'in q,q.reason);const {road,audit}=q;assert.ok(road);
 assert.deepEqual(p.field.elevation,before);
 console.log('connector geometry audit',JSON.stringify(audit));assert.ok(audit.length>550&&audit.length<620);assert.equal(audit.frozen,0);assert.equal(audit.oldMax,0);
 assert.ok(audit.maxChange>8&&audit.maxChange<60);assert.ok(audit.roadMax<=8.00001);
 assert.ok(road.audit.maxGrade<=.120001&&road.maxCoreGrade<=.12001);
 assert.equal(road.route[0]!.height,87.5);assert.equal(road.route.at(-1)!.height,140);
 const allowed=(e:number,n:number)=>p.ownership.distance(e,n)>0,roads=[...p.roads,road],clear=ridgeForestRouteClearance(roads.map(r=>r.route));
 const forest=mountRidgeForest(road.field,(e,n,r)=>p.ownership.distance(e,n)>r+3&&clear(e,n,r)&&!(e+r>=284&&e-r<=355&&n+r>=628&&n-r<=670));
 const station=mountNorthRidgeMiddleStation(new Group()),furniture=roads.map(r=>mountRidgeRoadFurniture(road.field,r.route,allowed)),banks=roads.map(r=>mountRidgeRetainingBanks(road.field,r.route,allowed));
 let probes=0;
 try{
 for(let i=1;i<road.route.length;i++){
  const a=road.route[i-1]!,b=road.route[i]!,de=b.east-a.east,dn=b.north-a.north,d=Math.hypot(de,dn),steps=Math.ceil(d/.25);
  for(let j=0;j<=steps;j++)for(const off of [-1.25,0,1.25]){
   const e=a.east+de*j/steps-dn/d*off,n=a.north+dn*j/steps+de/d*off,h=road.field.heightAt(e,n)!;
   assert.equal(forest.blocked(e,n,h)||station.blocked(e,n,h,.27)||furniture.some(f=>f.blocked(e,n,h))||banks.some(b=>b.blocked(e,n,h)),false,'connector blocked '+e+','+n);probes++;
  }
 }
 console.log('rear connector candidate',JSON.stringify({audit,probes}));
 }finally{forest.dispose();station.dispose();furniture.forEach(f=>f.dispose());banks.forEach(b=>b.dispose());}
});
