import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {buildTownRailRoute} from '../tools/voxel-tavern/town-blockout/town-railway';
import {ar30SurfacePort} from '../tools/voxel-tavern/town-blockout/town-a-r30-surface-port';
import {auditBR32CraterCampAccess} from '../tools/voxel-tavern/town-blockout/town-b-r32-crater-camp-access';
import type {CraterCampPlacement} from '../tools/voxel-tavern/town-blockout/town-crater-colliders';
test('the existing camp uses physical piece collision and can be reached and left from the real crater floor',()=>{
 const grid=createTerrainGrid(),port=ar30SurfacePort(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n),{unifiedStory:port.story}),rail=buildCraterRailExtension(grid,road,buildTownRailRoute(grid).points),assembly=port.attach(road,rail);
 try{
  const sites=road.group.getObjectByName('za31-crater-camp')!.userData.placements as CraterCampPlacement[];
  assert.ok(sites.every(s=>s.colliders?.length&&s.colliders.every(b=>road.group.userData.colliders.includes(b))));
  const report=auditBR32CraterCampAccess(road,rail);
  console.log(JSON.stringify({...report,routes:report.routes.map(r=>r.reachable?{...r,path:r.path.length,knots:r.knots}:r)}));
  assert.ok(report.ready);assert.equal(report.routes.length,4);assert.ok(report.reverseSamples>1000);assert.equal(report.reverseFailure,undefined);
  for(const route of report.routes){assert.ok(route.reachable);assert.ok(route.metres>20);assert.ok(route.path.length>2);assert.ok(route.knots&&route.knots.length>=2&&route.knots.length<=8);}
 }finally{assembly.dispose();}
});
