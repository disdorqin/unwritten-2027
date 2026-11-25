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
test('isolation wall bays and both gate returns reach actual ground, leaving only the designed gate',()=>{
 for(let n=10.1;n<=309.9;n+=.1){
  if(n>155.6&&n<162.4)continue;
  assert.ok(blocked(-18,n),JSON.stringify({n}));
 }
 for(let e=-21;e<=-15;e+=.1)assert.ok(!blocked(e,159,.27),JSON.stringify({e}));
});
