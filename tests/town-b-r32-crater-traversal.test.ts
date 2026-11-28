import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {buildTownRailRoute} from '../tools/voxel-tavern/town-blockout/town-railway';
import {ar30SurfacePort} from '../tools/voxel-tavern/town-blockout/town-a-r30-surface-port';
import {auditBR32CraterTraversal} from '../tools/voxel-tavern/town-blockout/town-b-r32-crater-traversal';
test('full mounted crater spiral and bottom approach retain sled-size clearance and reveal a real inserted obstruction',()=>{
 const grid=createTerrainGrid(),port=ar30SurfacePort(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n),{unifiedStory:port.story}),rail=buildCraterRailExtension(grid,road,buildTownRailRoute(grid).points),assembly=port.attach(road,rail);
 try{
  const audit=auditBR32CraterTraversal(road,rail);
  assert.ok(audit.length>820&&audit.probes>25000);
  assert.equal(audit.bodyHits,0);assert.equal(audit.fenceHits,0);
  assert.ok(audit.maxGrade<.1&&audit.maxStep<.01);
  assert.ok(Math.abs(audit.floor.height-(road.anchor.rimHeight-35))<.12);
  console.log(JSON.stringify(audit));
  const p=audit.point(.72),block={min:[p.east-.2,p.height,-p.north-.2],max:[p.east+.2,p.height+1,-p.north+.2]};
  road.group.userData.colliders.push(block);
  try{const bad=auditBR32CraterTraversal(road,rail);assert.ok(bad.bodyHits>0);assert.ok(bad.hitBoxes.some(b=>b.box===block));}finally{road.group.userData.colliders.pop();}
 }finally{assembly.dispose();}
});
