import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMuseumLandmark } from '../tools/voxel-tavern/town-blockout/landmark-museum.ts';
import { bridgeMouthKeepClear } from '../tools/voxel-tavern/town-blockout/road-clearance.ts';
import { addScenery } from '../tools/voxel-tavern/town-blockout/scenery.ts';
import { createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

test('eight bridge mouths reserve their full footprint and leave open approaches', () => {
  const group = buildMuseumLandmark();
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        getContext: () => ({
          createRadialGradient: () => ({ addColorStop() {} }),
          fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
        }),
      }),
    },
  });
  try {
    const scenery = addScenery(group, createTerrainGrid());
    for (const { id, west, east, north } of layout.bridges) {
      for (const [end, side] of [[west, -1], [east, 1]]) {
        assert.ok(bridgeMouthKeepClear(end, north + 3.49, 0), id);
        assert.ok(!bridgeMouthKeepClear(end, north + 3.51, 0), id);
        assert.ok(bridgeMouthKeepClear(end + side * 4.6, north, .2), id);
        for (const distance of [0, 1, 2]) {
          for (const offset of [-2, -1, 0, 1, 2]) {
            const x = end + side * distance;
            const n = north + offset;
            assert.ok(bridgeMouthKeepClear(x, n, 0), id);
            assert.ok(!scenery.blocked(x, n), `${id} scenery blocked at (${x}, ${n})`);
          }
        }
      }
    }
    assert.ok(!scenery.blocked(306, 152), 'southeast bridge east approach');
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
