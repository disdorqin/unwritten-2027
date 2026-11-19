import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Vector3 } from 'three';
import { addScenery } from '../tools/voxel-tavern/town-blockout/scenery.ts';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { createSnowballSweep } from '../tools/voxel-tavern/town-blockout/town-snowball-world.ts';

test('P21 keeps two one-metre snow covers and leaves the main walking line open', t => {
  const grid = createTerrainGrid();
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
