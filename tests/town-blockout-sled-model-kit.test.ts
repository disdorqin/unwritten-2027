import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstancedMesh, Points, Scene } from 'three';
import { sledDepotParts, sledDetailParts } from '../tools/voxel-tavern/town-blockout/sled-model-kit';
import { createTownSledVisuals, remoteSledParts, sledParts } from '../tools/voxel-tavern/town-blockout/sled-visuals';

const rack = { x: 234, n: 174, y: 12, yaw: 0 };

test('sled R1-R3 model kit contains true rails, individual planks, pitched roof and lantern details', () => {
  assert.ok(sledDetailParts.length >= 65, 'sled should have an actual craft silhouette');
  assert.ok(sledDepotParts.length >= 90, 'depot should have a real roof, not four poles');
  const structure = [...sledDetailParts, ...sledDepotParts];
  for (const [center, size, tint, tilt] of structure) {
    assert.ok(center.every(Number.isFinite) && size.every(value => Number.isFinite(value) && value > 0));
    assert.match(tint, /^#[\da-f]{6}$/i);
    assert.ok(tilt === undefined || Math.abs(tilt) <= .45);
  }
  assert.equal(sledDepotParts.filter((piece) => piece[3] !== undefined).length >= 20, true,
    'snow roof must be actual sloping pieces, not a horizontal slab');
  assert.ok(sledDepotParts.some(([c, , tint]) => c[1] < 1.4 && tint === '#984645'),
    'lantern tassels should be visible below the awning');
  assert.ok(sledDetailParts.some(([c, , tint]) => c[2] > .98 && tint === '#9cabb0'),
    'the runner needs a swept, metal-tipped nose');
});

test('R4 joinery polish preserves the shelter entrance and the sled craft budget', () => {
  assert.ok(sledDetailParts.length >= 120, 'new plank grain and upholstered detailing must ship');
  assert.ok(sledDepotParts.length >= 160, 'gable joinery, eave tiles and back shelf must ship');
  const entryHalfWidth = .27; // player collision radius; geometry-only screening
  const entryMinZ = .38;
  const entryMaxZ = .83;
  const playerHeight = 1.8;
  for (const [[x, y, z], [sx, sy, sz]] of sledDepotParts) {
    const crossesX = x - sx / 2 < entryHalfWidth && x + sx / 2 > -entryHalfWidth;
    const crossesZ = z - sz / 2 < entryMaxZ && z + sz / 2 > entryMinZ;
    const crossesY = y - sy / 2 < playerHeight && y + sy / 2 > 0;
    assert.ok(!(crossesX && crossesZ && crossesY),
      `depot structural mesh obstructs the front-centre player corridor at (${x}, ${y}, ${z})`);
  }
  // This only checks the shelter frame. Occupied sleds, placement and player
  // physics still require full-scene walk-through and must not be called passed.
  assert.ok(sledDepotParts.some(([c, , tint]) => c[1] > 2.1 && tint === '#eff3f5'),
    'snow-lipped eave shingles should be individually readable');
  assert.ok(sledDetailParts.some(([c, , tint]) => c[1] > .53 && tint === '#d07e6b'),
    'quilting needs actual top-surface lines');
});

test('12 roadside depots remain 1 instanced draw; sled and particle system keep their existing interfaces', () => {
  const scene = new Scene();
  const depots = Array.from({ length: 12 }, (_, i) => ({ ...rack, x: rack.x + i * 8 }));
  const visuals = createTownSledVisuals(scene, depots);
  assert.equal(scene.children.length, 3);
  const [sled, depotsMesh, snow] = scene.children;
  assert.ok(sled instanceof InstancedMesh);
  assert.ok(depotsMesh instanceof InstancedMesh);
  assert.ok(snow instanceof Points);
  assert.equal(sled.name, 'town-local-sled');
  assert.equal(depotsMesh.name, 'town-sled-racks');
  assert.equal(depotsMesh.count, 12 * (sledDepotParts.length + 2 * sledParts.length));
  assert.ok(sled.count > 65);
  assert.ok(remoteSledParts.length < sledParts.length / 2, 'remote crowds must use reduced geometry');
  visuals.setPose(rack.x, rack.n, rack.y, 0);
  assert.equal(sled.visible, true);
  visuals.hide();
  assert.equal(sled.visible, false);
  visuals.update(.016);
  assert.equal(snow.visible, false);
});
