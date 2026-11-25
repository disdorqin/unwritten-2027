import assert from 'node:assert/strict';
import test from 'node:test';
const gradient = () => ({ addColorStop() {} });
const context = { createRadialGradient: gradient, createLinearGradient: gradient, fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, translate() {}, rotate() {}, measureText() { return { width: 1 }; } };
Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => context, width: 0, height: 0 }) } });
const { Group } = await import('three');
const terrain = await import('../tools/voxel-tavern/town-blockout/terrain.ts');
const { addScenery } = await import('../tools/voxel-tavern/town-blockout/scenery.ts');
const { addDistrictHousing } = await import('../tools/voxel-tavern/town-blockout/district-layout.ts');
const { createTownRailway } = await import('../tools/voxel-tavern/town-blockout/town-railway.ts');
const { extensionRoadClearance, extensionStreetClearance } = await import('../tools/voxel-tavern/town-blockout/town-extension.ts');
const { mountTownFillB3, fillB3Clusters, B3_RADII } = await import('../tools/voxel-tavern/town-blockout/town-fill-b3.ts');
const { isWater } = terrain;

test('fill-b3 slope clusters clear the assembled town, roads and the cable line', () => {
  const landscape = new Group();
  const grid = terrain.createTerrainGrid();
  const track = createTownRailway(grid);
  const scenery = addScenery(landscape, grid);
  const district = addDistrictHousing(landscape, grid, scenery.blocked, track.keepClear);
  const sampled = (fn: (x: number, n: number) => boolean, e: number, n: number, r: number) => {
    if (fn(e, n)) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (fn(e + Math.cos(a) * r * .7, n + Math.sin(a) * r * .7)) return true;
    }
    return false;
  };
  const segDist = (e: number, n: number, a: number[], b: number[]) => {
    const dx = b[0] - a[0], dn = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((e - a[0]) * dx + (n - a[1]) * dn) / (dx * dx + dn * dn)));
    return Math.hypot(e - (a[0] + t * dx), n - (a[1] + t * dn));
  };
  const blocked = (e: number, n: number, r: number) =>
    extensionRoadClearance(e, n, r) || extensionStreetClearance(e, n, r)
    || track.keepClear(e, n, r)
    || sampled(scenery.blocked, e, n, r) || sampled(district.blocked, e, n, r)
    || segDist(e, n, [526, 329], [440, 520]) < 10 || segDist(e, n, [440, 520], [336, 640]) < 10;
  for (const cluster of fillB3Clusters) {
    const r = B3_RADII[cluster.kind];
    assert.equal(blocked(cluster.east, cluster.north, r), false,
      `${cluster.id} blocked at ${cluster.east},${cluster.north} r=${r}`);
    assert.equal(isWater(cluster.east, cluster.north), false, `${cluster.id} in water`);
    assert.notEqual(grid.surfaces[Math.round(cluster.north) * grid.gridWidth + Math.round(cluster.east)], 4,
      `${cluster.id} on a type-4 surface`);
    // Four-band discipline: soil and camp traces stay in the foothill band.
    if (cluster.kind === 'soilPatch' || cluster.kind === 'campTrace' || cluster.kind === 'windShelter')
      assert.ok(cluster.north <= 560, `${cluster.id} leaks above the foothill band`);
    if (cluster.north >= 615)
      assert.ok(cluster.kind === 'rockSlope' || cluster.kind === 'driftSlope',
        `${cluster.id} puts non-snowfield vocabulary in the snowfield band`);
  }
  const parent = new Group();
  const mounted = mountTownFillB3(parent, (e, n) => grid.heightAt(e, n));
  assert.equal(mounted.placed.length, fillB3Clusters.length);
  mounted.dispose();
});
