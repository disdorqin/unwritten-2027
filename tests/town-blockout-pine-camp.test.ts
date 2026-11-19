import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit';
import { buildPineCamp } from '../tools/voxel-tavern/town-blockout/town-pine-camp';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';

const grid = createTerrainGrid();

test('pine camp keeps the R6 anchor open with a clear eight-metre gate', t => {
  const camp = buildPineCamp(grid);
  const { colliders, floors, ramps } = readWalkGeometry(camp.group);
  assert.deepEqual(camp.sites.northGate, [425, 243, 26]);
  assert.equal(camp.keepClear(425, 243, 0), true);
  const [x, n, y] = camp.sites.northGate;
  const atCenter = colliders.filter(box => box.min[0] <= x && box.max[0] >= x &&
    box.min[2] <= -n && box.max[2] >= -n);
  assert.equal(atCenter.length, 1);
  assert.ok(atCenter[0].min[1] - y > 3.4);
  const j = colliders.filter(box => box.min[1] < y && box.max[1] > y &&
    box.min[2] <= -n && box.max[2] >= -n).sort((a, b) => a.min[0] - b.min[0]);
  assert.equal(j.length, 2);
  assert.ok(j[1].min[0] - j[0].max[0] >= 8);
  assert.equal(floors.length, 4);
  assert.ok(ramps.length >= 4);
  t.diagnostic(`gate anchor ${y}, ground ${grid.heightAt(x, n).toFixed(4)}, clear width ${(j[1].min[0] - j[0].max[0]).toFixed(3)}`);
});

test('the clipped fire pad supports its six seats without covering the dwelling side', t => {
  const camp = buildPineCamp(grid);
  const [x, n] = camp.sites.fire;
  const y = camp.fireGroundAt(x, n);
  assert.equal(typeof y, 'number');
  assert.ok(y! > grid.heightAt(x, n));
  for (const angle of [0, -Math.PI / 3, Math.PI / 3, -2 * Math.PI / 3, 2 * Math.PI / 3, Math.PI]) {
    const facing = -Math.PI / 2 + angle;
    assert.equal(camp.fireGroundAt(x + Math.sin(facing) * 2.15, n + Math.cos(facing) * 2.15), y);
  }
  assert.equal(camp.fireGroundAt(x - 1.5, n - 1.35), y);
  assert.equal(camp.fireGroundAt(415.5, 223.7), undefined);
  assert.equal(camp.keepClear(418, 225, 0), true);
  assert.equal(camp.keepClear(430, 320, 0), true);
  t.diagnostic(`fire (418,225) support ${y!.toFixed(4)}, terrain ${grid.heightAt(x, n).toFixed(4)}, 6 seats / 1 woodpile`);
});

test('the two display rows have nine cubic snowmen with pumpkin heads, and player formation remains separate', t => {
  const camp = buildPineCamp(grid);
  assert.equal(camp.snowmen.length, 9);
  const batch = camp.group.children.find(object => object.name.includes('九座南瓜雪人'));
  assert.ok(batch instanceof InstancedMesh);
  const matrix = new Matrix4(), position = new Vector3(), quarter = new Quaternion(), size = new Vector3();
  const color = new Color();
  const heads: string[] = [];
  for (let index = 0; index < batch.count; index++) {
    batch.getColorAt(index, color);
    if (color.getHexString() !== 'c66a24') continue;
    batch.getMatrixAt(index, matrix);
    matrix.decompose(position, quarter, size);
    assert.deepEqual(size.toArray(), [1, 1, 1]);
    heads.push([position.x.toFixed(3), (-position.z).toFixed(3)].join('/'));
  }
  assert.deepEqual(heads, camp.snowmen.map(([x, n]) => [x.toFixed(3), n.toFixed(3)].join('/')));
  const staticColliders = camp.group.userData.colliders.length;
  assert.equal(camp.group.getObjectByName('成型方块雪人'), undefined);
  camp.setFormation(3, undefined, { carrot: true, branches: true });
  assert.ok(camp.group.getObjectByName('成型方块雪人') instanceof InstancedMesh);
  camp.setFormation(2, '雪人', { carrot: false, branches: false });
  const namedModel = camp.group.getObjectByName('成型方块雪人');
  assert.ok(namedModel instanceof InstancedMesh);
  assert.ok(camp.group.getObjectByName('玩家雪人留名牌') instanceof InstancedMesh);
  namedModel.getColorAt(1, color);
  namedModel.getMatrixAt(1, matrix);
  matrix.decompose(position, quarter, size);
  assert.equal(color.getHexString(), 'c66a24');
  assert.deepEqual(size.toArray(), [1, 1, 1]);
  assert.equal(camp.group.userData.colliders.length, staticColliders);
  camp.setFormation(0);
  assert.equal(camp.group.getObjectByName('成型方块雪人'), undefined);
  const trail = camp.group.getObjectByName('松林藏宝脚印');
  assert.ok(trail);
  assert.equal(trail.visible, false);
  camp.setTreasureTrailVisible(true);
  assert.equal(trail.visible, true);
  assert.equal(camp.footprintPairs, Math.floor(camp.trailLength / 6));
  t.diagnostic(`9 display heads, trail ${camp.trailLength.toFixed(3)} m, ${camp.footprintPairs} pairs, ${batch.count} static boxes`);
});
