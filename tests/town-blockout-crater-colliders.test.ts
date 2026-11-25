import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCraterColliders } from '../tools/voxel-tavern/town-blockout/town-crater-colliders';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';

// Collision audit fix (2026-11-22): crater pieces were all walk-through.
// Boxes are generated from the mounts' own placements and must hug the
// pieces — never the interaction points, the shaft, or the trail.

const inside = (boxes: ReturnType<typeof buildCraterColliders>,
  east: number, north: number, height: number) => boxes.some((b) =>
  east >= b.min[0]! && east <= b.max[0]! &&
  height >= b.min[1]! && height <= b.max[1]! &&
  -north >= b.min[2]! && -north <= b.max[2]!);

test('unit: each source contributes its boxes and flat pieces stay walkable', () => {
  const boxes = buildCraterColliders({
    yaw: 0,
    winch: {
      plinth: { east: 0, north: 0, height: -24 },
      crane: { east: 1.2, north: -0.7, height: -24 },
      useFoot: { east: -1.2, north: 0.1, height: -24 },
    },
    camp: [
      { kind: 'camp', id: 'collapsed-tent', east: 10, north: 10, height: -24, radius: 2.5 },
      { kind: 'camp', id: 'fire-ring', east: 14, north: 10, height: -24, radius: 1.38 },
      { kind: 'lamp', id: 'guiding-lamp-1', east: 18, north: 10, height: -24, radius: .55 },
      { kind: 'strata', id: 'cut-face-1', east: 22, north: 10, height: -24, radius: 1.78 },
    ],
    midground: [
      { kind: 'dead-pine', east: 30, north: 10, ground: -20, height: 12, radius: 1.35 },
      { kind: 'fallen-pine', east: 38, north: 10, ground: -20, height: .68, radius: 2.2 },
      { kind: 'lava-column', east: 46, north: 10, ground: -20, height: 4, radius: 1.15 },
    ],
    ejecta: [
      { kind: 'ejecta', east: 54, north: 10, ground: -18, footprint: 3, height: 2.5 },
      { kind: 'char', east: 60, north: 10, ground: -18, footprint: 5, height: .11 },
    ],
    dressing: [
      { kind: 'lamp', east: 66, north: 10, height: -24 },
      { kind: 'plate', east: 70, north: 10, height: -24 },
      { kind: 'prop', east: 74, north: 10, height: -24 },
    ],
  });
  // 3 winch + 4 camp + 3 midground + 1 ejecta + 1 dressing lamp.
  assert.equal(boxes.length, 12);
  assert.ok(inside(boxes, 0, 0, -23.5), 'the winch machine blocks');
  assert.ok(inside(boxes, 30, 10, -10), 'a dead pine trunk blocks at height');
  assert.ok(!inside(boxes, 30.5, 10, -10), 'the pine box stays slim');
  assert.ok(!inside(boxes, -1.2, 0.1, -23.5), 'the operator foot point stays open');
  assert.ok(!inside(boxes, 60, 10, -17.8), 'flat scorch stays walkable');
  assert.ok(!inside(boxes, 70, 10, -23.5), 'dressing plates stay walkable');
  assert.ok(!inside(boxes, 74, 10, -23.5), 'timbers stay unboxed (tilt is not recorded)');
});

test('live road: colliders are registered and keep the working points open', () => {
  const terrain = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, (north) => terrain.groundHeightAt(0, north));
  const boxes = (road.group.userData.colliders ?? []) as ReturnType<typeof buildCraterColliders>;
  assert.ok(boxes.length > 40, `expected a full crater set, got ${boxes.length}`);
  assert.ok(road.winch);
  const { plinth, useFoot, snakeStoneReservation } = road.winch!.survey;
  assert.ok(inside(boxes, plinth.east, plinth.north, plinth.height + .3),
    'the mounted winch machine blocks');
  assert.ok(!inside(boxes, useFoot.east, useFoot.north, useFoot.height + .3),
    'the crank position stays reachable');
  assert.ok(!inside(boxes, snakeStoneReservation.east, snakeStoneReservation.north,
    snakeStoneReservation.height + .3), 'the snake-stone reservation stays clear');
  for (const b of boxes) {
    assert.ok(b.min[0]! < b.max[0]! && b.min[1]! < b.max[1]! && b.min[2]! < b.max[2]!,
      'every box is well-formed');
  }
});
