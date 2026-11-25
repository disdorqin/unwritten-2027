import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {orientedSupportBox,supportFootprintOverlaps,type OrientedSupportBox} from '../tools/voxel-tavern/town-blockout/town-a-r30-oriented-support';
test('rotated narrow-phase rejects a corner of the enclosing AABB',()=>{
 const box=orientedSupportBox(0,0,Math.PI/4,6,.2,0,2);
 assert.ok(supportFootprintOverlaps(0,0,box,.27));
 assert.ok(!supportFootprintOverlaps(1.8,-1.8,box,.27));
});
test('supply actual stairs lead up to the deck and back down with body and step rules',()=>{
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const path=road.mouthWorks.supplyDeckRoute;
 assert.equal(path.length,19);
 const boxes=road.group.userData.colliders as OrientedSupportBox[],floors=road.group.userData.floors as OrientedSupportBox[];
 const walk=(points:typeof path)=>{
  let h=points[0]!.height;
  for(let j=1;j<points.length;j++){
   const a=points[j-1]!,b=points[j]!,steps=Math.ceil(Math.hypot(b.east-a.east,b.north-a.north)/.025);
   for(let i=1;i<=steps;i++){
    const t=i/steps,e=a.east+(b.east-a.east)*t,n=a.north+(b.north-a.north)*t;
    let v=road.heightAt(e,n)!;
    const overlap=(q:OrientedSupportBox)=>supportFootprintOverlaps(e,n,q,.27);
    for(const f of floors)if(f.max[1]<=h+.43&&overlap(f))v=Math.max(v,f.max[1]);
    for(const c of boxes)if(c.max[1]<=h+.025&&overlap(c))v=Math.max(v,c.max[1]);
    const hit=[...boxes,...floors].find(q=>v+.025<q.max[1]&&v+1.8-.025>q.min[1]&&overlap(q));
    assert.ok(!hit&&Math.abs(v-h)<=.43001,JSON.stringify({j,i,e,n,h,v,hit}));
    h=v;
   }
  }
  assert.ok(Math.abs(h-points.at(-1)!.height)<.03);
 };
 // Check the surveyed ground detour as well as the stairs. Markers must
 // stand outside the actual approach envelope, not block the next waypoint.
 const approach=[[-74.3,126.1],[-70,120],[-72.9,116.85],[-74.8,115.8],[path[0]!.east,path[0]!.north]];
 for(let j=1;j<approach.length;j++){
  const a=approach[j-1]!,b=approach[j]!;
  for(let i=0;i<=100;i++){
   const t=i/100,e=a[0]!+(b[0]!-a[0]!)*t,n=a[1]!+(b[1]!-a[1]!)*t,y=road.heightAt(e,n)!;
   assert.ok(![...boxes,...floors].some(q=>y+.025<q.max[1]&&y+1.775>q.min[1]&&supportFootprintOverlaps(e,n,q,.4)),JSON.stringify({j,e,n}));
  }
 }
 walk(path);walk([...path].reverse());
 const deck=path.at(-1)!;
 const prompt=road.craterActions.actionAt(deck.east,deck.north,deck.height);
 assert.equal(prompt?.label,'使用屋顶望筒观坑');
 assert.notEqual(road.craterActions.actionAt(deck.east,deck.north,deck.height-2.76)?.label,prompt?.label);
});
