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
const { mountTownFillB3x, fillB3xClusters, B3X_RADII } = await import('../tools/voxel-tavern/town-blockout/town-fill-b3x.ts');
const { fillNorthClusters, FILL_RADII } = await import('../tools/voxel-tavern/town-blockout/town-fill-north.ts');
const { fillB3Clusters, B3_RADII } = await import('../tools/voxel-tavern/town-blockout/town-fill-b3.ts');
const { fillPinewoodClusters, PINEWOOD_RADII } = await import('../tools/voxel-tavern/town-blockout/town-fill-pinewood.ts');
const { isWater } = terrain;

test('fill-b3x menu items clear the town; the slide rides the frozen channel', () => {
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
  const blocked = (e: number, n: number, r: number) =>
    extensionRoadClearance(e, n, r) || extensionStreetClearance(e, n, r)
    || track.keepClear(e, n, r)
    || sampled(scenery.blocked, e, n, r) || sampled(district.blocked, e, n, r);
  const landed = [
    ...fillNorthClusters.map(c => ({ id: c.id, e: c.east, n: c.north, r: FILL_RADII[c.kind] })),
    ...fillB3Clusters.map(c => ({ id: c.id, e: c.east, n: c.north, r: B3_RADII[c.kind] })),
    ...fillPinewoodClusters.map(c => ({ id: c.id, e: c.east, n: c.north, r: PINEWOOD_RADII[c.kind] })),
  ];
  for (const cluster of fillB3xClusters) {
    const r = B3X_RADII[cluster.kind];
    assert.ok(cluster.touch.length > 0, `${cluster.id} has no registered interaction`);
    const onIce = cluster.kind === 'iceChute' || cluster.kind === 'chuteGate';
    assert.equal(blocked(cluster.east, cluster.north, r), false, `${cluster.id} blocked`);
    if (onIce) assert.equal(isWater(cluster.east, cluster.north), true, `${cluster.id} must ride the channel`);
    else assert.equal(isWater(cluster.east, cluster.north), false, `${cluster.id} in water`);
    for (const other of landed) {
      const d = Math.hypot(cluster.east - other.e, cluster.north - other.n);
      assert.ok(d >= r + other.r + 2, `${cluster.id} too close to landed ${other.id} (${d.toFixed(1)} m)`);
    }
  }
  const parent = new Group();
  const mounted = mountTownFillB3x(parent, (e, n) => grid.heightAt(e, n));
  assert.equal(mounted.placed.length, fillB3xClusters.length);
  assert.ok(mounted.group.children.length <= 11, 'merged draws exceed palette size');
  mounted.dispose();
});
