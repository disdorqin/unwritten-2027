import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {buildTownRailRoute} from '../tools/voxel-tavern/town-blockout/town-railway';
import {readWalkGeometry} from '../tools/voxel-tavern/town-blockout/landmark-kit';
import {mountWestMountainGround,westMountainTrackProtection} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-west-ground';
import {a33WestFoothillRoute} from '../tools/voxel-tavern/town-blockout/town-a33-west-foothill';
import {mountWestMountainFootway,westMountainFootway} from '../tools/voxel-tavern/town-blockout/town-night-a-summit-west-footway';
test('physical west detour has clear body envelope in both directions, including the original tree base',()=>{
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const rail=buildCraterRailExtension(grid,road,buildTownRailRoute(grid).points);
 const west=mountWestMountainGround(road.heightAt,{west:-240,east:0,south:336,north:worldBounds.depth},westMountainTrackProtection([rail.samples,rail.narrowSamples,rail.sidingSamples]));
 const ground=(e:number,n:number)=>west.heightAt(e,n)??road.heightAt(e,n);
 const foot=mountWestMountainFootway(ground);
 const boxes=[road.group,rail.group].flatMap(q=>{const g=readWalkGeometry(q);return [...g.colliders,...g.floors]}).filter(b=>b.max[0]!>-115&&b.min[0]!<-77&&b.min[2]!<-260&&b.max[2]!>-535);
 const all=[...westMountainFootway,...a33WestFoothillRoute.slice(1)];
 assert.ok(west.stats.changedFoothillVertices>8000&&west.stats.maxFoothillDelta>8);
 let min=Infinity,steps=0,grade=0;
 try{
  for(const direction of [1,-1]){
   const path=direction===1?all:[...all].reverse();let prev:{e:number;n:number;h:number}|undefined;
   for(let i=1;i<path.length;i++){
    const a=path[i-1]!,b=path[i]!,dx=b[0]-a[0],dn=b[1]-a[1],d=Math.hypot(dx,dn),count=Math.ceil(d/.08);
    for(let j=0;j<=count;j++){
     const e=a[0]+dx*j/count,n=a[1]+dn*j/count,h=ground(e,n)!;
     assert.ok(Number.isFinite(h)&&n<540&&(road.terrainReadyAt(e,n)||west.readyAt(e,n)));
     for(const v of boxes)if(h+.025<v.max[1]!&&h+1.775>v.min[1]!){
      const gap=Math.hypot(Math.max(v.min[0]!-e,e-v.max[0]!,0),Math.max(v.min[2]!+n,-n-v.max[2]!,0));min=Math.min(min,gap);
      assert.ok(gap>.75+.27,'body plus path half-width '+JSON.stringify({e,n,gap}));
     }
     if(prev){const d=Math.hypot(e-prev.e,n-prev.n);if(d>1e-8)grade=Math.max(grade,Math.abs(h-prev.h)/d);}
     prev={e,n,h};steps++;
    }
   }
  }
  assert.ok(grade<.85);assert.ok(foot.triangles>0);
  console.log(JSON.stringify({steps,min,grade,triangles:foot.triangles,foothill:west.stats}));
 }finally{west.dispose();foot.dispose();}
});
