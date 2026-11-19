import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Color, Group, InstancedMesh, Matrix4, Vector3 } from 'three';
import { addScenery } from '../tools/voxel-tavern/town-blockout/scenery.ts';
import { createTerrainGrid, layout, plazaCoreBounds, plazaPavingAllowed } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createSnowballSweep } from '../tools/voxel-tavern/town-blockout/town-snowball-world.ts';

function mockCanvas(t: TestContext) {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => ({
      createRadialGradient: () => ({ addColorStop() {} }),
      fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
    }) }) },
  });
  t.after(() => {
    if (before) Object.defineProperty(globalThis, 'document', before);
    else Reflect.deleteProperty(globalThis, 'document');
  });
}

test('P21 keeps two one-metre snow covers and leaves the main walking line open', t => {
  mockCanvas(t);
  const grid = createTerrainGrid();
  const scenery = addScenery(new Group(), grid);
  assert.deepEqual(scenery.plazaCoverBoxes, [
    { min: [238.5, 12, -199.05], max: [241.5, 13, -198.55] },
    { min: [238.5, 12, -166.25], max: [241.5, 13, -165.75] },
  ]);
  const sweep = createSnowballSweep({
    geometryAt: () => ({ colliders: scenery.plazaCoverBoxes, floors: [] }),
    surfaceHeight: grid.heightAt,
    occupiedAt: (east, north) => scenery.blocked(east, north),
    targets: [],
  });
  for (const north of [198.8, 166]) {
    assert.equal(scenery.plazaCoverBlocks(240, north, .27), true);
    assert.equal(scenery.plazaCoverBlocks(226, north, .27), false);
    assert.equal(scenery.plazaCoverBlocks(237.9, north, .27), false);
    assert.equal(scenery.plazaCoverBlocks(242.1, north, .27), false);
    const shot = (height: number) => sweep(
      new Vector3(240, height, -north + .34), new Vector3(240, height, -north - .34), .055,
    );
    assert.equal(shot(12.8)?.kind, 'world');
    assert.equal(shot(13.3), undefined);
  }
});

test('phase-three plaza paving preserves the core stone colors, protects cuts and stops at the station edge', t => {
  mockCanvas(t);
  const group = new Group();
  addScenery(group, createTerrainGrid());
  const batch = group.children.find(item => item instanceof InstancedMesh);
  assert.ok(batch);

  const colours = new Set(['87919d', 'aab3ba', '959daa', 'a3a7a7', '6f7887']);
  const [coreWest, coreSouth, coreEast] = plazaCoreBounds;
  const [west, south, east, north] = layout.plaza.bounds;
  const matrix = new Matrix4(), position = new Vector3(), size = new Vector3(), color = new Color();
  const zones = new Set<string>();
  let tiles = 0;
  for (let index = 0; index < batch.count; index++) {
    batch.getMatrixAt(index, matrix);
    position.setFromMatrixPosition(matrix);
    size.setFromMatrixScale(matrix);
    if (Math.abs(size.y - .085) > 1e-6 || Math.abs(position.y - 11.975) > 1e-6) continue;
    tiles++;
    const x = position.x, n = -position.z;
    assert.ok(x - size.x / 2 >= west && x + size.x / 2 <= east && n - size.z / 2 >= south && n + size.z / 2 <= north);
    assert.ok(plazaPavingAllowed(x, n, Math.hypot(size.x, size.z) / 2), `paving over a cut at ${x}, ${n}`);
    const zone = x < coreWest ? 'west' : x > coreEast ? 'east' : n < coreSouth ? 'south' : 'core';
    zones.add(zone);
    if (zone !== 'core' || x < 219 || x > 229) {
      batch.getColorAt(index, color);
      assert.ok(colours.has(color.getHexString()));
    }
  }
  assert.deepEqual([...zones].sort(), ['core', 'east', 'south', 'west']);
  t.diagnostic(`checked ${tiles} actual paver matrices across the original plaza and the three annex bands`);
});
