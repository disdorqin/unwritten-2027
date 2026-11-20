import assert from 'node:assert/strict';
import test from 'node:test';
import { createWarriorForgeHall } from '../tools/voxel-tavern/town-blockout/underground-warrior-forge-hall.ts';

test('the rear main street and forge share a level door approach and three reachable interaction feet', () => {
  const hall = createWarriorForgeHall();
  try {
    assert.deepEqual(hall.entry, { east: 142, north: 4.9, height: -165 });
    const aisle = { east: 142, north: 8.8 };
    for (const [from, to] of [[hall.entry, aisle], ...Object.values(hall.stand).map(to => [aisle, to])] as const) {
      for (let i = 0; i <= 60; i++) {
        const east = from.east + (to.east - from.east) * i / 60;
        const north = from.north + (to.north - from.north) * i / 60;
        assert.equal(hall.floorHeightAt(east, north), -165);
        assert.equal(hall.canStand(east, north), true, `blocked at ${east}/${north}`);
      }
    }
    assert.equal(hall.canStand(145, 4.9), false);
    assert.equal(hall.canStand(140, 10), false);
    assert.equal(hall.canStand(144, 12.13), false);
    assert.equal(hall.floorHeightAt(142, 15), undefined);
    assert.ok(hall.group.getObjectByName('forge-mouth'));
    assert.ok(hall.colliders.length > 10);
  } finally {
    hall.dispose();
  }
});
