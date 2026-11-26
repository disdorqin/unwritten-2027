import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds,riverX} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildTownRailRoute} from '../tools/voxel-tavern/town-blockout/town-railway';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {createAR30RidgeOwnership} from '../tools/voxel-tavern/town-blockout/town-a-r30-ridge-ownership';
const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),loop=buildTownRailRoute(grid);
const rail=buildCraterRailExtension(grid,road,loop.points);
const ownership=createAR30RidgeOwnership({loop:loop.points,branch:rail.samples});
test('actual ring/branch and protected original town/river/station have zero ridge ownership',()=>{
 for(const p of loop.points)assert.equal(ownership.weight(p.x,-p.z),0);
 for(const p of rail.samples)assert.equal(ownership.weight(p.east,p.north),0);
 for(const [e,n] of [[226,223],[378,316],[526,329],[296,502],[296,520],[riverX(600),600],[riverX(600)+12,600]])assert.equal(ownership.weight(e!,n!),0);
 assert.equal(ownership.weight(320,650),1);
 assert.equal(ownership.weight(NaN,600),0);
});
test('ownership is continuous outside protected routes and never exceeds one',()=>{
 let max=0;
 for(let e=0;e<=640;e+=2)for(let n=270;n<=800;n+=2){
  const v=ownership.weight(e,n);
  assert.ok(v>=0&&v<=1);
  if(e<640)max=Math.max(max,Math.abs(v-ownership.weight(e+1,n)));
  if(n<800)max=Math.max(max,Math.abs(v-ownership.weight(e,n+1)));
 }
 assert.ok(max<=1.5/ownership.feather+1e-6);
});
