import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,InstancedMesh,Matrix4,Vector3} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {createTownRailway} from '../tools/voxel-tavern/town-blockout/town-railway';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {mountProductionRidge} from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {mountRidgeCableFacilities,externalCableDockSupport} from '../tools/voxel-tavern/town-blockout/town-d-r30-cable-facilities';
import {mountNorthRidgeMiddleStation} from '../tools/voxel-tavern/town-blockout/north-ridge-middle-station';
import {mountRidgeRoadFurniture} from '../tools/voxel-tavern/town-blockout/town-d-r30-road-furniture';
import {mountRidgeRetainingBanks} from '../tools/voxel-tavern/town-blockout/town-d-r30-retaining-banks';
import {mountRidgeCloudTerrace} from '../tools/voxel-tavern/town-blockout/town-d-r30-cloud-terrace';
import {buildRailwayStation} from '../tools/voxel-tavern/town-blockout/landmark-station';
import {auditNightBFrontOpenFacilities} from '../tools/voxel-tavern/town-blockout/town-night-b-summit-front-sweep';
test('front production field and actual rail, station, forest, roads, banks and terrace audit',()=>{
 const grid=createTerrainGrid(),root=new Group(),west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const rail=createTownRailway(grid,()=>0),branch=buildCraterRailExtension(grid,west,rail.route.points);
 const ridge=mountProductionRidge(root,grid,{loop:rail.route.points,branch:branch.samples});
 assert.ok(ridge.facilities&&ridge.stationReady&&ridge.serviceExit);assert.equal(ridge.transportReady,false);
 const owner=new Group(),field=ridge.field,allowed=(e:number,n:number)=>ridge.ownership.distance(e,n)>0;
 const facility=mountRidgeCableFacilities(owner,field,true,false,true),station=mountNorthRidgeMiddleStation(owner);
 const furniture=ridge.roads.map((r,i)=>mountRidgeRoadFurniture(field,r.route,allowed,i===ridge.roads.length-1?{title:'后坡施工终点',returnTo:'基站'}:i===1?{title:'中山施工终点',returnTo:'中站'}:undefined));
 const banks=ridge.roads.map(r=>mountRidgeRetainingBanks(field,r.route,allowed));
 const terrace=mountRidgeCloudTerrace(owner,field,()=>false,true);
 const hall=buildRailwayStation(),boxes=[...(hall.userData.colliders??[]),...(hall.userData.floors??[])].map(q=>({min:[q.min[0]+526,q.min[1]+26,q.min[2]-329],max:[q.max[0]+526,q.max[1]+26,q.max[2]-329]}));
 const all=[...boxes,...rail.group.userData.colliders,...rail.group.userData.floors,...branch.group.userData.colliders,...branch.group.userData.floors];
 const matrix=new Matrix4(),pos=new Vector3(),scale=new Vector3(),stationBoxes:{east:number;north:number;height:number;w:number;d:number;h:number}[]=[];
 for(const mesh of station.group.children){if(!(mesh instanceof InstancedMesh))continue;for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix);scale.setFromMatrixScale(matrix);if(pos.y+scale.y/2>140.10)stationBoxes.push({east:pos.x,north:-pos.z,height:pos.y,w:scale.x,d:scale.z,h:scale.y});}}
 const hits:Record<string,number>={},first:Record<string,unknown>={};
 const mark=(kind:string,p:unknown)=>{hits[kind]=(hits[kind]??0)+1;first[kind]??=p;};
 const audit=auditNightBFrontOpenFacilities(field,facility,(p,w,d,top)=>{
  const found=new Set<string>();
  if(stationBoxes.some(x=>Math.abs(p.east-x.east)<w+x.w/2&&Math.abs(p.north-x.north)<d+x.d/2&&p.height+top>x.height-x.h/2&&p.height<x.height+x.h/2))found.add('station-rendered');
  if(all.some(x=>p.east+w>x.min[0]&&p.east-w<x.max[0]&&-p.north+d>x.min[2]&&-p.north-d<x.max[2]&&p.height+top>x.min[1]&&p.height<x.max[1]))found.add('rail');
  for(let i=0;i<=6;i++)for(let j=0;j<=8;j++)for(const dh of [0,top-1.8]){
   const e=p.east+(i/3-1)*w,n=p.north+(j/4-1)*d,h=p.height+dh;
   if(ridge.forest.blocked(e,n,h,.025))found.add('forest');
   if(station.blocked(e,n,h,.025))found.add('station');
   if(terrace.blocked(e,n,h,.025))found.add('terrace');
   if(furniture.some(f=>f.blocked(e,n,h,.025)))found.add('road-furniture');
   if(banks.some(b=>b.blocked(e,n,h,.025)))found.add('retaining-bank');
  }
  for(const key of found)mark(key,p);return found.size>0;
 });
 const docks=facility.survey.towers.filter(p=>p.station).flatMap(p=>[-1,1].map(s=>{const e=p.east+s*1.55,n=p.north-2.1,h=p.height;return {e,n,h,support:externalCableDockSupport(e,n)??station.surfaceAt(e,n)??field.heightAt(e,n),blocked:facility.blocked(e,n,h)||ridge.forest.blocked(e,n,h,.27)||station.blocked(e,n,h,.27)||terrace.blocked(e,n,h,.27)||furniture.some(f=>f.blocked(e,n,h,.27))||banks.some(b=>b.blocked(e,n,h,.27))}}));
 console.log(JSON.stringify({audit,hits,first,docks}));
 assert.equal(audit.groundHits,0);assert.equal(audit.ownHits,0);assert.equal(audit.obstacleHits,0,JSON.stringify({hits,first}));assert.ok(audit.candidateEnvelopeClear);assert.ok(docks.every(p=>p.support===p.h&&!p.blocked));
 facility.dispose();station.dispose();terrace.dispose();
});
