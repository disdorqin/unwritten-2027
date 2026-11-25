import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {supportFootprintOverlaps} from '../tools/voxel-tavern/town-blockout/town-a-r30-oriented-support';
const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
const boxes=road.outerWorks.colliders;
function blocked(e:number,n:number,r=.12){
 const h=road.heightAt(e,n)!;
 return boxes.some(b=>h+.025<b.max[1]&&h+1.775>b.min[1]&&supportFootprintOverlaps(e,n,b,r));
}
test('roadside stones are grounded real step supports, and do not close the gate',()=>{
 const stones=road.outerWorks.floors.filter(b=>b.min[0]>=-35.1&&b.max[0]<=-6.8&&b.min[2]>-162.6&&b.max[2]<-155.4&&b.max[0]-b.min[0]<.85&&b.max[2]-b.min[2]<.85);
 assert.ok(stones.length>=60);
 for(const b of stones){
  const e=(b.min[0]+b.max[0])/2,n=-(b.min[2]+b.max[2])/2,h=road.heightAt(e,n)!;
  assert.ok(b.min[1]<=h&&b.max[1]>h&&b.max[1]-h<.20);
  assert.ok(b.max[0]<-22||b.min[0]>-15);
 }
});
test('isolation wall bays and both gate returns reach actual ground, leaving only the designed gate',()=>{
 for(let n=10.1;n<=309.9;n+=.1){
  if(n>155.6&&n<162.4)continue;
  assert.ok(blocked(-18,n),JSON.stringify({n}));
 }
 for(let e=-21;e<=-15;e+=.1)assert.ok(!blocked(e,159,.27),JSON.stringify({e}));
});
