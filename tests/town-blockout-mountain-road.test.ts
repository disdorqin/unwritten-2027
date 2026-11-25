import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMountainRoadLayer } from '../tools/voxel-tavern/town-blockout/town-mountain-road';

const layer = () => createMountainRoadLayer({
  mileposts: [
    { id: 'P1', east: 0, north: 0, arcM: 0 },
    { id: 'P2', east: 0, north: 250, arcM: 250 },
    { id: 'P3', east: 30, north: 480, arcM: 500 },
  ],
  restPoints: [{ id: 'R1', east: 30, north: 480, leeRadiusM: 4 }],
  viewpoints: [{ id: 'V1', east: 34, north: 484, name: '望镇台', radiusM: 5 }],
});

test('stamps land in any order, only in reach, only once', () => {
  const road = layer();
  assert.equal(road.stamp('P3', { east: 30, north: 481 }), true, 'top post first is fine');
  assert.equal(road.stamp('P3', { east: 30, north: 481 }), false, 'no double stamp');
  assert.equal(road.stamp('P1', { east: 40, north: 40 }), false, 'too far away');
  assert.equal(road.stamp('P9', { east: 0, north: 0 }), false, 'unknown post');
  assert.equal(road.roadComplete(), false);
  road.stamp('P1', { east: 1, north: 1 });
  road.stamp('P2', { east: 0, north: 249 });
  assert.equal(road.roadComplete(), true);
  assert.equal(road.stampedCount(), 3);
});

test('rest lee shelters; viewpoints record exactly once', () => {
  const road = layer();
  assert.equal(road.shelteredAt({ east: 31, north: 479 }), true);
  assert.equal(road.shelteredAt({ east: 60, north: 480 }), false);
  assert.equal(road.visit({ east: 34, north: 484 })?.name, '望镇台');
  assert.equal(road.visit({ east: 34, north: 484 }), undefined, 'second visit records nothing');
  assert.equal(road.visit({ east: 0, north: 0 }), undefined);
});
