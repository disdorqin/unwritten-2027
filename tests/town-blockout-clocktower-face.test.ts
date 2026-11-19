import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Matrix4, Vector3, type InstancedMesh } from 'three';
import { attachTowerTime, updateTowerTime } from '../tools/voxel-tavern/town-blockout/clocktower-face.ts';

const faceY = 78.53125;
const boardY = 58.5;
const towerFace = () => {
  const tower = new Group();
  attachTowerTime(tower, faceY, boardY, 5.5);
  return tower;
};

test('outside and inside clock faces point up, right and down at the same hours', () => {
  const tower = towerFace();
  const hands = tower.getObjectByName('钟楼随时针') as InstancedMesh;
  assert.equal(hands.count, 182);
  const sample = new Matrix4(), center = new Vector3();
  for (const [clockHour, dx, dy] of [[12, 0, 1], [3, 1, 0], [6, 0, -1]]) {
    const epoch = Date.UTC(2026, 10, 19, clockHour - 8);
    updateTowerTime(tower, epoch, null, false);
    for (let face = 0; face < 5; face++) {
      const inside = face === 4;
      const direction = inside ? 0 : face * Math.PI / 2;
      hands.getMatrixAt(face * 37 + 6, sample);
      center.setFromMatrixPosition(sample);
      const tangent = (Math.cos(direction) * center.x - Math.sin(direction) * center.z) * (inside ? -1 : 1);
      const distance = inside ? .5625 : .72;
      assert.ok(Math.abs(tangent - dx * distance) < 1e-5);
      assert.ok(Math.abs(center.y - faceY - dy * distance) < 1e-5);
    }
  }
});

test('clock board pixels rest on the dark backing with a fixed relief and stable slots', () => {
  const tower = towerFace();
  const pixels = tower.getObjectByName('钟楼像素时刻牌') as InstancedMesh;
  const matrix = new Matrix4();
  assert.equal(pixels.count, 94);
  tower.userData.clockBoard.setText('12:34:56');

  let left = Infinity, right = -Infinity, lit = 0;
  for (let i = 0; i < pixels.count; i++) {
    pixels.getMatrixAt(i, matrix);
    const coordinates = matrix.elements;
    const width = coordinates[0];
    if (width === 0) continue;
    lit++;
    assert.equal(width, .3125);
    assert.equal(coordinates[5], .3125);
    assert.ok(Math.abs(coordinates[14] + coordinates[10] / 2 - 5.78) < 1e-6);
    assert.ok(Math.abs(coordinates[14] - coordinates[10] / 2 - 5.75) < 1e-6);
    left = Math.min(left, coordinates[12] - width / 2);
    right = Math.max(right, coordinates[12] + width / 2);
  }
  assert.equal(lit, 66);
  assert.equal(right - left, 7.125);

  const version = pixels.instanceMatrix.version;
  tower.userData.clockBoard.setText('12:34:56');
  assert.equal(pixels.instanceMatrix.version, version);
  tower.userData.clockBoard.setText('12:34:57');
  assert.equal(pixels.instanceMatrix.version, version + 1);
});
