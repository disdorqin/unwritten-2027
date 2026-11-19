import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InstancedMesh, Mesh } from 'three';
import { buildMarketLandmark, marketOxSite } from '../tools/voxel-tavern/town-blockout/landmark-market.ts';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import {
  marketStallLayouts, marketStallLocalPoint,
} from '../tools/voxel-tavern/town-blockout/market-stall-layout.ts';
import { canEnter, createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';

test('market geometry keeps the old stalls and produces all seventeen kinds and row counts', t => {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        fillRect() {}, strokeRect() {}, drawImage() {}, fillText() {},
        createLinearGradient: () => ({ addColorStop() {} }),
      }),
    }),
  } as unknown as Document;
  t.after(() => {
    if (originalDocument) globalThis.document = originalDocument;
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const plot = layout.plots.find(item => item.id === 'market-stalls')!;
  const group = buildMarketLandmark(plot);
  group.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  const { colliders } = readWalkGeometry(group);
  const grid = createTerrainGrid();

  assert.equal(marketStallLayouts.length, 17);
  assert.deepEqual(group.userData.marketStallIds, marketStallLayouts.map(stall => stall.id));
  assert.equal(new Set(group.userData.marketStallIds).size, 17);
  assert.deepEqual(marketStallLayouts.slice(0, 4).map(({ id, x, z, width, canopy }) => [id, x, z, width, canopy]), [
    ['market-stall-0', -12.5, -4.8, 6.8, '#a1342d'],
    ['market-stall-1', -4.38, -4.4, 6.4, '#92562e'],
    ['market-stall-2', 4.25, -4.95, 6.7, '#8a312d'],
    ['market-stall-3', 12.4, -4.6, 6.55, '#2e6a67'],
  ]);
  const counts = (keys: string[]) => keys.reduce<Record<string, number>>(
    (result, key) => ({ ...result, [key]: (result[key] ?? 0) + 1 }), {},
  );
  assert.deepEqual(counts(marketStallLayouts.map(stall => stall.row)), { main: 5, east: 3, opposite: 5, north: 2, forecourt: 2 });
  assert.deepEqual(counts(marketStallLayouts.map(stall => stall.kind)), {
    糖葫芦: 2, 干果炒货: 2, 吃食: 2, 热饮: 3, 杂货: 2, '布匹/围巾': 2, 灯笼: 2, 春联年画: 1, '玩具/套圈': 1,
  });
  assert.equal(group.children.filter(child => child instanceof Mesh && child.name === 'Market stall shells').length, 1);
  assert.ok(group.children.filter(child => child instanceof InstancedMesh).length <= 6, 'loose parts are instanced per whole-street bucket');
  assert.deepEqual(group.userData.zodiacOx, marketOxSite);
  assert.equal(group.userData.marketDiningTables.length, 4);

  for (const stall of marketStallLayouts) {
    const [localX, localZ] = marketStallLocalPoint(stall, 0, 2.6);
    const x = plot.origin[0] + localX, n = plot.origin[1] - localZ, y = grid.heightAt(x, n);
    assert.ok(canEnter(x, n), stall.id);
    assert.ok(Math.abs(y - stall.counterGround) < .001, `${stall.id}: footing y=${y}`);
    assert.ok(!colliders.some(({ min, max }) =>
      x + .29 > min[0] && x - .29 < max[0] &&
      -n + .29 > min[2] && -n - .29 < max[2] && y + 1.65 > min[1] && y + .10 < max[1]), stall.id);
  }
  for (const { min, max } of colliders) {
    assert.ok(max[2] < -84, 'market obstacles must clear the south road');
    if (max[2] >= -95) assert.ok(max[0] <= 152.2 || min[0] >= 155.8, 'gate corridor must keep 3.6 m');
  }
});
