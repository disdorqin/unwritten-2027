import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  c2SecondMineBoxAllowed, c2SecondMineBounds, c2SecondMineRoomAt,
} from '../tools/voxel-tavern/town-blockout/town-c2-second-mine-contract.js';

const box = (x: number, n: number, w = 1, d = 1, h = 1, y = 0) =>
  ({ x, y, n, w, h, d });

test('C2 -140 contract keeps the certified room envelope and local datum', () => {
  assert.deepEqual(c2SecondMineBounds, {
    minX: -66, maxX: 66, minN: 0, maxN: 198, minY: -.7, maxY: 13,
  });
  assert.equal(c2SecondMineRoomAt(0, 137)?.id, 'dark-river');
  assert.equal(c2SecondMineRoomAt(51.5, 137)?.id, 'dry-bypass');
  assert.equal(c2SecondMineBoxAllowed(box(0, 137)), false);
  assert.equal(c2SecondMineBoxAllowed(box(51.5, 137, .4, .4)), false);
  assert.equal(c2SecondMineBoxAllowed(box(60, 120, 1, 1, 1, -.8)), false);
});

test('C2 -140 contract protects the all-water dry route, ferry line and wing doors', () => {
  for (const [x, n] of [[0, 20], [0, 112], [25, 112.4], [51.5, 137], [51.5, 159], [0, 190]] as const) {
    assert.equal(c2SecondMineBoxAllowed(box(x, n)), false, `${x}/${n} is reserved route`);
  }
  assert.equal(c2SecondMineBoxAllowed(box(0, 137, 2, 2)), false);
  for (const [x, n] of [[-4, 47], [4, 79], [-48, 171], [48, 174]] as const) {
    assert.equal(c2SecondMineBoxAllowed(box(x, n)), false, `${x}/${n} is a wing door`);
  }
});

test('C2 -140 contract allows dense wall-band art while reserving workface and camp centres', () => {
  assert.equal(c2SecondMineBoxAllowed(box(-26.5, 47, .8, 1.2, 2.4)), true);
  assert.equal(c2SecondMineBoxAllowed(box(30.5, 79, .8, 1.2, 2.4)), true);
  assert.equal(c2SecondMineBoxAllowed(box(-45.5, 110, .8, 1.2, 2.4)), true);
  assert.equal(c2SecondMineBoxAllowed(box(45.5, 163, .8, 1.2, 2.4)), true);
  assert.equal(c2SecondMineBoxAllowed(box(-24, 48, 1, 1)), false);
  assert.equal(c2SecondMineBoxAllowed(box(-3.5, 10, 1, 1)), false);
  assert.equal(c2SecondMineBoxAllowed(box(-12, 150, 1, 1)), false);
});
