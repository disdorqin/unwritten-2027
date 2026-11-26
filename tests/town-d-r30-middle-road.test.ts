import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group} from 'three';
import {createTerrainGrid} from '../tools/voxel-tavern/town-blockout/terrain';
import {buildFrontRidgeR30Field} from '../tools/voxel-tavern/town-blockout/town-d-r30-front-ridge';
import {buildMiddleEastRoadbed} from '../tools/voxel-tavern/town-blockout/town-d-r30-upper-roadbed';
import {auditRidgeRoadSurface} from '../tools/voxel-tavern/town-blockout/town-d-r30-roadbed';
import {mountNorthRidgeMiddleStation} from '../tools/voxel-tavern/town-blockout/north-ridge-middle-station';
import {mountRidgeRoadFurniture} from '../tools/voxel-tavern/town-blockout/town-d-r30-road-furniture';
import {mountRidgeRetainingBanks} from '../tools/voxel-tavern/town-blockout/town-d-r30-retaining-banks';
import {mountRidgeForest,ridgeForestRouteClearance} from '../tools/voxel-tavern/town-blockout/town-d-r30-forest';
test('middle east road: one actual graded field, fixed station pad, continuous lane and protection',()=>{
 const grid=createTerrainGrid(),natural=buildFrontRidgeR30Field(grid.groundHeightAt,()=>1);
 const r=buildMiddleEastRoadbed(natural,()=>true);
 assert.ok(r.ok&&'field'in r&&'audit'in r);
 assert.ok(r.audit.maxGrade<=.12&&r.audit.samples>=900&&r.route.at(-1)!.cum>70);
 assert.ok(r.cut<=8.00001&&r.fill<=8.00001&&r.changed>1000);
 assert.equal(r.protectedChanges,0);
 for(let n=508;n<=532;n++)for(let e=425;e<=455;e++)assert.equal(r.field.vertexAt(e,n),natural.vertexAt(e,n));
 for(const side of ['north','south','west','east']as const)assert.deepEqual(r.field.edge(side),natural.edge(side));
 assert.ok(r.maxCoreGrade<=.12+1e-5);
 const path=[{east:440,north:520,height:140,cum:-4},...r.route];
 assert.ok(auditRidgeRoadSurface(r.field,path).maxGrade<=.12);
 assert.throws(()=>buildMiddleEastRoadbed(natural,()=>true,[{east:440,north:524},{east:440,north:524}]),RangeError);
 const station=mountNorthRidgeMiddleStation(new Group()),furniture=mountRidgeRoadFurniture(r.field,r.route,()=>true),banks=mountRidgeRetainingBanks(r.field,r.route,()=>true),forest=mountRidgeForest(r.field,ridgeForestRouteClearance([path]));
 let probes=0;
 try{
  for(let i=1;i<path.length;i++){
   const a=path[i-1]!,b=path[i]!,de=b.east-a.east,dn=b.north-a.north,len=Math.hypot(de,dn),count=Math.ceil(len/.25);
   for(let j=0;j<=count;j++)for(const off of [-1.25,0,1.25]){
    const t=j/count,e=a.east+de*t-dn/len*off,n=a.north+dn*t+de/len*off;const y:number=r.field.heightAt(e,n)!;
    assert.equal(station.blocked(e,n,y,.27),false,'station lane');
    assert.equal(furniture.blocked(e,n,y),false,'road furniture lane');
    assert.equal(banks.blocked(e,n,y),false,'retaining lane');
    assert.equal(forest.blocked(e,n,y),false,'forest lane');probes++;
   }
  }
  assert.ok(probes>1000);console.log('Middle road',JSON.stringify({probes,walls:banks.walls.length,bricks:banks.brickCount,posts:furniture.postCount,lanterns:furniture.lanternCount}));
 }finally{station.dispose();furniture.dispose();banks.dispose();forest.dispose()}
 assert.equal(buildMiddleEastRoadbed(natural,()=>false).ok,false);
});
