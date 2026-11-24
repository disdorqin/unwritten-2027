import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildZa36CraterStoryDressing } from '../tools/voxel-tavern/town-blockout/town-za36-crater-story-dressing';
import type { Box } from '../tools/voxel-tavern/town-blockout/landmark-kit';

// 卡06 lamp room (U-20): the hut stands at the winch workface, its walls
// block, its door stays open, and the dressing keeps off its ground.

const terrain = createTerrainGrid();
const road = mountWestCraterRoad(worldBounds.depth, (north) => terrain.groundHeightAt(0, north));

const inside = (boxes: readonly Box[], east: number, north: number, height: number) =>
  boxes.some((b) => east >= b.min[0]! && east <= b.max[0]! &&
    height >= b.min[1]! && height <= b.max[1]! &&
    -north >= b.min[2]! && -north <= b.max[2]!);

function toWorld(lx: number, lz: number) {
  const { anchor } = road;
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  const site = road.lampRoom!.site;
  return {
    east: site.east + lx * c - lz * s,
    north: site.north - lz * c - lx * s,
  };
}

test('the lamp room stands at the workface with its own wall boxes', () => {
  assert.ok(road.lampRoom, 'lamp room mounted');
  assert.equal(road.lampRoom!.boxes.length, 10);
  const boxes = (road.group.userData.colliders ?? []) as Box[];
  assert.ok(boxes.length >= 190, `colliders include the hut (got ${boxes.length})`);
  const ground = road.lampRoom!.site.height;
  const wall = toWorld(-2.3, 0);
  assert.ok(inside(boxes, wall.east, wall.north, ground + 1), 'the west wall blocks');
  const door = toWorld(2.8, -.65);
  assert.ok(!inside(boxes, door.east, door.north, ground + .5), 'the doorway stays open');
  const insideHut = toWorld(0, 0);
  assert.ok(!inside(boxes, insideHut.east, insideHut.north, ground + .5),
    'the hut interior is standable');
  const winch = road.winch!.survey;
  assert.ok(!inside(road.lampRoom!.boxes, winch.useFoot.east, winch.useFoot.north,
    winch.useFoot.height + .5), 'hut boxes never reach the winch working points');
});

test('the hydrology sign follows the night ordinal', () => {
  assert.ok(road.lampRoom);
  assert.equal(road.lampRoom!.signLines()[1], '今夜水位：涨（高）');
  road.lampRoom!.setNightOrdinal(1);
  assert.equal(road.lampRoom!.signLines()[1], '今夜水位：平（中）');
  road.lampRoom!.setNightOrdinal(2);
  assert.equal(road.lampRoom!.signLines()[2], '明夜预告：涨（高）');
});

test('the dressing reserves the lamp room footprint', () => {
  assert.ok(road.lampRoom);
  const { footprint } = road.lampRoom!;
  const plain = buildZa36CraterStoryDressing(road);
  const reserved = buildZa36CraterStoryDressing(road, [footprint]);
  const near = (list: typeof plain.placements) => list.filter((p) =>
    Math.hypot(p.east - footprint.east, p.north - footprint.north) < footprint.radius);
  assert.ok(near(reserved.placements).length === 0,
    'no dressing piece stands on the hut ground');
  assert.ok(plain.placements.length >= reserved.placements.length);
});
