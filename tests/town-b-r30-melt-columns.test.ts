import assert from 'node:assert/strict';
import test from 'node:test';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {buildCraterRailExtension} from '../tools/voxel-tavern/town-blockout/town-crater-rail-extension';
import {attachBR30PhysicalKit} from '../tools/voxel-tavern/town-blockout/town-b-r30-physical-kit';
import {installBR30MeltColumns} from '../tools/voxel-tavern/town-blockout/town-b-r30-melt-columns';
test('replace fourteen original melt columns and their old boxes on actual ground',()=>{
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
 const kit=attachBR30PhysicalKit(road,buildCraterRailExtension(grid,road));
 const old=[...road.group.userData.colliders];
 const m=installBR30MeltColumns(road);
 assert.equal(m.sites.length,14);assert.equal(m.group.children.length,3);assert.equal(m.boxes.length,14);
 assert.equal(road.group.userData.colliders.length,old.length);
 assert.equal(m.views.length,14);
 for(const a of m.audit){assert.ok(Math.abs(a.minRootGap+.12)<1e-8);assert.ok(Math.abs(a.maxRootGap+.12)<1e-8);assert.ok(Math.abs(a.chipGap+.035)<1e-8);}
 assert.ok(m.boxes.every(b=>b.max[0]-b.min[0]<1.24&&b.max[2]-b.min[2]<1.24));
 assert.throws(()=>installBR30MeltColumns(road),/already replaced/);
 m.dispose();m.dispose();assert.equal(road.group.userData.colliders.length,old.length);
 assert.ok(old.every(b=>road.group.userData.colliders.includes(b)));
 kit.dispose();
});
