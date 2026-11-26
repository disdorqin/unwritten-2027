import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {supportFootprintOverlaps,type OrientedSupportBox} from '../tools/voxel-tavern/town-blockout/town-a-r30-oriented-support';
const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const rail=buildCraterRailExtension(grid,road);
const floors=rail.group.userData.floors as OrientedSupportBox[],walls=rail.group.userData.colliders as OrientedSupportBox[];
test('both stations expose four real bench seats with unobstructed stand positions',()=>{
 assert.equal(rail.benchSeats.length,4);
 for(const s of rail.benchSeats){
  assert.ok(floors.some(f=>supportFootprintOverlaps(s.useEast,s.useNorth,f,.27)&&Math.abs(f.max[1]-s.height)<.001));
  assert.ok(!walls.some(q=>supportFootprintOverlaps(s.useEast,s.useNorth,q,.27)&&s.height+.025<q.max[1]&&s.height+1.775>q.min[1]));
  assert.ok(walls.some(q=>supportFootprintOverlaps(s.east,s.north,q,.27)&&Math.abs(q.max[1]-s.height-.50)<.001));
 }
});
test('Shankou public arrival and timetable viewing stand on actual clear ground',()=>{
 const start=rail.shankouArrival,station=rail.stationWalkRoutes.find(r=>r.id==='shankou-station')!;
 assert.equal(start.height,grid.heightAt(start.east,start.north));
 for(let n=station.points[0]!.north;n<=start.north;n+=.1){
   const h=grid.heightAt(start.east,n);
   assert.ok(!walls.some(q=>supportFootprintOverlaps(start.east,n,q,.45)&&h+.025<q.max[1]&&h+1.775>q.min[1]));
 }
 const board=rail.timetableReads[0]!;
 assert.equal(board.height,grid.heightAt(board.east,board.north));
 assert.ok(!walls.some(q=>supportFootprintOverlaps(board.east,board.north,q,.45)&&board.height+.025<q.max[1]&&board.height+1.775>q.min[1]));
});
test('sealed scenic portal has a real blocking wall and masonry piers',()=>{
 const g=grid.heightAt(293,546);
 for(const e of [290.1,292,293,294,295.9]){
  assert.ok(walls.some(b=>supportFootprintOverlaps(e,546.2,b,.27)&&b.min[1]<=g+.03&&b.max[1]>=g+1.8),JSON.stringify({e,g}));
 }
});
for(const route of rail.stationWalkRoutes)test(route.id+' actual station floor and steps permit entry and return',()=>{
 const ground=(e:number,n:number)=>e<0?road.heightAt(e,n)!:grid.heightAt(e,n);
 for(const points of [route.points,[...route.points].reverse()]){
  let h=points[0]!.height;
  for(let j=1;j<points.length;j++){
   const a=points[j-1]!,b=points[j]!,count=Math.ceil(Math.hypot(b.east-a.east,b.north-a.north)/.035);
   for(let i=1;i<=count;i++){
    const t=i/count,e=a.east+(b.east-a.east)*t,n=a.north+(b.north-a.north)*t;
    const overlap=(q:OrientedSupportBox)=>supportFootprintOverlaps(e,n,q,.27);
    let y=ground(e,n);
    for(const q of floors)if(overlap(q)&&q.max[1]<=h+.43)y=Math.max(y,q.max[1]);
    assert.ok(Math.abs(y-h)<=.43001,JSON.stringify({j,i,e,n,h,y}));
    assert.ok(![...floors,...walls].some(q=>overlap(q)&&y+.025<q.max[1]&&y+1.775>q.min[1]),JSON.stringify({j,e,n,y}));
    h=y;
   }
  }
  assert.ok(Math.abs(h-points.at(-1)!.height)<.03);
 }
});
