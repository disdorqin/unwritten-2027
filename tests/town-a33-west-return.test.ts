import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Group,Mesh} from 'three';
import {createTerrainGrid,worldBounds,canEnter} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {buildTownRailRoute} from '../tools/voxel-tavern/town-blockout/town-railway';
import {readWalkGeometry} from '../tools/voxel-tavern/town-blockout/landmark-kit';
import {mountWestMountainGround,westMountainTrackProtection} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-west-ground';
import {mountProductionRidge} from '../tools/voxel-tavern/town-blockout/town-d-r30-production-ridge';
import {mountA33WestFoothillDressing} from '../tools/voxel-tavern/town-blockout/town-a33-west-foothill-dressing';
import {a33WestReturnRoute} from '../tools/voxel-tavern/town-blockout/town-a33-west-foothill';
import {mountWestMountainFootway} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-west-footway';
import {westPresenceBounds} from '../src/shared/za22-west-domain';
test('N536 return joins the actual west and town triangle surfaces, avoiding the real northbound rail',()=>{
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),loop=buildTownRailRoute(grid).points,rail=buildCraterRailExtension(grid,road,loop);
 const protect=westMountainTrackProtection([rail.samples,rail.narrowSamples,rail.sidingSamples]);
 const west=mountWestMountainGround(road.heightAt,{west:-240,east:0,south:336,north:800},protect);
 const ridge=mountProductionRidge(new Group(),grid,{loop,branch:rail.samples,rearConnectorCandidate:true});
 const ground=(e:number,n:number)=>e<0?west.heightAt(e,n)??road.heightAt(e,n):grid.heightAt(e,n);
 const prior=[road.group,rail.group].flatMap(q=>{const g=readWalkGeometry(q);return [...g.colliders,...g.floors]});
 const dressing=mountA33WestFoothillDressing(ground,protect,prior);
 const foot=mountWestMountainFootway(ground,a33WestReturnRoute,'a33-west-north-return');
 const boxes=[...prior,...dressing.solids].filter(b=>b.max[0]!>-100&&b.min[0]!<4&&b.min[2]!<-510&&b.max[2]!>-540);
 let samples=0,maxGrade=0,minGap=Infinity,metres=0;
 try{
  assert.ok(Math.abs(west.heightAt(0,536)??road.heightAt(0,536)!-grid.heightAt(0,536))<.001);
  for(const direction of [1,-1]){
   const path=direction===1?a33WestReturnRoute:[...a33WestReturnRoute].reverse();
   let prev:{e:number;n:number;h:number}|undefined;
   for(let i=1;i<path.length;i++){
    const a=path[i-1]!,b=path[i]!,de=b[0]-a[0],dn=b[1]-a[1],d=Math.hypot(de,dn),steps=Math.ceil(d/.1);
    if(direction===1)metres+=d;
    for(let j=0;j<=steps;j++){
     const e=a[0]+de*j/steps,n=a[1]+dn*j/steps,h=ground(e,n)!;
     assert.ok(Number.isFinite(h)&&n+.27<westPresenceBounds.depth);
     if(e<0)assert.ok(road.terrainReadyAt(e,n)||west.readyAt(e,n));else if(e>=1)assert.ok(canEnter(e,n));
     assert.equal(ridge.blocked(e,n,h,.95),false);
     for(const b of boxes)if(h+.025<b.max[1]!&&h+1.775>b.min[1]!){
      const gap=Math.hypot(Math.max(b.min[0]!-e,e-b.max[0]!,0),Math.max(b.min[2]!+n,-n-b.max[2]!,0));minGap=Math.min(minGap,gap);assert.ok(gap>1.02);
     }
     if(prev){const d=Math.hypot(e-prev.e,n-prev.n);if(d>1e-8)maxGrade=Math.max(maxGrade,Math.abs(h-prev.h)/d);}
     prev={e,n,h};samples++;
    }
   }
  }
  assert.ok(maxGrade<.25);
  for(const m of foot.group.children as Mesh[]){const p=m.geometry.getAttribute('position');for(let i=0;i<p.count;i++)assert.ok(Math.abs(p.getY(i)-ground(p.getX(i),-p.getZ(i))!-.016)<.001);}
  console.log(JSON.stringify({samples,maxGrade,minGap,metres,treadTriangles:foot.triangles}));
 }finally{foot.dispose();dressing.dispose();west.dispose();ridge.dispose();}
});
