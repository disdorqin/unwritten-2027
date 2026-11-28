import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
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

  // D2-R10/B31-1: the line ships as three instanced batches (masts, merged
  // iron lattice members, and the foundation palette), so 31 towers cost three
  // draw calls instead of one mesh per tower part. The batch split is B's
  // physical authority (lattice merge), not a relaxed budget: still <= 3.
  const batches = towers.group.children.filter(child => child instanceof InstancedMesh);
  assert.equal(batches.length, 3, 'mast, merged lattice and foundation batches');
  assert.equal(stats.drawCalls, 3, JSON.stringify(stats));
  assert.ok(stats.drawCalls <= 3);
  const mast = batches.find(batch => batch.name.endsWith('-mast'))!;
  assert.ok(mast, 'the mast batch must exist');
  assert.equal(mast.count, stats.towers);
  // The merged batch carries every lattice member of every tower, plus the
  // crossbars, braces, footings and snow caps that used to be separate batches.
  const iron = batches.find(batch => batch.name.endsWith('-iron-boxes'))!;
  assert.ok(iron, 'the merged iron batch must exist');
  assert.ok(iron.count >= stats.towers * 3, 'every tower must keep its members');
  assert.ok(stats.latticeMembers > stats.towers * 3);

  // Every tower is positioned over the domain and its mast base sits on the
  // R30 ground directly below the sampled rope point.
  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  for (let index = 0; index < mast.count; index++) {
    mast.getMatrixAt(index, matrix);
    matrix.decompose(position, quaternion, scale);
    const east = position.x, north = -position.z;
    const ground = sampleTownD2R30Height(east, north);
    assert.ok(ground !== undefined, `tower outside domain E${east}/N${north}`);
    const base = position.y - scale.y / 2;
    assert.ok(Math.abs(base - ground) < 1.5, `tower base ${base} != ground ${ground}`);
    assert.ok(scale.y > 1, `mast height ${scale.y}`);
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

test('D2-R3 tower masts block the player while open ground stays passable', context => {
  const towers = cleanup(context, createTownD2R30CableTowers());
  const mast = towers.group.children.find(child =>
    child instanceof InstancedMesh && child.name.endsWith('-mast')) as InstancedMesh;
  assert.ok(mast, 'the mast batch carries the solid tower bodies');
  const matrix = new Matrix4(), position = new Vector3(), quaternion = new Quaternion(), scale = new Vector3();
  mast.getMatrixAt(0, matrix);
  matrix.decompose(position, quaternion, scale);
  const east = position.x, north = -position.z;
  const ground = sampleTownD2R30Height(east, north)!;
  assert.equal(towers.blocked(east, north, ground), true, 'player walks through the mast');
  assert.equal(towers.blocked(east + 2, north, ground), false, 'open ground falsely blocked');
  // Above the mast top and below the ground the mast is not an obstacle.
  assert.equal(towers.blocked(east, north, ground + scale.y + 5), false);
  // B's physical authority fails closed on a non-finite probe instead of
  // throwing: a NaN query must never read as "open ground".
  assert.equal(towers.blocked(NaN, north, ground), true);
  towers.dispose();
  // After dispose the query stays fail-closed (a disposed tower set is not a
  // passable field) rather than silently reporting open ground.
  assert.equal(towers.blocked(east, north, ground), true);
  assert.equal(towers.group.userData.includesWorldCollision, true);
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
