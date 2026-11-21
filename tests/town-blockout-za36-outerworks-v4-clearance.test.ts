import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid, worldBounds } from '../tools/voxel-tavern/town-blockout/terrain';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { buildZa36CraterEjecta } from '../tools/voxel-tavern/town-blockout/town-za36-crater-ejecta';
import { buildZa36CraterMidground } from '../tools/voxel-tavern/town-blockout/town-za36-crater-midground';

test('ZA-36 four-round unified worksite clears every V4 rock, tree and log from fence, wall and building footprints', () => {
  const grid = createTerrainGrid();
  const road = mountWestCraterRoad(worldBounds.depth, n => grid.groundHeightAt(0, n));
  const scene = road.outerworks;
  const stones = buildZa36CraterEjecta(road).placements;
  const forest = buildZa36CraterMidground(road).placements;
  assert.equal(stones.filter(piece => piece.kind === 'ejecta').length, 60);
  assert.equal(stones.filter(piece => piece.kind === 'blackstone').length, 41);
  assert.equal(stones.filter(piece => piece.kind === 'char').length, 20);
  assert.equal(forest.filter(piece => piece.kind === 'dead-pine').length, 36);
  assert.equal(forest.filter(piece => piece.kind === 'fallen-pine').length, 8);
  assert.equal(forest.filter(piece => piece.kind === 'lava-column').length, 14);
  const decorated = [
    ...stones.map(piece => ({ east: piece.east, north: piece.north,
      radius: piece.footprint, kind: piece.kind })),
    ...forest.map(piece => ({ east: piece.east, north: piece.north,
      radius: piece.radius, kind: piece.kind })),
  ];
  let inspected = 0;
  for (const piece of decorated) {
    for (const fence of scene.fenceParts) {
      assert.ok(Math.hypot(piece.east - fence.east, piece.north - fence.north) >=
        piece.radius + fence.radius + .4,
        `fence intersects ${piece.kind} at ${piece.east},${piece.north}`);
      inspected++;
    }
    for (const wall of scene.wallParts) {
      assert.ok(Math.abs(piece.east - wall.east) >= piece.radius + 1 ||
        Math.abs(piece.north - wall.north) >= piece.radius + wall.width / 2 + .3,
        `300m stone wall intersects ${piece.kind} at ${piece.east},${piece.north}`);
      inspected++;
    }
    for (const site of scene.sites) {
      const dx = Math.max(0, Math.abs(piece.east - site.east) - site.footprint[0] / 2);
      const dn = Math.max(0, Math.abs(piece.north - site.north) - site.footprint[1] / 2);
      assert.ok(Math.hypot(dx, dn) >= piece.radius + 1.5,
        `${site.id} intersects ${piece.kind} at ${piece.east},${piece.north}`);
      inspected++;
    }
  }
  assert.ok(inspected > 25000, 're-check whole unified scene, not a sampled screenshot');
  assert.ok(road.group.getObjectByName('za36-crater-outside-complex'));
  assert.ok(road.group.getObjectByName('za36-crater-midground'));
  assert.ok(road.group.getObjectByName('za36-crater-ejecta-landmarks'));
  assert.ok(road.group.getObjectByName('za36-winch-rope-stay'));
});
