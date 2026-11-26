import assert from 'node:assert/strict';
import test from 'node:test';
import {Box3,Vector3} from 'three';
import {createTerrainGrid,worldBounds} from '../tools/voxel-tavern/town-blockout/terrain';
import {mountWestCraterRoad} from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import {installBR30Workface} from '../tools/voxel-tavern/town-blockout/town-b-r30-crater-workface';

test('R30 workface has three grounded industrial models outside the C route, with one collision registration',()=>{
  const grid=createTerrainGrid();
  const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n));
  const original=[...road.group.userData.colliders];
  const kit=installBR30Workface(road);
  assert.equal(kit.sites.length,3);
  assert.equal(installBR30Workface(road),kit);
  assert.equal(road.group.userData.colliders.length,original.length+3);
  road.group.updateMatrixWorld(true);
  for(const site of kit.sites){
    assert.ok(site.clearance>=.65&&site.routeClearance>=2.6&&site.solidClearance>=.65);
    const model=kit.group.getObjectByName(site.id)!;
    assert.ok(model.children.length>=3);
    const actual=new Box3().setFromObject(model);
    const solid=new Box3(new Vector3(...site.box.min),new Vector3(...site.box.max));
    assert.ok(solid.containsBox(actual),site.id+' must fit its shared collision volume');
  }
  kit.dispose();kit.dispose();
  assert.deepEqual(road.group.userData.colliders,original);
});
