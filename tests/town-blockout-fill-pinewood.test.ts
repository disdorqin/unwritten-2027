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
const { mountTownFillPinewood, fillPinewoodClusters, PINEWOOD_RADII } = await import('../tools/voxel-tavern/town-blockout/town-fill-pinewood.ts');
const { fillNorthClusters, FILL_RADII } = await import('../tools/voxel-tavern/town-blockout/town-fill-north.ts');
const { fillB3Clusters, B3_RADII } = await import('../tools/voxel-tavern/town-blockout/town-fill-b3.ts');
const { isWater } = terrain;

test('ancient pinewood clears the town, keeps its distance, and the bridge meets the stream', () => {
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
  ];
  const byId = new Map(fillPinewoodClusters.map(c => [c.id, c]));
  assert.ok(byId.has('pw-king') && byId.has('pw-hollow') && byId.has('pw-bridge'), 'named pieces present');
  for (const cluster of fillPinewoodClusters) {
    const r = PINEWOOD_RADII[cluster.kind];
    const streamKind = cluster.kind === 'frozenStream' || cluster.kind === 'logBridge';
    if (streamKind) {
      assert.equal(isWater(cluster.east, cluster.north), true, `${cluster.id} must sit on the channel`);
    } else {
      assert.equal(blocked(cluster.east, cluster.north, r), false, `${cluster.id} blocked`);
      assert.equal(isWater(cluster.east, cluster.north), false, `${cluster.id} in water`);
    }
    for (const other of landed) {
      const d = Math.hypot(cluster.east - other.e, cluster.north - other.n);
      assert.ok(d >= r + other.r + 2, `${cluster.id} too close to landed ${other.id} (${d.toFixed(1)} m)`);
    }
  }
  // Bridge and stream share their crossing: bridge center within the
  // stream chain's span and on the same water.
  const bridge = byId.get('pw-bridge')!;
  const streamNs = fillPinewoodClusters.filter(c => c.kind === 'frozenStream').map(c => c.north);
  assert.ok(bridge.north > Math.min(...streamNs) && bridge.north < Math.max(...streamNs), 'bridge inside the stream span');
  const parent = new Group();
  const mounted = mountTownFillPinewood(parent, (e, n) => grid.heightAt(e, n));
  assert.equal(mounted.placed.length, fillPinewoodClusters.length);
  mounted.dispose();
});
