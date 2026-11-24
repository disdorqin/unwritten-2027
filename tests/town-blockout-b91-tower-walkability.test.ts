import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import type {CraterTowerWalkPoint} from '../tools/voxel-tavern/town-blockout/town-crater-outer-works';
const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
type Box={min:number[];max:number[]};
const boxes=road.group.userData.colliders as Box[],floors=road.group.userData.floors as Box[];
const ramps=road.group.userData.ramps as (Box&{axis:'x'|'z';ascending:1|-1})[];
const radius=.27,body=1.8,step=.43,epsilon=.025;
function overlaps(e:number,n:number,b:Box){
 const dx=Math.max(b.min[0]!-e,e-b.max[0]!,0),dz=Math.max(b.min[2]!+n,-n-b.max[2]!,0);
 return dx*dx+dz*dz<radius*radius;
}
function next(e:number,n:number,g:number){
 let h=road.heightAt(e,n)!;
 for(const b of floors)if(b.max[1]!<=g+step&&overlaps(e,n,b))h=Math.max(h,b.max[1]!);
 for(const b of ramps)if(e>=b.min[0]!&&e<=b.max[0]!&&-n>=b.min[2]!&&-n<=b.max[2]!){
  const i=b.axis==='x'?0:2,f=((i===0?e:-n)-b.min[i]!)/(b.max[i]!-b.min[i]!);
  const top=b.min[1]!+(b.max[1]!-b.min[1]!)*(b.ascending===1?f:1-f);
  if(top<=g+step)h=Math.max(h,top);
 }
 for(const b of boxes)if(b.max[1]!<=g+.03&&overlaps(e,n,b))h=Math.max(h,b.max[1]!);
 const hit=[...boxes,...floors].find(b=>h+epsilon<b.max[1]!&&h+body-epsilon>b.min[1]!&&overlaps(e,n,b));
 return {h,hit,ok:!hit&&Math.abs(h-g)<=step+1e-6&&!road.fenceBlocks(e,n,h,radius)};
}
function walk(points:readonly CraterTowerWalkPoint[],start:number){
 let h=start,max=start,count=0;
 for(let j=1;j<points.length;j++){
  const a=points[j-1]!,b=points[j]!,len=Math.hypot(b.east-a.east,b.north-a.north),samples=Math.ceil(len/.035);
  for(let k=1;k<=samples;k++){
   const t=k/samples,e=a.east+(b.east-a.east)*t,n=a.north+(b.north-a.north)*t;
   const result=next(e,n,h);
   assert.ok(result.ok,JSON.stringify({j,k,e,n,from:h,...result}));
   h=result.h;max=Math.max(max,h);count++;
  }
  assert.ok(Math.abs(h-b.height)<.035,JSON.stringify({j,h,expected:b.height}));
 }
 return {h,max,count};
}
test('B91 point 2: all three real tower stairways use viewer body/step rules in both directions',()=>{
 assert.equal(road.outerWorks.towerRoutes.length,3);
 for(const tower of road.outerWorks.towerRoutes){
  const points=[tower.entry,...tower.stairs];
  const up=walk(points,tower.entry.height);
  assert.ok(up.max-tower.entry.height>9);
  assert.ok(Math.abs(up.h-tower.rubbingUse.height)<.035);
  const down=walk(points.slice().reverse(),up.h);
  assert.ok(Math.abs(down.h-tower.entry.height)<.035);
 }
});
test('B91 point 2: three distinct lookout and rubbing hosts are grounded atop their own tower',()=>{
 const ts=road.outerWorks.towerRoutes;
 assert.equal(new Set(ts.map(t=>t.id)).size,3);
 for(const t of ts){
  assert.ok(t.lookout.height-t.entry.height>=9);
  assert.ok(Math.hypot(t.rubbing.east-t.rubbingUse.east,t.rubbing.north-t.rubbingUse.north)>1);
  for(const p of [t.lookout,t.rubbingUse])assert.ok(next(p.east,p.north,p.height).ok);
 }
});
