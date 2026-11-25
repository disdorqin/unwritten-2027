import assert from 'node:assert/strict';
import test from 'node:test';
import { mainSummitBounds } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import {
  sampleTownD2R30Height, sampleTownD2R30Normal, townD2R30Anchors, townD2R30ChunkList,
  townD2R30LocalPoint, townD2R30LodSpacing, townD2R30Spec, townD2R30SurfaceBand, townD2R30WorldPoint,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

test('D2-R01 contract preserves canonical domain, plateau, shoulders and gate', () => {
  assert.equal(townD2R30Spec.width, 2_200);
  assert.equal(townD2R30Spec.depth, 1_800);
  assert.equal(townD2R30Spec.summitHeight, 800);
  assert.equal(sampleTownD2R30Height(50, 1_000), 800);
  assert.equal(sampleTownD2R30Height(-550, 900), 560);
  assert.equal(sampleTownD2R30Height(590, 1_080), 610);
  for (let east = -30; east <= 30; east += 5) {
    for (let north = -10; north <= 40; north += 5) assert.equal(sampleTownD2R30Height(east, north), 347);
  }
  assert.equal(sampleTownD2R30Height(mainSummitBounds.west - .01, 0), undefined);
  assert.equal(sampleTownD2R30Height(0, mainSummitBounds.north + .01), undefined);
  assert.equal(sampleTownD2R30Height(NaN, 0), undefined);
});

test('D2-R01 height field is continuous on all four sides and has real gullies', () => {
  const { west, east, south, north } = mainSummitBounds;
  const probes = [
    [west, 900], [east, 900], [900, south], [900, north],
    [-900, 1_500], [900, 1_500], [-900, 200], [900, 200],
  ] as const;
  for (const [east, north] of probes) {
    const height = sampleTownD2R30Height(east, north)!;
    assert.ok(height >= 150 && height <= 800, `${east},${north}: ${height}`);
    assert.ok(sampleTownD2R30Height(east - .01, north)! >= 150 || east === west);
    assert.ok(sampleTownD2R30Height(east + .01, north)! >= 150 || east === east);
  }
  for (const valley of townD2R30Anchors.valleys) {
    const centre = sampleTownD2R30Height(valley.east, valley.north)!;
    const across = 55;
    const left = sampleTownD2R30Height(
      valley.east - Math.sin(valley.heading) * across,
      valley.north + Math.cos(valley.heading) * across,
    )!;
    const right = sampleTownD2R30Height(
      valley.east + Math.sin(valley.heading) * across,
      valley.north - Math.cos(valley.heading) * across,
    )!;
    assert.ok(centre < Math.min(left, right) - 4, `${valley.id} must cut below both banks`);
  }
});

test('D2-R01 normals, surface bands and coordinate transform remain finite and reversible', () => {
  for (const point of [{ east: -700, north: 400 }, { east: 50, north: 1_000 }, { east: 700, north: 1_300 }]) {
    const height = sampleTownD2R30Height(point.east, point.north)!;
    const normal = sampleTownD2R30Normal(point.east, point.north);
    assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-9);
    assert.ok(townD2R30SurfaceBand(point.east, point.north).length > 0);
    const world = townD2R30WorldPoint({ ...point, height });
    assert.deepEqual(world, { east: point.east + 300, north: point.north + 676, height });
    assert.deepEqual(townD2R30LocalPoint(world), { ...point, height });
  }
});

test('D2-R01 render chunks cover the full extent without overlap or holes', () => {
  assert.equal(townD2R30ChunkList.length, 72);
  assert.equal(townD2R30ChunkList[0]!.west, mainSummitBounds.west);
  assert.equal(townD2R30ChunkList[0]!.south, mainSummitBounds.south);
  assert.equal(townD2R30ChunkList.at(-1)!.east, mainSummitBounds.east);
  assert.equal(townD2R30ChunkList.at(-1)!.north, mainSummitBounds.north);
  const area = townD2R30ChunkList.reduce((sum, chunk) =>
    sum + (chunk.east - chunk.west) * (chunk.north - chunk.south), 0);
  assert.equal(area, 2_200 * 1_800);
  assert.equal(new Set(townD2R30ChunkList.map(chunk => chunk.key)).size, townD2R30ChunkList.length);
  assert.deepEqual(
    [0, 320, 321, 640, 641, 1_100, 1_101].map(townD2R30LodSpacing),
    [8, 8, 16, 16, 32, 32, 64],
  );
});
