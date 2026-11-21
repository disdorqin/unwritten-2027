import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';
import { buildShankouNodeScenery } from '../tools/voxel-tavern/town-blockout/town-shankou-node-scenery';

const grid = createTerrainGrid();
const { group, sites } = buildShankouNodeScenery(grid);

test('shankou scenery: all four pieces stand at the surveyed node plots', () => {
  assert.deepEqual(sites.map(s => s.id),
    ['gate-arch', 'boundary-stone', 'guard-shelter', 'town-sign']);
  const byId = new Map(sites.map(s => [s.id, s]));
  assert.deepEqual([byId.get('gate-arch')!.east, byId.get('gate-arch')!.north], [306, 530]);
  assert.deepEqual([byId.get('boundary-stone')!.east, byId.get('boundary-stone')!.north], [300.5, 527]);
  assert.deepEqual([byId.get('guard-shelter')!.east, byId.get('guard-shelter')!.north], [314, 522]);
  assert.deepEqual([byId.get('town-sign')!.east, byId.get('town-sign')!.north], [303, 492]);
  // Nothing stands on the rail portal stub (east <= 297 at the node's north edge)
  // or on the Shankou platform (north 502 +/- 8, east 289..303).
  for (const s of sites) {
    assert.ok(!(s.north > 515 && s.east < 299), `${s.id} intrudes on the portal stub`);
    assert.ok(!(Math.abs(s.north - 502) < 8 && s.east > 289 && s.east < 303),
      `${s.id} intrudes on the station platform`);
  }
});

test('shankou scenery: ledger stays scenery-sized and adds no real light', () => {
  let draws = 0, tris = 0, lights = 0;
  group.traverse(n => {
    const node = n as { isLight?: boolean; isMesh?: boolean; geometry?: { index: { count: number } | null; attributes: { position: { count: number } } } };
    if (node.isLight) lights++;
    if (node.isMesh && node.geometry) {
      draws++;
      tris += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    }
  });
  assert.ok(draws <= 10, `draws ${draws} over the scenery cap`);
  assert.ok(tris <= 8000, `tris ${Math.round(tris)} over the scenery cap`);
  assert.equal(lights, 0, 'scenery adds no real light source');
});
