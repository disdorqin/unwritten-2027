import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, Mesh } from 'three';
import { createTownD2R30CableTowers } from '../tools/voxel-tavern/town-blockout/town-d2-r30-cable-towers';
import { createMainSummitCable } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { summitCableSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

type Towers = ReturnType<typeof createTownD2R30CableTowers>;

function cleanup(context: TestContext, towers: Towers) {
  context.after(() => towers.dispose());
  return towers;
}

test('D2-R02 cable towers densely support the canonical 1920 m line on R30 terrain', context => {
  const towers = cleanup(context, createTownD2R30CableTowers());
  assert.equal(towers.group.userData.owner, 'D2-R02');
  assert.equal(towers.group.userData.modifiesCable, false);
  assert.equal(towers.group.userData.modifiesHeightAt, false);
  const stats = towers.stats();
  assert.ok(stats.ropeMetres > 1900 && stats.ropeMetres < 2000, `rope ${stats.ropeMetres}`);
  assert.ok(stats.towers >= 25, JSON.stringify(stats));
  assert.ok(stats.maxTowerHeight < 200, JSON.stringify(stats));
  assert.ok(stats.drawCalls > 0 && stats.triangles > 0);
  assert.ok(stats.minClearance >= 1);

  const towerGroups = towers.group.children.filter(child => child.type === 'Group');
  assert.equal(towerGroups.length, stats.towers);
  // Every tower is positioned over the domain and contains a pole whose base
  // sits on the R30 ground directly below the sampled rope point.
  for (const tower of towerGroups) {
    const east = tower.position.x, north = -tower.position.z;
    const ground = sampleTownD2R30Height(east, north);
    assert.ok(ground !== undefined, `tower outside domain E${east}/N${north}`);
    const pole = tower.children[0] as Mesh;
    const geometry = pole.geometry;
    geometry.computeBoundingBox();
    const base = geometry.boundingBox!.min.y;
    assert.ok(Math.abs(base - (ground - 0.3)) < 1.5, `tower base ${base} != ground ${ground}`);
  }
});

test('D2-R02 cable towers honor custom rope and terrain without touching cabins', context => {
  const cable = createMainSummitCable(0, 10_000, 347);
  const ropeBefore = cable.ropes[0].points.map(point => ({ ...point }));
  const towers = cleanup(context, createTownD2R30CableTowers({
    cable,
    spacing: 30,
    heightAt: (east, north) => 300 + (north ?? 0) * .3,
  }));
  const coarse = createTownD2R30CableTowers({ cable, spacing: 60 });
  context.after(() => coarse.dispose());
  assert.deepEqual(cable.ropes[0].points, ropeBefore, 'cable rope survey must stay identical');
  const stats = towers.stats();
  assert.equal(stats.spacing, 30);
  assert.ok(stats.towers > coarse.stats().towers);
  assert.ok(summitCableSpec.speedMetresPerSecond === 8);
});

test('D2-R02 cable towers validate inputs and dispose GPU resources exactly once', context => {
  const parent = new Group();
  const towers = createTownD2R30CableTowers({ spacing: 80 });
  parent.add(towers.group);
  const resources = new Set<unknown>();
  towers.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    resources.add(object.geometry);
    resources.add(object.material);
  });
  let disposals = 0;
  for (const resource of resources) {
    (resource as { addEventListener(type: 'dispose', cb: () => void): void })
      .addEventListener('dispose', () => { disposals++; });
  }
  towers.dispose();
  towers.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(towers.group.children.length, 0);
  assert.equal(disposals, resources.size);
  assert.equal(towers.group.userData.disposed, true);

  assert.throws(() => createTownD2R30CableTowers({ spacing: 0 }), /Invalid/);
  context.after(() => {});
});
